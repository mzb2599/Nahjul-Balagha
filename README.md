# Nahjul Balagha AI

A small command-line RAG application: it extracts PDF text, embeds chunks with Gemini (`gemini-embedding-001`), stores vectors in Qdrant, and answers questions with Gemini (`gemini-2.5-flash`).

## Setup

Use Python 3.12. From this folder in PowerShell or Command Prompt:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set your Gemini API key, Qdrant URL, and Qdrant API key. Set `PDF_PATH` to the PDF location. Alternatively, put `Nahjul-Balagha.pdf` in this folder and keep the example path.

The API is intentionally private by default. Set `ALLOW_PUBLIC_API=true` only when you are deliberately exposing it beyond localhost/internal use. `ALLOWED_HOSTS` controls the trusted local hosts for the same-machine UI and local clients.

The app defaults to the separate Qdrant collection `nahjul_balagha_ai_gemini`; it does not delete or modify an older collection. Gemini embeddings use 768 dimensions by default. `EMBEDDING_MODEL` and `VECTOR_SIZE` can override these defaults, but the chosen model output dimension must match `VECTOR_SIZE`.

## Index the PDF

```powershell
.\.venv\Scripts\python.exe main.py --index
```

Indexing is idempotent for the same file path and content: it uses stable point IDs and upserts existing chunks rather than duplicating them. Gemini embedding requests require an internet connection and are subject to Gemini API quotas. Each passage is embedded as a retrieval document; searches use the retrieval query task.

## Ask a question

One-shot query:

```powershell
.\.venv\Scripts\python.exe main.py --query "What does the book say about wisdom?"
```

Interactive mode:

```powershell
.\.venv\Scripts\python.exe main.py
```

To re-index after changing the PDF, run the indexing command again.

## Run the web UI

Start the API from the project root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start Vite:

```powershell
cd "UI\Nahjul Balagha"
npm install
npm run dev
```

Open the local URL printed by Vite. The UI proxies `/api/ask` to the FastAPI service.

## Credentials

Keep real keys only in `.env`. Do not commit or share that file. Keys included in earlier code/messages should be revoked and replaced.
