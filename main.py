import argparse
import logging

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
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
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
        print(answer_query(args.query, embeddings, store, model))
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
            print(answer_query(query, embeddings, store, model))
            print()


if __name__ == "__main__":
    main()
