import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_DIR = Path(__file__).resolve().parent
load_dotenv(PROJECT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    qdrant_url: str
    qdrant_api_key: str
    collection_name: str
    pdf_path: Path
    batch_size: int = 64
    embedding_model: str = "all-MiniLM-L6-v2"
    chat_model: str = "gemini-2.5-flash"
    vector_size: int = 384
    allow_public_api: bool = False
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1", "::1")


def get_settings() -> Settings:
    required = {
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY"),
        "QDRANT_URL": os.getenv("QDRANT_URL"),
        "QDRANT_API_KEY": os.getenv("QDRANT_API_KEY"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing environment variables: " + ", ".join(missing)
            + ". Copy .env.example to .env and fill in the values."
        )

    allow_public_api = os.getenv("ALLOW_PUBLIC_API", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    allowed_hosts = tuple(
        host.strip().lower()
        for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,::1").split(",")
        if host.strip()
    ) or ("localhost", "127.0.0.1", "::1")

    return Settings(
        gemini_api_key=required["GEMINI_API_KEY"],
        qdrant_url=required["QDRANT_URL"],
        qdrant_api_key=required["QDRANT_API_KEY"],
        collection_name=os.getenv("QDRANT_COLLECTION", "nahjul_balagha_ai"),
        pdf_path=get_pdf_path(),
        batch_size=int(os.getenv("BATCH_SIZE", "64")),
        allow_public_api=allow_public_api,
        allowed_hosts=allowed_hosts,
    )


def get_pdf_path() -> Path:
    pdf_path = Path(os.getenv("PDF_PATH", str(PROJECT_DIR / "Nahjul-Balagha.pdf")))
    if not pdf_path.is_absolute():
        pdf_path = PROJECT_DIR / pdf_path
    return pdf_path
