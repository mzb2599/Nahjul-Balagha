import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)

SourceResolver = Callable[[dict[str, Any]], dict[str, Any] | None]


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

    results = store.search(embeddings.embed_query(query), limit=limit)
    passages: list[str] = []
    for rank, result in enumerate(results, start=1):
        payload = result.payload or {}
        text = payload.get("text", "").strip()
        if not text:
            continue
        page = payload.get("page", "unknown")
        logger.info(
            "Retrieved passage %d: score=%.3f page=%s excerpt=%s",
            rank,
            result.score,
            page,
            text[:180].replace("\n", " "),
        )
        passages.append(f"[Passage {rank}; page {page}]\n{text}")

    if not passages:
        return {
            "answer": "No passages were retrieved from the indexed book. Use --index to index the PDF first.",
            "sources": [],
        }

    context_block = (
        f"\nREADER CONTEXT:\n{context}\n"
        "Use this only to interpret the question; ground the answer in the excerpts.\n"
        if context
        else ""
    )

    prompt = f"""You answer questions using only the supplied excerpts from Nahjul Balagha.
The book may express an idea without using the exact words in the question. Consider
related concepts, examples, advice, and implications in the excerpts. Do not invent
claims. Cite the excerpt page numbers for supported points. If the excerpts do not
meaningfully address the question, say that the retrieved context is insufficient.
{context_block}
EXCERPTS:
{chr(10).join(passages)}

QUESTION:
{query}
"""
    response = model.generate_content(prompt)
    answer = getattr(response, "text", None)
    if not answer:
        raise RuntimeError("Gemini returned an empty response.")
    sources = []
    for result in results:
        payload = result.payload or {}
        if not payload.get("text", "").strip():
            continue
        source = {
            "page": payload.get("page"),
            "text": payload.get("text", ""),
            "score": result.score,
        }
        if source_resolver is not None:
            resolved = source_resolver(payload)
            if resolved:
                source.update(resolved)
        sources.append(source)
    return {"answer": answer.strip(), "sources": sources}
