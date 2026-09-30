from bisect import bisect_right
from dataclasses import dataclass
from functools import lru_cache
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


@lru_cache(maxsize=1)
def get_book_catalog() -> dict[str, list[BookEntry]]:
    pdf_path = get_pdf_path()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"Book PDF not found: {pdf_path}")

    reader = PdfReader(str(pdf_path))
    catalog: dict[str, list[BookEntry]] = {}

    for section_key, source in SECTION_SOURCES.items():
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
        catalog[section_key] = entries

    return catalog


def list_entries(section: str) -> list[dict[str, Any]]:
    return [
        {
            "number": entry.number,
            "title": entry.title,
            "page": entry.page,
            "excerpt": entry.excerpt,
        }
        for entry in get_book_catalog()[section]
    ]


def get_entry(section: str, number: int) -> BookEntry | None:
    return next(
        (entry for entry in get_book_catalog()[section] if entry.number == number),
        None,
    )