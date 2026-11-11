import uuid
from typing import Any
from urllib.parse import urlsplit

from qdrant_client import QdrantClient, models

from config import Settings
from resilience import call_with_retry

# Bumped whenever the stored payload gains fields the retrieval pipeline needs.
# Points written with the current version are skipped on the next indexing run,
# which lets an interrupted (e.g. quota-limited) index resume where it stopped.
SCHEMA_VERSION = 2
PAYLOAD_FIELDS = (
    "text",
    "page",
    "chunk",
    "source",
    "sectionId",
    "topicId",
    "label",
    "section",
    "schemaVersion",
)


class QdrantUnavailableError(RuntimeError):
    """Raised when the configured Qdrant cluster cannot be reached."""


class QdrantStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            timeout=60,
        )
        try:
            self._ensure_collection()
        except ValueError:
            raise
        except Exception as error:
            host = urlsplit(settings.qdrant_url).hostname or settings.qdrant_url
            raise QdrantUnavailableError(
                f"Qdrant is unreachable at {host}. Check that the cluster is running "
                "and that QDRANT_URL and QDRANT_API_KEY are correct. If the cluster "
                "was paused or deleted, create a new one, update the environment "
                "variables, and re-run `python main.py --index`."
            ) from error

    def _ensure_collection(self) -> None:
        if call_with_retry(
            lambda: self.client.collection_exists(self.settings.collection_name),
            label="Qdrant collection check",
        ):
            info = call_with_retry(
                lambda: self.client.get_collection(self.settings.collection_name),
                label="Qdrant collection info",
            )
            vectors = info.config.params.vectors
            size = getattr(vectors, "size", None)
            if size is not None and size != self.settings.vector_size:
                raise ValueError(
                    f"Collection {self.settings.collection_name!r} has vector size {size}, "
                    f"but this app expects {self.settings.vector_size}. Choose another collection "
                    "or recreate it intentionally."
                )
            return

        call_with_retry(
            lambda: self.client.create_collection(
                collection_name=self.settings.collection_name,
                vectors_config=models.VectorParams(
                    size=self.settings.vector_size,
                    distance=models.Distance.COSINE,
                ),
            ),
            label="Qdrant collection create",
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
        point_ids_by_source: dict[str, set[str]] = {}
        for chunk in chunks:
            source = str(chunk["metadata"]["source"])
            point_ids_by_source.setdefault(source, set()).add(self._point_id(chunk))

        # Fetch point ids plus their schema version once. Existing schema-v2
        # points are already embedded with the current metadata, so a re-run
        # after an interruption only processes what is still missing.
        all_versions = self._point_versions_by_source()
        existing_versions: dict[str, dict[str, int | None]] = {
            source: all_versions.get(source, {}) for source in point_ids_by_source
        }
        for source, current_ids in point_ids_by_source.items():
            versions = existing_versions[source]
            skipped = sum(
                1 for point_id in current_ids if versions.get(point_id) == SCHEMA_VERSION
            )
            if skipped:
                print(
                    f"Skipping {skipped}/{len(current_ids)} chunks already indexed "
                    f"for {source}",
                    flush=True,
                )

        pending = [
            chunk
            for chunk in chunks
            if existing_versions[str(chunk["metadata"]["source"])].get(
                self._point_id(chunk)
            )
            != SCHEMA_VERSION
        ]

        # Embed in large groups (Gemini accepts many passages per request) but
        # upsert in the configured batch size so progress is checkpointed often.
        embed_group = max(batch_size, getattr(embeddings, "batch_size", batch_size))
        done = len(chunks) - len(pending)
        for start in range(0, len(pending), embed_group):
            group = pending[start:start + embed_group]
            vectors = embeddings.embed_documents([item["text"] for item in group])
            for offset in range(0, len(group), batch_size):
                batch = group[offset:offset + batch_size]
                batch_vectors = vectors[offset:offset + batch_size]
                points = [
                    models.PointStruct(
                        id=self._point_id(chunk),
                        vector=vector,
                        payload={
                            "text": chunk["text"],
                            **chunk["metadata"],
                            "schemaVersion": SCHEMA_VERSION,
                        },
                    )
                    for chunk, vector in zip(batch, batch_vectors, strict=True)
                ]
                call_with_retry(
                    lambda: self.client.upsert(
                        collection_name=self.settings.collection_name,
                        points=points,
                        wait=True,
                    ),
                    label="Qdrant upsert",
                )
                done += len(batch)
                print(f"Indexed {done}/{len(chunks)} chunks", flush=True)

        # Delete points that existed for a source but are no longer produced by
        # the current file. Reuse the ids fetched above to avoid a second scroll.
        for source, current_ids in point_ids_by_source.items():
            obsolete_ids = set(existing_versions[source]) - current_ids
            if obsolete_ids:
                call_with_retry(
                    lambda: self.client.delete(
                        collection_name=self.settings.collection_name,
                        points_selector=models.PointIdsList(points=list(obsolete_ids)),
                        wait=True,
                    ),
                    label="Qdrant delete obsolete points",
                )

        return len(chunks)

    def _point_versions_by_source(self) -> dict[str, dict[str, int | None]]:
        """Page through all points once, grouping ids by their source.

        Filtering by `source` requires a keyword payload index that older
        collections do not have, so this avoids `scroll_filter` entirely.
        """
        versions: dict[str, dict[str, int | None]] = {}
        offset = None
        while True:
            points, offset = call_with_retry(
                lambda: self.client.scroll(
                    collection_name=self.settings.collection_name,
                    limit=512,
                    with_payload=["source", "schemaVersion"],
                    with_vectors=False,
                    offset=offset,
                ),
                label="Qdrant scroll",
            )
            for point in points:
                payload = point.payload or {}
                source = payload.get("source")
                if source is None:
                    continue
                version = payload.get("schemaVersion")
                versions.setdefault(str(source), {})[str(point.id)] = (
                    version if isinstance(version, int) else None
                )
            if offset is None:
                return versions

    def search(self, vector: list[float], limit: int = 8):
        return call_with_retry(
            lambda: self.client.search(
                collection_name=self.settings.collection_name,
                query_vector=vector,
                limit=limit,
                with_payload=list(PAYLOAD_FIELDS),
            ),
            label="Qdrant search",
        )

    def count(self) -> int:
        response = call_with_retry(
            lambda: self.client.count(
                collection_name=self.settings.collection_name,
                exact=True,
            ),
            label="Qdrant count",
        )
        return response.count
