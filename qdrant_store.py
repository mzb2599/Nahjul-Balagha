import uuid
from typing import Any

from qdrant_client import QdrantClient, models

from config import Settings


class QdrantStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=60,
        )
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        if self.client.collection_exists(self.settings.collection_name):
            info = self.client.get_collection(self.settings.collection_name)
            vectors = info.config.params.vectors
            size = getattr(vectors, "size", None)
            if size is not None and size != self.settings.vector_size:
                raise ValueError(
                    f"Collection {self.settings.collection_name!r} has vector size {size}, "
                    f"but this app expects {self.settings.vector_size}. Choose another collection "
                    "or recreate it intentionally."
                )
            return

        self.client.create_collection(
            collection_name=self.settings.collection_name,
            vectors_config=models.VectorParams(
                size=self.settings.vector_size,
                distance=models.Distance.COSINE,
            ),
        )

    @staticmethod
    def _point_id(chunk: dict[str, Any]) -> str:
        metadata = chunk["metadata"]
        stable_key = "|".join((
            metadata["source"],
            str(metadata["page"]),
            str(metadata["chunk"]),
            chunk["text"],
        ))
        return str(uuid.uuid5(uuid.NAMESPACE_URL, stable_key))

    def upsert_chunks(
        self,
        chunks: list[dict[str, Any]],
        embeddings: Any,
        batch_size: int,
    ) -> int:
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start:start + batch_size]
            vectors = embeddings.embed_documents([item["text"] for item in batch])
            points = [
                models.PointStruct(
                    id=self._point_id(chunk),
                    vector=vector,
                    payload={"text": chunk["text"], **chunk["metadata"]},
                )
                for chunk, vector in zip(batch, vectors, strict=True)
            ]
            self.client.upsert(
                collection_name=self.settings.collection_name,
                points=points,
                wait=True,
            )
            print(f"Indexed {min(start + len(batch), len(chunks))}/{len(chunks)} chunks")
        return len(chunks)

    def search(self, vector: list[float], limit: int = 8):
        return self.client.search(
            collection_name=self.settings.collection_name,
            query_vector=vector,
            limit=limit,
            with_payload=True,
        )

    def count(self) -> int:
        return self.client.count(
            collection_name=self.settings.collection_name,
            exact=True,
        ).count
