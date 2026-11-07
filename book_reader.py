from bisect import bisect_right
from dataclasses import dataclass
from threading import Lock
import re
from typing import Any

from pypdf import PdfReader

from config import get_pdf_path


@dataclass(frozen=True)
class SectionSource:
    title: str
    first_pdf_page: int
    last_pdf_page: int
    heading_pattern: re.Pattern[str]
    label_group: int
    number_group: int
    maximum_number: int


@dataclass(frozen=True)
class BookEntry:
    label: str
    number: int
    page: int
    text: str

    @property
    def title(self) -> str:
        return f"{self.label} {self.number}"

    @property
    def excerpt(self) -> str:
        return " ".join(self.text.split())[:220]


SECTION_SOURCES = {
    "sermons": SectionSource(
        "Sermons",
        324,
        732,
        re.compile(r"(?m)^\s*(Sermon)\s+(\d{1,3})\s*$", re.IGNORECASE),
        1,
        2,
        239,
    ),
    "letters": SectionSource(
        "Letters",
        733,
        852,
        re.compile(
            r"(?m)^\s*(Letter|Document|Instruction|Will|Commandment)\s*(\d{1,2})\b",
            re.IGNORECASE,
        ),
        1,
        2,
        79,
    ),
    "sayings": SectionSource(
        "Sayings",
        853,
        959,
        re.compile(r"(?m)^\s*(\d{1,3})\.\s+"),
        0,
        1,
        489,
    ),
}

# Section identity used by the Sage UI. The palette follows the design document:
# dawn amber for sermons, deep teal for letters, and violet starlight for sayings.
SECTION_META: dict[str, dict[str, Any]] = {
    "sermons": {
        "id": 1,
        "title": "Sermons",
        "description": (
            "Public addresses on God, justice, leadership, and the human condition."
        ),
        "color": "#f5a524",
        "g1": "#ffb347",
        "g2": "#b45309",
    },
    "letters": {
        "id": 2,
        "title": "Letters",
        "description": (
            "Letters and instructions written to rulers, governors, and companions."
        ),
        "color": "#14919b",
        "g1": "#19a7b0",
        "g2": "#0b3c49",
    },
    "sayings": {
        "id": 3,
        "title": "Sayings",
        "description": (
            "Short, concentrated wisdom on character, knowledge, and the world."
        ),
        "color": "#7c6cf0",
        "g1": "#8b7cf6",
        "g2": "#2a1f7a",
    },
}

SECTION_SLUG_BY_ID = {meta["id"]: slug for slug, meta in SECTION_META.items()}

# Pagination defaults for the paginated topic endpoints. The first page is served
# by /api/bootstrap so the UI never waits on a cold PDF parse when a collection is
# opened, and the rest is streamed in as the reader scrolls.
DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 100
DEFAULT_PREFETCH_DETAILS = 4


def _clean_entry_text(text: str) -> str:
    lines = text.splitlines()
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(
        line.rstrip()
        for line in lines
        if not re.fullmatch(r"\s*\d{1,3}\s*", line)
    ).strip()


_ENTRY_CACHE: dict[str, tuple[BookEntry, ...]] = {}
_SECTION_LOCKS = {slug: Lock() for slug in SECTION_SOURCES}


def get_section_entries(section: str) -> tuple[BookEntry, ...]:
    """Parse a collection once, even when warm-up and a request race."""
    cached = _ENTRY_CACHE.get(section)
    if cached is not None:
        return cached

    with _SECTION_LOCKS[section]:
        cached = _ENTRY_CACHE.get(section)
        if cached is None:
            cached = _parse_section_entries(section)
            _ENTRY_CACHE[section] = cached
        return cached


def _parse_section_entries(section: str) -> tuple[BookEntry, ...]:
    source = SECTION_SOURCES[section]
    pdf_path = get_pdf_path()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"Book PDF not found: {pdf_path}")

    reader = PdfReader(str(pdf_path))
    page_texts = [
        reader.pages[page_number - 1].extract_text() or ""
        for page_number in range(source.first_pdf_page, source.last_pdf_page + 1)
    ]
    page_starts: list[int] = []
    combined_parts: list[str] = []
    length = 0
    for page_text in page_texts:
        page_starts.append(length)
        combined_parts.append(page_text)
        length += len(page_text) + 2
    combined_text = "\n\n".join(combined_parts)

    matches = []
    seen_numbers: set[int] = set()
    for match in source.heading_pattern.finditer(combined_text):
        number = int(match.group(source.number_group))
        if not 1 <= number <= source.maximum_number or number in seen_numbers:
            continue
        seen_numbers.add(number)
        label = (
            match.group(source.label_group).capitalize()
            if source.label_group
            else "Saying"
        )
        matches.append((number, label, match.start(), match.end()))

    entries: list[BookEntry] = []
    for index, (number, label, _, body_start) in enumerate(matches):
        body_end = (
            matches[index + 1][2]
            if index + 1 < len(matches)
            else len(combined_text)
        )
        text = _clean_entry_text(combined_text[body_start:body_end])
        if not text:
            continue
        page_offset = bisect_right(page_starts, body_start) - 1
        pdf_page = source.first_pdf_page + page_offset
        entries.append(
            BookEntry(
                label=label,
                number=number,
                page=pdf_page - 25,
                text=text,
            )
        )

    return tuple(entries)


def list_entries(section: str) -> list[dict[str, Any]]:
    return [
        {
            "number": entry.number,
            "title": entry.title,
            "page": entry.page,
            "excerpt": entry.excerpt,
        }
        for entry in get_section_entries(section)
    ]


def get_entry(section: str, number: int) -> BookEntry | None:
    return next(
        (entry for entry in get_section_entries(section) if entry.number == number),
        None,
    )


def _reading_minutes(text: str) -> int:
    return max(1, round(len(text.split()) / 200))


def _paragraphs(text: str) -> list[str]:
    blocks = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
    if len(blocks) > 1:
        return blocks

    # Some PDF pages extract as one dense block. Group sentences so the reader
    # still gets breathing room between paragraphs.
    sentences = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    if len(sentences) <= 2:
        return [" ".join(text.split())] if text.strip() else []
    grouped: list[str] = []
    for start in range(0, len(sentences), 3):
        grouped.append(" ".join(sentences[start:start + 3]))
    return grouped


def _key_idea(text: str) -> str:
    candidates = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    meaningful = [
        sentence.strip()
        for sentence in candidates[:12]
        if 40 <= len(sentence.strip()) <= 240
    ]
    if not meaningful:
        return ""
    return max(meaningful, key=len)


def section_overview() -> list[dict[str, Any]]:
    """Cheap section metadata; does not parse the PDF."""
    return [
        {
            "slug": slug,
            "title": meta["title"],
            "description": meta["description"],
            "id": meta["id"],
            "color": meta["color"],
            "g1": meta["g1"],
            "g2": meta["g2"],
            "count": SECTION_SOURCES[slug].maximum_number,
        }
        for slug, meta in SECTION_META.items()
    ]


def topic_id_for(section: str, number: int) -> str:
    return f"{SECTION_META[section]['id']}-{number}"


def _topic_summary(section: str, entry: BookEntry) -> dict[str, Any]:
    return {
        "id": topic_id_for(section, entry.number),
        "number": entry.number,
        "title": entry.title,
        "summary": entry.excerpt,
        "page": entry.page,
        "minutes": _reading_minutes(entry.text),
    }


def list_topics(
    section: str,
    offset: int = 0,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    entries = get_section_entries(section)
    if limit is None:
        window = entries[max(0, offset):]
    else:
        window = entries[max(0, offset): max(0, offset) + max(0, limit)]
    return [_topic_summary(section, entry) for entry in window]


def topic_page(
    section: str,
    offset: int = 0,
    limit: int = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Return one page of topic summaries plus paging metadata."""
    entries = get_section_entries(section)
    total = len(entries)
    start = min(max(0, offset), total)
    stop = min(total, start + max(0, limit))
    window = entries[start:stop]
    has_more = stop < total
    return {
        "topics": [_topic_summary(section, entry) for entry in window],
        "total": total,
        "offset": start,
        "limit": limit,
        "hasMore": has_more,
        "nextOffset": stop if has_more else None,
    }


def parse_topic_id(topic_id: str) -> tuple[str, int] | None:
    prefix, _, number = topic_id.partition("-")
    if not prefix.isdigit() or not number.isdigit():
        return None
    section = SECTION_SLUG_BY_ID.get(int(prefix))
    if section is None:
        return None
    return section, int(number)


def _topic_detail(section: str, entry: BookEntry) -> dict[str, Any]:
    entries = get_section_entries(section)
    index = next(
        (position for position, item in enumerate(entries) if item.number == entry.number),
        -1,
    )
    previous = entries[index - 1] if index > 0 else None
    following = entries[index + 1] if 0 <= index < len(entries) - 1 else None
    return {
        "id": topic_id_for(section, entry.number),
        "sectionId": SECTION_META[section]["id"],
        "section": SECTION_META[section]["title"],
        "sectionSlug": section,
        "number": entry.number,
        "title": entry.title,
        "page": entry.page,
        "minutes": _reading_minutes(entry.text),
        "paragraphs": _paragraphs(entry.text),
        "keyIdeas": _key_idea(entry.text),
        "text": entry.text,
        # Neighbour references let the reader navigate without downloading the
        # whole collection just to know what comes next.
        "position": index + 1 if index >= 0 else None,
        "total": len(entries),
        "prevId": topic_id_for(section, previous.number) if previous else None,
        "nextId": topic_id_for(section, following.number) if following else None,
    }


def get_topic(topic_id: str) -> dict[str, Any] | None:
    parsed = parse_topic_id(topic_id)
    if parsed is None:
        return None
    section, number = parsed
    entry = get_entry(section, number)
    if entry is None:
        return None
    return _topic_detail(section, entry)


def get_topic_details(topic_ids: list[str]) -> list[dict[str, Any]]:
    """Resolve several topic details at once for client-side prefetching."""
    details: list[dict[str, Any]] = []
    for topic_id in topic_ids:
        detail = get_topic(topic_id)
        if detail is not None:
            details.append(detail)
    return details


def initial_bundle(
    page_size: int = DEFAULT_PAGE_SIZE,
    detail_count: int = DEFAULT_PREFETCH_DETAILS,
) -> dict[str, Any]:
    """Sections plus the first page (and a few details) of every collection.

    The frontend requests this once after the shell loads so opening a collection
    or its first topics is instant, while later pages stream in on scroll.
    """
    pages: dict[str, Any] = {}
    details: dict[str, Any] = {}
    for slug in SECTION_SOURCES:
        page = topic_page(slug, 0, page_size)
        pages[slug] = page
        for topic in page["topics"][:detail_count]:
            detail = get_topic(topic["id"])
            if detail is not None:
                details[detail["id"]] = detail
    return {
        "sections": section_overview(),
        "pageSize": page_size,
        "topicPages": pages,
        "topicDetails": details,
    }


def resolve_pdf_page(pdf_page_index: int) -> dict[str, Any] | None:
    """Map a 0-based PyPDF page index from a vector payload to a book topic."""
    if pdf_page_index < 0:
        return None
    printed_page = pdf_page_index + 1 - 25
    for slug, source in SECTION_SOURCES.items():
        if not source.first_pdf_page <= pdf_page_index + 1 <= source.last_pdf_page:
            continue
        result: dict[str, Any] = {
            "sectionId": SECTION_META[slug]["id"],
            "section": SECTION_META[slug]["title"],
            "page": printed_page,
        }
        entries = get_section_entries(slug)
        if not entries:
            return result
        nearest = min(entries, key=lambda entry: abs(entry.page - printed_page))
        if abs(nearest.page - printed_page) <= 3:
            result.update(
                {
                    "topicId": topic_id_for(slug, nearest.number),
                    "label": nearest.title,
                    "page": nearest.page,
                }
            )
        return result
    return None