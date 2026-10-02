from functools import lru_cache
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from book_reader import SECTION_SOURCES, get_entry, list_entries
from config import get_settings
from embeddings import LocalEmbeddings
from gemini_client import create_gemini_model
from qdrant_store import QdrantStore
from rag import answer_query

app = FastAPI(title="Nahjul Balagha AI", version="1.0.0")


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


class AskRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)


@lru_cache(maxsize=1)
def get_rag_services():
    settings = get_settings()
    return (
        LocalEmbeddings(settings.embedding_model),
        QdrantStore(settings),
        create_gemini_model(settings),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


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
    try:
        embeddings, store, model = get_rag_services()
        if store.count() == 0:
            raise HTTPException(
                status_code=503,
                detail="The book index is empty. Run `python main.py --index` first.",
            )
        return answer_query(request.query, embeddings, store, model)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
