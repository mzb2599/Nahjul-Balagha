from types import SimpleNamespace

from qdrant_store import QdrantStore
from config import Settings


class FakeEmbeddings:
    def embed_documents(self, texts):
        return [[float(len(t)), 1.0, 0.0] for t in texts]


class FakeQdrantClient:
    def __init__(self):
        self.collections = {}

    def collection_exists(self, name):
        return name in self.collections

    def get_collection(self, name):
        return SimpleNamespace(
            config=SimpleNamespace(
                params=SimpleNamespace(vectors=SimpleNamespace(size=384))
            )
        )

    def create_collection(self, collection_name, vectors_config):
        self.collections[collection_name] = {}

    def upsert(self, collection_name, points, wait=True):
        collection = self.collections.setdefault(collection_name, {})
        for point in points:
            collection[str(point.id)] = {
                'id': point.id,
                'payload': point.payload,
                'vector': point.vector,
            }

    def scroll(self, collection_name, scroll_filter, limit, with_payload, with_vectors, offset=None):
        source = scroll_filter.must[0].match.value
        rows = []
        collection = self.collections.get(collection_name, {})
        for point_id, payload in collection.items():
            if payload['payload'].get('source') == source:
                rows.append(SimpleNamespace(id=point_id))
        return rows, None

    def delete(self, collection_name, points_selector, wait=True):
        collection = self.collections.setdefault(collection_name, {})
        for point_id in points_selector.points:
            collection.pop(str(point_id), None)


settings = Settings(
    gemini_api_key='test',
    qdrant_url='http://localhost:6333',
    qdrant_api_key='test',
    collection_name='reindex_test',
    pdf_path='dummy.pdf',
    batch_size=64,
)

store = QdrantStore.__new__(QdrantStore)
store.settings = settings
store.client = FakeQdrantClient()
store.client.create_collection('reindex_test', None)

chunks_a = [
    {'text': 'hello world', 'metadata': {'source': 'sourceA', 'page': 1, 'chunk': 0}},
    {'text': 'second chunk', 'metadata': {'source': 'sourceA', 'page': 1, 'chunk': 1}},
]
chunks_b = [
    {'text': 'hello world updated', 'metadata': {'source': 'sourceA', 'page': 1, 'chunk': 0}},
    {'text': 'third chunk', 'metadata': {'source': 'sourceA', 'page': 2, 'chunk': 2}},
]

store.upsert_chunks(chunks_a, FakeEmbeddings(), 64)
store.upsert_chunks(chunks_b, FakeEmbeddings(), 64)

remaining = {p['payload']['text'] for p in store.client.collections['reindex_test'].values()}
assert remaining == {'hello world updated', 'third chunk'}, remaining
print('PASS: stale source points removed during reindex')
