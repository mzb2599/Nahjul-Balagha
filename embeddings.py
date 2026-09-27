from typing import Sequence

from sentence_transformers import SentenceTransformer


class LocalEmbeddings:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        self.model = SentenceTransformer(model_name)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self.model.encode(
            list(texts),
            normalize_embeddings=True,
            show_progress_bar=False,
        ).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
