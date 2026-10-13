from google import genai

from config import Settings


def create_gemini_model(settings: Settings):
    return GeminiModel(genai.Client(api_key=settings.gemini_api_key), settings.chat_model)


class GeminiModel:
    def __init__(self, client: genai.Client, model_name: str) -> None:
        self.client = client
        self.model_name = model_name

    def generate_content(self, prompt: str):
        return self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
        )
