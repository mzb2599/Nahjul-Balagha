import logging
import re
from typing import Any, Callable

logger = logging.getLogger(__name__)

SourceResolver = Callable[[dict[str, Any]], dict[str, Any] | None]

MAX_LIMIT = 12
MAX_PASSAGE_CHARS = 1800

# Retrieve a wider candidate pool than we show the model, then rerank. Dense
# search alone often returns several near-duplicate overlapping chunks and can
# miss exact terms, so we combine the vector score with query-term coverage and
# reader context.
MAX_CANDIDATES = 40
LEXICAL_WEIGHT = 0.22
TOPIC_BOOST = 0.12
SECTION_BOOST = 0.04
MIN_SCORE = 0.05
DEFAULT_PER_TOPIC = 2

_TOKEN_RE = re.compile(r"[a-z0-9']+")
_DEICTIC_RE = re.compile(
    r"\b(this|that|these|those|here|above|passage|topic|sermon|letter|saying|"
    r"it|its|he|him|his)\b",
    re.IGNORECASE,
)
_STOPWORDS = frozenset(
    {
        "a", "about", "after", "again", "all", "also", "am", "an", "and", "any",
        "are", "as", "at", "be", "because", "been", "before", "being", "book",
        "but", "by", "can", "could", "did", "do", "does", "doing", "done", "for",
        "from", "had", "has", "have", "having", "he", "her", "here", "him", "his",
        "how", "i", "if", "in", "into", "is", "it", "its", "just", "me", "more",
        "most", "my", "no", "not", "of", "on", "one", "only", "or", "other", "our",
        "out", "over", "said", "same", "say", "says", "she", "should", "so", "some",
        "such", "than", "that", "the", "their", "them", "then", "there", "these",
        "they", "this", "those", "through", "to", "too", "under", "up", "us", "very",
        "was", "we", "were", "what", "when", "where", "which", "while", "who", "why",
        "will", "with", "would", "you", "your",
    }
)


def _terms(text: str) -> set[str]:
    return {
        token
        for token in _TOKEN_RE.findall(text.lower())
        if len(token) > 2 and token not in _STOPWORDS
    }


def _lexical_coverage(query_terms: set[str], passage_terms: set[str]) -> float:
    """Share of the query's meaningful words that appear in a passage."""
    if not query_terms or not passage_terms:
        return 0.0
    return len(query_terms & passage_terms) / len(query_terms)


def _near_duplicate(left: set[str], right: set[str]) -> bool:
    """True when one passage's vocabulary is mostly contained in the other."""
    if not left or not right:
        return False
    smaller, larger = (left, right) if len(left) <= len(right) else (right, left)
    return len(smaller & larger) / len(smaller) >= 0.9


def _candidate_limit(limit: int) -> int:
    return min(MAX_CANDIDATES, max(limit * 4, limit + 12))


def _retrieval_text(query: str, context: str | None) -> str:
    """Use reader context only when the question depends on it.

    General questions ("What is wisdom?") embed better on their own; deictic or
    very short questions ("summarize this") need the current topic to retrieve
    the right passage.
    """
    if not context:
        return query
    if len(query.split()) <= 8 or _DEICTIC_RE.search(query):
        return f"{context}\n{query}"
    return query


def _rank_candidates(
    results: list[Any],
    query_terms: set[str],
    *,
    limit: int,
    section_id: int | None,
    topic_id: str | None,
    source_resolver: SourceResolver | None,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for result in results:
        payload = result.payload or {}
        text = payload.get("text", "").strip()
        if not text:
            continue

        source: dict[str, Any] = {
            "page": payload.get("page"),
            "text": text,
            "score": float(result.score or 0.0),
        }
        # Newer indexes already store section metadata; the resolver fills it
        # in for collections indexed before that metadata existed.
        for key in ("sectionId", "topicId", "label", "section"):
            if payload.get(key) is not None:
                source[key] = payload[key]
        if source_resolver is not None:
            resolved = source_resolver(payload)
            if resolved:
                source.update(resolved)

        passage_terms = _terms(text)
        lexical = _lexical_coverage(query_terms, passage_terms)
        score = float(result.score or 0.0) + LEXICAL_WEIGHT * lexical
        if topic_id and source.get("topicId") == topic_id:
            score += TOPIC_BOOST
        elif section_id and source.get("sectionId") == section_id:
            score += SECTION_BOOST

        candidates.append(
            {
                "source": source,
                "text": text,
                "terms": passage_terms,
                "score": score,
                "topicKey": source.get("topicId") or text[:200],
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)

    selected: list[dict[str, Any]] = []
    selected_ids: set[int] = set()
    topic_counts: dict[str, int] = {}
    per_topic = limit if topic_id else DEFAULT_PER_TOPIC

    def try_select(candidate: dict[str, Any], respect_topic_cap: bool) -> bool:
        if candidate["score"] < MIN_SCORE:
            return False
        key = candidate["topicKey"]
        if respect_topic_cap and topic_counts.get(key, 0) >= per_topic:
            return False
        if any(_near_duplicate(candidate["terms"], item["terms"]) for item in selected):
            return False
        selected.append(candidate)
        selected_ids.add(id(candidate))
        topic_counts[key] = topic_counts.get(key, 0) + 1
        return len(selected) >= limit

    for candidate in candidates:
        if try_select(candidate, respect_topic_cap=True):
            break

    # If diversity limits left us short, fill from the remaining strongest
    # candidates without repeating near-identical text.
    if len(selected) < limit:
        for candidate in candidates:
            if id(candidate) in selected_ids:
                continue
            if try_select(candidate, respect_topic_cap=False):
                break

    return selected


def answer_query(
    query: str,
    embeddings: Any,
    store: Any,
    model: Any,
    limit: int = 8,
    context: str | None = None,
    section_id: int | None = None,
    topic_id: str | None = None,
    source_resolver: SourceResolver | None = None,
) -> dict[str, Any]:
    query = query.strip()
    if not query:
        raise ValueError("Query must not be empty.")

    limit = max(1, min(int(limit), MAX_LIMIT))
    query_terms = _terms(query)

    # Reader context helps short, deictic questions ("summarize this",
    # "what does it mean here") retrieve the right part of the book.
    retrieval_text = _retrieval_text(query, context)
    results = store.search(
        embeddings.embed_query(retrieval_text),
        limit=_candidate_limit(limit),
    )

    ranked = _rank_candidates(
        results,
        query_terms,
        limit=limit,
        section_id=section_id,
        topic_id=topic_id,
        source_resolver=source_resolver,
    )

    passages: list[str] = []
    sources: list[dict[str, Any]] = []
    for rank, candidate in enumerate(ranked, start=1):
        source = candidate["source"]
        text = candidate["text"]
        source["score"] = round(candidate["score"], 4)

        page = source.get("page", "unknown")
        label = source.get("label")
        heading = f"[Passage {rank}; printed page {page}"
        heading += f" — {label}]" if label else "]"
        logger.info(
            "Retrieved passage %d: score=%.3f page=%s excerpt=%s",
            rank,
            candidate["score"],
            page,
            text[:180].replace("\n", " "),
        )
        passages.append(f"{heading}\n{text[:MAX_PASSAGE_CHARS]}")
        sources.append(source)

    if not passages:
        return {
            "answer": (
                "No sufficiently relevant passages were found in the indexed book. "
                "Try rephrasing the question, or run `python main.py --index` if the "
                "index has not been built yet."
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
Excerpts may overlap: synthesize them into one coherent answer instead of repeating
the same idea. Prefer the most directly relevant excerpts and ignore loosely related ones.
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
