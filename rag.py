import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

SourceResolver = Callable[[dict[str, Any]], dict[str, Any] | None]

MAX_LIMIT = 12
MAX_PASSAGE_CHARS = 1800


def answer_query(
    query: str,
    embeddings: Any,
    store: Any,
    model: Any,
    limit: int = 8,
    context: str | None = None,
    source_resolver: SourceResolver | None = None,
) -> dict[str, Any]:
    query = query.strip()
    if not query:
        raise ValueError("Query must not be empty.")

    limit = max(1, min(int(limit), MAX_LIMIT))
    results = store.search(embeddings.embed_query(query), limit=limit)

    passages: list[str] = []
    sources: list[dict[str, Any]] = []
    used_passages: set[str] = set()
    for result in results:
        payload = result.payload or {}
        text = payload.get("text", "").strip()
        if not text:
            continue
        # Overlapping chunks can surface the same passage twice; keep the best one.
        fingerprint = text[:200]
        if fingerprint in used_passages:
            continue
        used_passages.add(fingerprint)

        source = {
            "page": payload.get("page"),
            "text": text,
            "score": result.score,
        }
        if source_resolver is not None:
            resolved = source_resolver(payload)
            if resolved:
                source.update(resolved)

        rank = len(passages) + 1
        page = source.get("page", "unknown")
        label = source.get("label")
        heading = f"[Passage {rank}; printed page {page}"
        heading += f" — {label}]" if label else "]"
        logger.info(
            "Retrieved passage %d: score=%.3f page=%s excerpt=%s",
            rank,
            result.score,
            page,
            text[:180].replace("\n", " "),
        )
        passages.append(f"{heading}\n{text[:MAX_PASSAGE_CHARS]}")
        sources.append(source)

    if not passages:
        return {
            "answer": (
                "No passages were retrieved from the indexed book. "
                "Run `python main.py --index` to build the book index first."
            ),
            "sources": [],
        }

    context_block = (
        f"\nREADER CONTEXT:\n{context}\n"
        "Use this only to interpret the question; ground the answer in the excerpts.\n"
        if context
        else ""
    )

    prompt = f"""Answer the question using only the numbered excerpts below from Nahjul Balagha.
The book may express an idea without using the exact words in the question. Consider
related concepts, examples, advice, and implications in the excerpts. Do not invent
claims or outside sources. Cite the excerpt's printed page number for supported points,
for example (p. 412). If the excerpts do not meaningfully address the question, say
that the retrieved context is insufficient and briefly note what is missing.
{context_block}
EXCERPTS:
{chr(10).join(passages)}

QUESTION:
{query}
"""
    if hasattr(model, "generate_answer"):
        answer = model.generate_answer(prompt)
    else:
        response = model.generate_content(prompt)
        answer = (getattr(response, "text", None) or "").strip()
    if not answer:
        raise RuntimeError("Gemini returned an empty response.")
    return {"answer": answer.strip(), "sources": sources}
