import logging

from google import genai
from google.genai import types

from config import Settings
from resilience import call_with_retry

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = (
    "You are Sage, a careful study companion for Nahjul Balagha. "
    "Answer only from the excerpts provided in the user's message. "
    "Use the book's own ideas and reasoning, and cite the page marker for every "
    "supported claim, for example (p. 412). If the excerpts do not address the "
    "question, say that the retrieved context is insufficient instead of guessing. "
    "Be concise, clear, and respectful. Do not mention the technical retrieval process."
)


def create_gemini_model(settings: Settings):
    return GeminiModel(
        genai.Client(
            api_key=settings.gemini_api_key,
            http_options=types.HttpOptions(
                timeout=max(5, settings.gemini_timeout_seconds) * 1000,
            ),
        ),
        settings.chat_model,
        max_retries=settings.gemini_max_retries,
    )


class GeminiModel:
    def __init__(
        self,
        client: genai.Client,
        model_name: str,
        *,
        max_retries: int = 3,
    ) -> None:
        self.client = client
        self.model_name = model_name
        self.max_retries = max_retries

    def generate_content(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
    ):
        """Generate a response, retrying transient Gemini/network failures."""

        config = types.GenerateContentConfig(
            system_instruction=system_instruction or SYSTEM_INSTRUCTION,
            temperature=0.2,
            max_output_tokens=1600,
        )

        def _generate():
            return self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=config,
            )

        return call_with_retry(
            _generate,
            attempts=self.max_retries,
            label=f"Gemini generate ({self.model_name})",
        )

    def generate_answer(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
    ) -> str:
        response = self.generate_content(
            prompt,
            system_instruction=system_instruction,
        )
        text = (getattr(response, "text", None) or "").strip()
        if text:
            return text

        feedback = getattr(response, "prompt_feedback", None)
        block_reason = getattr(feedback, "block_reason", None)
        if block_reason:
            raise RuntimeError(
                f"Gemini blocked the answer for safety reasons ({block_reason}). "
                "Try rephrasing the question."
            )
        raise RuntimeError(
            "Gemini returned an empty answer. This usually means the request was "
            "blocked or the response was cut off; please try again."
        )
