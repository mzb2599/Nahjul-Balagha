import argparse
import logging
from typing import Any

from config import get_settings
from embeddings import LocalEmbeddings
from gemini_client import create_gemini_model
from pdf_processing import load_and_split_pdf
from qdrant_store import QdrantStore
from rag import answer_query


def main() -> None:
    parser = argparse.ArgumentParser(description="Ask questions about Nahjul Balagha.")
    parser.add_argument(
        "--index",
        action="store_true",
        help="Read and index the configured PDF before answering queries.",
    )
    parser.add_argument("--query", help="Ask one question and exit.")
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show retrieval scores, excerpts, and informational logs.",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("qdrant_client").setLevel(logging.WARNING)
    settings = get_settings()
    embeddings = LocalEmbeddings(settings.embedding_model)
    store = QdrantStore(settings)

    if args.index:
        chunks = load_and_split_pdf(settings.pdf_path)
        if not chunks:
            raise RuntimeError(f"No extractable text found in {settings.pdf_path}")
        store.upsert_chunks(chunks, embeddings, settings.batch_size)
        print(f"Indexed {len(chunks)} chunks into {settings.collection_name}.")

    point_count = store.count()
    if point_count == 0:
        raise RuntimeError(
            f"Qdrant collection {settings.collection_name!r} is empty. "
            "Run `python main.py --index` first."
        )

    model = create_gemini_model(settings)
    if args.query:
        answer = answer_query(args.query, embeddings, store, model)
        print_answer(args.query, answer)
        return

    print("Nahjul Balagha RAG is ready. Type 'exit' to quit.")
    while True:
        try:
            query = input("Question: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if query.lower() in {"exit", "quit"}:
            break
        if query:
            answer = answer_query(query, embeddings, store, model)
            print_answer(query, answer)


def print_answer(query: str, result: dict[str, Any]) -> None:
    print("\n" + "=" * 72)
    print(f"Question\n{query}\n")
    print(f"Answer\n{result['answer']}")
    sources = result.get("sources", [])
    pages = sorted({str(source["page"]) for source in sources if source.get("page") is not None})
    if pages:
        print(f"\nSources: pages {', '.join(pages)}")
    print("=" * 72)


if __name__ == "__main__":
    main()
