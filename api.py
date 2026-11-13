from contextlib import asynccontextmanager
from collections import OrderedDict
from functools import lru_cache
import logging
import os
import threading
import time
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from book_reader import (
    MAX_PAGE_SIZE,
    SECTION_META,
    SECTION_SOURCES,
    get_entry,
    get_section_entries,
    get_topic,
    get_topic_details,
    initial_bundle,
    list_entries,
    list_topics,
    resolve_pdf_page,
    section_overview,
    topic_page,
)
from config import get_settings
from embeddings import GeminiEmbeddings
from gemini_client import create_gemini_model
from qdrant_store import QdrantStore, QdrantUnavailableError
from rag import answer_query
from resilience import is_transient

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the RAG services and the parsed book in the background so the first
    # reader/Ask request does not pay for cold construction or a PDF parse
    # (important on Render cold starts).
    threading.Thread(target=_warm_up_services, name="rag-warmup", daemon=True).start()
    threading.Thread(target=_warm_up_book, name="book-warmup", daemon=True).start()
    yield


app = FastAPI(title="Nahjul Balagha AI", version="1.0.0", lifespan=lifespan)
cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,https://mzb2599.github.io",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


def _request_hosts(request: Request) -> set[str]:
    host_header = request.headers.get("host", "").split(":", 1)[0].lower().strip("[]")
    origin_header = request.headers.get("origin", "")
    origin_host = (urlparse(origin_header).hostname or "").strip("[]").lower()
    forwarded_host = request.headers.get("x-forwarded-host", "")
    forwarded_host = forwarded_host.split(",", 1)[0].split(":", 1)[0].lower().strip("[]") if forwarded_host else ""
    client_host = (request.client.host or "").strip("[]").lower() if request.client else ""
    return {host for host in (host_header, origin_host, forwarded_host, client_host) if host}


@app.middleware("http")
async def restrict_private_access(request: Request, call_next):
    settings = get_settings()
    if settings.allow_public_api:
        return await call_next(request)

    request_hosts = _request_hosts(request)
    allowed_hosts = {host.lower() for host in settings.allowed_hosts}
    if request_hosts and request_hosts.issubset(allowed_hosts):
        return await call_next(request)

    return JSONResponse(
        status_code=403,
        content={
            "detail": "This API is configured for internal/private use only. Set ALLOW_PUBLIC_API=true to allow public access.",
        },
    )


BOOK_CACHE_PATHS = ("/api/sections", "/api/topics", "/api/bootstrap")


@app.middleware("http")
async def cache_book_reads(request: Request, call_next):
    """Let browsers reuse the parsed book across reloads and navigations."""
    response = await call_next(request)
    if (
        request.method == "GET"
        and response.status_code == 200
        and request.url.path.startswith(BOOK_CACHE_PATHS)
    ):
        response.headers.setdefault(
            "Cache-Control",
            "public, max-age=300, stale-while-revalidate=86400",
        )
    return response


class AskRequest(BaseModel):
    question: str | None = Field(default=None, max_length=2000)
    query: str | None = Field(default=None, max_length=2000)
    sectionId: int | None = None
    topicId: str | None = None

    def resolved_question(self) -> str:
        return (self.question or self.query or "").strip()


def _reader_context(request: AskRequest) -> str | None:
    if request.topicId:
        topic = get_topic(request.topicId)
        if topic is not None:
            return (
                f"The reader is currently reading {topic['title']} "
                f"in the {topic['section']} section (printed page {topic['page']})."
            )

    if request.sectionId is not None:
        for slug, meta in SECTION_META.items():
            if meta["id"] == request.sectionId:
                return (
                    f"The reader is currently browsing the {meta['title']} "
                    "section of the book."
                )
    return None


def _resolve_source(payload: dict) -> dict | None:
    page = payload.get("page")
    if not isinstance(page, int):
        return None
    try:
        return resolve_pdf_page(page)
    except (FileNotFoundError, OSError, ValueError):
        return None


@lru_cache(maxsize=1)
def get_rag_services():
    settings = get_settings()
    return (
        GeminiEmbeddings(
            settings.embedding_model,
            settings.gemini_api_key,
            settings.vector_size,
            timeout_seconds=settings.gemini_timeout_seconds,
            max_retries=settings.gemini_max_retries,
        ),
        QdrantStore(settings),
        create_gemini_model(settings),
    )


def _warm_up_services() -> None:
    try:
        _, store, _ = get_rag_services()
        logger.info("RAG warm-up complete; %d indexed passages.", store.count())
    except Exception:
        logger.warning(
            "RAG warm-up failed; the first Ask request will retry.", exc_info=True
        )


# Counts and answers change rarely (the book index is static), so avoid an
# extra Qdrant round trip on every question and reuse recent identical answers.
_INDEX_CHECK_TTL_SECONDS = 30.0
_INDEX_RECHECK_SECONDS = 5.0
_ANSWER_CACHE_TTL_SECONDS = 600.0
_ANSWER_CACHE_MAX_ENTRIES = 64

_index_state_lock = threading.Lock()
_index_checked_until = 0.0
_index_ready = False

_answer_cache: OrderedDict[
    tuple[str, int | None, str | None, int], tuple[float, dict]
] = OrderedDict()
_answer_cache_lock = threading.Lock()


def _index_available(store: Any) -> bool:
    global _index_checked_until, _index_ready

    now = time.monotonic()
    with _index_state_lock:
        if now < _index_checked_until:
            return _index_ready

    ready = store.count() > 0
    with _index_state_lock:
        _index_checked_until = time.monotonic() + (
            _INDEX_CHECK_TTL_SECONDS if ready else _INDEX_RECHECK_SECONDS
        )
        _index_ready = ready
    return ready


def _cached_answer(key: tuple[str, int | None, str | None, int]) -> dict | None:
    now = time.monotonic()
    with _answer_cache_lock:
        entry = _answer_cache.get(key)
        if entry is None:
            return None
        expires, value = entry
        if expires <= now:
            _answer_cache.pop(key, None)
            return None
        _answer_cache.move_to_end(key)
        return value


def _store_answer(
    key: tuple[str, int | None, str | None, int], value: dict
) -> None:
    with _answer_cache_lock:
        _answer_cache[key] = (time.monotonic() + _ANSWER_CACHE_TTL_SECONDS, value)
        _answer_cache.move_to_end(key)
        while len(_answer_cache) > _ANSWER_CACHE_MAX_ENTRIES:
            _answer_cache.popitem(last=False)


def _warm_up_book() -> None:
    """Parse each collection once so the first section request is cheap."""
    try:
        for slug in SECTION_SOURCES:
            entries = get_section_entries(slug)
            logger.info("Book warm-up: %s parsed (%d entries).", slug, len(entries))
    except Exception:
        logger.warning(
            "Book warm-up failed; the first reader request will retry.", exc_info=True
        )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/sections")
def get_sections():
    return {"sections": section_overview()}


@app.get("/api/bootstrap")
def get_bootstrap(
    page_size: int = Query(12, ge=1, le=MAX_PAGE_SIZE),
    detail_count: int = Query(4, ge=0, le=24),
):
    """Sections plus the first page of every collection for instant opening."""
    try:
        return initial_bundle(page_size=page_size, detail_count=detail_count)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/sections/{section}/topics")
def get_section_topics(
    section: str,
    offset: int = Query(0, ge=0),
    limit: int | None = Query(None, ge=1, le=MAX_PAGE_SIZE),
):
    if section not in SECTION_SOURCES:
        raise HTTPException(status_code=404, detail="Book section not found.")
    try:
        if limit is None:
            topics = list_topics(section, offset=offset)
            total = len(get_section_entries(section))
            page = {
                "topics": topics,
                "total": total,
                "offset": offset,
                "limit": None,
                "hasMore": False,
                "nextOffset": None,
            }
        else:
            page = topic_page(section, offset=offset, limit=limit)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    meta = SECTION_META[section]
    return {
        "section": {
            "id": meta["id"],
            "slug": section,
            "title": meta["title"],
            "color": meta["color"],
            "g1": meta["g1"],
            "g2": meta["g2"],
        },
        "count": page["total"],
        "topics": page["topics"],
        "total": page["total"],
        "offset": page["offset"],
        "limit": page["limit"],
        "hasMore": page["hasMore"],
        "nextOffset": page["nextOffset"],
    }


@app.get("/api/topics")
def get_book_topics(
    ids: str = Query(..., description="Comma-separated topic ids, e.g. 1-1,1-2"),
):
    """Batched topic details used to pre-warm the reader before a click."""
    topic_ids = [part.strip() for part in ids.split(",") if part.strip()][:50]
    try:
        details = get_topic_details(topic_ids)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"topics": details}


@app.get("/api/topics/{topic_id}")
def get_book_topic(topic_id: str):
    try:
        topic = get_topic(topic_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if topic is None:
        raise HTTPException(status_code=404, detail="Book topic not found.")
    return topic


@app.get("/api/book/sections/{section}")
def get_book_section(section: str):
    if section not in SECTION_SOURCES:
        raise HTTPException(status_code=404, detail="Book section not found.")
    try:
        entries = list_entries(section)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {
        "section": SECTION_SOURCES[section].title,
        "count": len(entries),
        "entries": entries,
    }


@app.get("/api/book/sections/{section}/entries/{number}")
def get_book_section_entry(section: str, number: int):
    if section not in SECTION_SOURCES:
        raise HTTPException(status_code=404, detail="Book section not found.")
    try:
        entry = get_entry(section, number)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if entry is None:
        raise HTTPException(status_code=404, detail="Book entry not found.")
    return {
        "section": section,
        "number": entry.number,
        "title": entry.title,
        "page": entry.page,
        "text": entry.text,
    }


@app.post("/api/ask")
def ask(request: AskRequest):
    question = request.resolved_question()
    if not question:
        raise HTTPException(status_code=422, detail="A question is required.")
    settings = get_settings()
    started = time.perf_counter()

    cache_key = (
        " ".join(question.lower().split()),
        request.sectionId,
        request.topicId,
        settings.answer_limit,
    )
    cached = _cached_answer(cache_key)
    if cached is not None:
        logger.info("Answered question from cache in %.3fs.", time.perf_counter() - started)
        return cached

    try:
        embeddings, store, model = get_rag_services()
        if not _index_available(store):
            raise HTTPException(
                status_code=503,
                detail="The book index is empty. Run `python main.py --index` first.",
            )
        result = answer_query(
            question,
            embeddings,
            store,
            model,
            limit=settings.answer_limit,
            context=_reader_context(request),
            section_id=request.sectionId,
            topic_id=request.topicId,
            source_resolver=_resolve_source,
        )
        _store_answer(cache_key, result)
        logger.info(
            "Answered question in %.1fs with %d sources.",
            time.perf_counter() - started,
            len(result.get("sources", [])),
        )
        return result
    except HTTPException:
        raise
    except QdrantUnavailableError as error:
        logger.exception(
            "Qdrant unavailable after %.1fs", time.perf_counter() - started
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "The book database is unavailable. The server's Qdrant cluster may "
                "be paused, deleted, or misconfigured. Please try again later."
            ),
            headers={"Retry-After": "30"},
        ) from error
    except Exception as error:
        logger.exception("Ask request failed after %.1fs", time.perf_counter() - started)
        public = settings.allow_public_api
        if is_transient(error):
            raise HTTPException(
                status_code=503,
                detail=(
                    "The answer service is temporarily unavailable. Please try again "
                    "in a few seconds."
                    if public
                    else f"Temporary upstream error: {error}"
                ),
                headers={"Retry-After": "5"},
            ) from error
        raise HTTPException(
            status_code=500,
            detail=(
                "The answer service failed. Please try again."
                if public
                else str(error)
            ),
        ) from error
