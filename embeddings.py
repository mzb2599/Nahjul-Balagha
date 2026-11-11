import math
import time
from collections import deque

from google import genai
from google.genai import types

from resilience import call_with_retry


class GeminiEmbeddings:
    def __init__(
        self,
        model_name: str,
        api_key: str,
        vector_size: int = 768,
        *,
        timeout_seconds: int = 30,
        max_retries: int = 3,
        batch_size: int = 64,
        requests_per_minute: int = 0,
    ):
        self.model_name = model_name
        self.vector_size = vector_size
        self.max_retries = max_retries
        self.requests_per_minute = max(0, requests_per_minute)
        self.batch_size = max(1, batch_size)
        if self.requests_per_minute:
            # A single request cannot exceed the per-minute budget.
            self.batch_size = min(self.batch_size, self.requests_per_minute)
        # Timestamps/counts of recent input passages, used to stay inside
        # Gemini's per-minute quota on the free tier.
        self._recent_inputs: deque[tuple[float, int]] = deque()
        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=max(5, timeout_seconds) * 1000,
            ),
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed document passages for retrieval from Gemini.

        Passages are sent in batches; a single request per chunk makes indexing
        several times slower than it needs to be.
        """
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start:start + self.batch_size]
            vectors.extend(
                self._embed_batch(
                    batch,
                    "RETRIEVAL_DOCUMENT",
                    attempts=max(6, self.max_retries),
                    base_delay=3.0,
                    max_delay=60.0,
                )
            )
        return vectors

    def embed_query(self, text: str) -> list[float]:
        """Embed a search query using Gemini's retrieval query task."""
        return self._embed_batch([text], "RETRIEVAL_QUERY")[0]

    def _embed_batch(
        self,
        texts: list[str],
        task_type: str,
        *,
        attempts: int | None = None,
        base_delay: float = 1.0,
        max_delay: float = 8.0,
    ) -> list[list[float]]:
        self._wait_for_quota(len(texts))

        def _embed():
            response = self.client.models.embed_content(
                model=self.model_name,
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=self.vector_size,
                ),
            )
            embeddings = response.embeddings or []
            if len(embeddings) != len(texts):
                raise ValueError(
                    f"Gemini returned {len(embeddings)} embeddings for {len(texts)} "
                    "input passages."
                )
            return [
                self._normalize(embedding.values, index)
                for index, embedding in enumerate(embeddings)
            ]

        return call_with_retry(
            _embed,
            attempts=attempts or self.max_retries,
            base_delay=base_delay,
            max_delay=max_delay,
            label=f"Gemini embedding ({task_type})",
        )

    def _wait_for_quota(self, count: int) -> None:
        """Sleep until a rolling one-minute window has room for `count` inputs.

        Gemini's free embedding quota counts each passage, not each HTTP
        request, so pacing per request is not enough. The window is tracked
        locally; it is a best-effort guard, not a hard reservation.
        """
        limit = self.requests_per_minute
        if limit <= 0:
            return
        count = min(max(1, count), limit)
        while True:
            now = time.monotonic()
            while self._recent_inputs and now - self._recent_inputs[0][0] >= 60:
                self._recent_inputs.popleft()
            used = sum(amount for _, amount in self._recent_inputs)
            if not self._recent_inputs or used + count <= limit:
                self._recent_inputs.append((now, count))
                return
            wait = 60 - (now - self._recent_inputs[0][0]) + 0.25
            print(
                f"Embedding quota pacing: waiting {wait:.0f}s before the next "
                f"{count} passages.",
                flush=True,
            )
            time.sleep(max(0.25, wait))

    def _normalize(self, values, index: int) -> list[float]:
        if not values:
            raise ValueError(
                f"Gemini returned an empty embedding for passage {index}."
            )
        vector = [float(value) for value in values]
        if len(vector) != self.vector_size:
            raise ValueError(
                f"Model {self.model_name!r} returned {len(vector)} dimensions; "
                f"expected {self.vector_size}."
            )
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            raise ValueError(f"Gemini returned a zero embedding for passage {index}.")
        return [value / norm for value in vector]
