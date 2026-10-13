import math

from google import genai
from google.genai import types


class GeminiEmbeddings:
    def __init__(self, model_name: str, api_key: str, vector_size: int = 768):
        self.model_name = model_name
        self.vector_size = vector_size
        self.client = genai.Client(api_key=api_key)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed document passages for retrieval from Gemini."""
        return [self._embed_text(text, "RETRIEVAL_DOCUMENT") for text in texts]

    def embed_query(self, text: str) -> list[float]:
        """Embed a search query using Gemini's retrieval query task."""
        return self._embed_text(text, "RETRIEVAL_QUERY")

    def _embed_text(self, text: str, task_type: str) -> list[float]:
        response = self.client.models.embed_content(
            model=self.model_name,
            contents=text,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=self.vector_size,
            ),
        )
        if not response.embeddings or not response.embeddings[0].values:
            raise ValueError("Gemini returned an empty embedding.")

        vector = [float(value) for value in response.embeddings[0].values]
        if len(vector) != self.vector_size:
            raise ValueError(
                f"Model {self.model_name!r} returned {len(vector)} dimensions; "
                f"expected {self.vector_size}."
            )
        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            raise ValueError("Gemini returned a zero embedding.")
        return [value / norm for value in vector]
