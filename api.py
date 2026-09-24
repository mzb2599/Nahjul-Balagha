from functools import lru_cache

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from embeddings import LocalEmbeddings
from gemini_client import create_gemini_model
from qdrant_store import QdrantStore
from rag import answer_query

app = FastAPI(title="Nahjul Balagha AI", version="1.0.0")


class AskRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)


@lru_cache(maxsize=1)
def get_rag_services():
    settings = get_settings()
    return (
        LocalEmbeddings(settings.embedding_model),
        QdrantStore(settings),
        create_gemini_model(settings),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/ask")
def ask(request: AskRequest):
    try:
        embeddings, store, model = get_rag_services()
        if store.count() == 0:
            raise HTTPException(
                status_code=503,
                detail="The book index is empty. Run `python main.py --index` first.",
            )
        return answer_query(request.query, embeddings, store, model)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
