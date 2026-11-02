# Nahjul Balagha AI

A small RAG application for reading Nahjul Balagha and asking it questions: it extracts PDF text, embeds chunks with Gemini (`gemini-embedding-001`), stores vectors in Qdrant, and answers questions with Gemini (`gemini-2.5-flash`). A mobile-first React reader ("Sage") ships in `UI/Nahjul Balagha`, and a FastAPI service exposes the book and the AI.

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

The UI is a mobile-first React app ("Sage") with Home, Section, Reader, Ask AI, and Saved screens. On desktop it appears in a phone frame; on phones it fills the screen.

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

Open the local URL printed by Vite. Vite proxies `/api` to `http://127.0.0.1:8000` when `VITE_API_BASE_URL` is unset, so the reader works as long as the API is running. Question answering also needs the credentials and index described above.

Reading preferences, bookmarks, and progress are stored in the browser under the `sage` localStorage key.

## Deploy the API to Render

The UI in `.env.production` points at `https://nahjul-balagha.onrender.com`. The repository includes `render.yaml`, which runs:

```text
uvicorn api:app --host 0.0.0.0 --port $PORT
```

In the Render dashboard, set at minimum `GEMINI_API_KEY`, `QDRANT_URL`, and `QDRANT_API_KEY`. For the public UI, keep `ALLOW_PUBLIC_API=true` and list the site in `CORS_ORIGINS`.

Two deployment details matter for Ask AI:

- **Redeploy after API changes.** A stale Render deployment can reject the UI's current request body with a `422` or fail the answer with a `500`. Push to `master` and confirm the Render deploy finished.
- **Free instances sleep.** The first request after idling can take 30–60 seconds. The API warms its Qdrant/Gemini clients at startup, retries transient upstream failures, and the UI waits up to two minutes before showing an error.

The API accepts both `{"question": "..."}` (current) and `{"query": "..."}` (legacy) and returns `503` with `Retry-After` for temporary Gemini/Qdrant failures.

### Troubleshooting Ask AI

- **`503` "The book database is unavailable"** — the API cannot reach Qdrant. Qdrant Cloud free clusters can be paused or deleted after inactivity, and the endpoint then resets TLS connections. Check it directly:

  ```powershell
  curl.exe "$env:QDRANT_URL/collections" -H "api-key: $env:QDRANT_API_KEY"
  ```

  If that connection is reset, create a new Qdrant cluster, update `QDRANT_URL` and `QDRANT_API_KEY` locally and on Render, then re-run `python main.py --index`.
- **`422` "rejected the request"** — the Render API is older than the UI. Redeploy the latest `master`.
- **`500` / connection reset** — inspect the Render logs. The API now retries transient Gemini/Qdrant failures and logs the failing upstream.

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness check. |
| `GET` | `/api/sections` | Section metadata (title, palette, canonical topic count). |
| `GET` | `/api/sections/{slug}/topics` | Topics for `sermons`, `letters`, or `sayings`, with summaries and reading times. |
| `GET` | `/api/topics/{id}` | A full topic (`1-1` = Sermon 1, `2-3` = Letter 3, `3-2` = Saying 2), split into paragraphs plus a key idea. |
| `POST` | `/api/ask` | Ask a question. Body: `{"question": "...", "sectionId"?: 1-3, "topicId"?: "3-2"}`. The legacy `query` field is still accepted. Answers come with sources that include `sectionId`, `topicId`, `label`, and the printed `page` where possible. |
| `GET` | `/api/book/sections/{section}` | Legacy entry list. |
| `GET` | `/api/book/sections/{section}/entries/{number}` | Legacy single entry. |

Source page numbers in `/api/ask` are mapped from the Qdrant payload's PDF page index to the book's printed page number and the nearest topic.

## Credentials

Keep real keys only in `.env`. Do not commit or share that file. Keys included in earlier code/messages should be revoked and replaced.
