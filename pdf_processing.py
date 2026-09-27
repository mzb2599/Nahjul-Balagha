from pathlib import Path
from typing import Any

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


def load_and_split_pdf(
    pdf_path: str | Path,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[dict[str, Any]]:
    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF file not found: {path}")

    documents = PyPDFLoader(str(path)).load()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )

    chunks: list[dict[str, Any]] = []
    for document in documents:
        page_number = document.metadata.get("page", 0)
        source = document.metadata.get("source", path.name)
        for chunk_number, text in enumerate(splitter.split_text(document.page_content)):
            if text.strip():
                chunks.append({
                    "text": text,
                    "metadata": {
                        "page": page_number,
                        "chunk": chunk_number,
                        "source": str(source),
                    },
                })
    return chunks
