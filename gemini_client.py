import google.generativeai as genai

from config import Settings


def create_gemini_model(settings: Settings):
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(settings.chat_model)
