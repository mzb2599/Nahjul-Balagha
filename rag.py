import logging
from typing import Any

logger = logging.getLogger(__name__)


def answer_query(
    query: str,
    embeddings: Any,
    store: Any,
    model: Any,
    limit: int = 8,
) -> str:
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
        return "No passages were retrieved from the indexed book. Use --index to index the PDF first."

    prompt = f"""You answer questions using only the supplied excerpts from Nahjul Balagha.
The book may express an idea without using the exact words in the question. Consider
related concepts, examples, advice, and implications in the excerpts. Do not invent
claims. Cite the excerpt page numbers for supported points. If the excerpts do not
meaningfully address the question, say that the retrieved context is insufficient.

EXCERPTS:
{chr(10).join(passages)}

QUESTION:
{query}
"""
    response = model.generate_content(prompt)
    answer = getattr(response, "text", None)
    if not answer:
        raise RuntimeError("Gemini returned an empty response.")
    return answer.strip()
