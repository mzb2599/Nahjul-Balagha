# Nahjul Balagha AI

A small command-line RAG application: it extracts PDF text, embeds chunks locally with `all-MiniLM-L6-v2`, stores vectors in Qdrant, and answers questions with Gemini.

## Setup

Use Python 3.12. From this folder in PowerShell or Command Prompt:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set your Gemini API key, Qdrant URL, and Qdrant API key. Set `PDF_PATH` to the PDF location. Alternatively, put `Nahjul-Balagha.pdf` in this folder and keep the example path.

The app defaults to the separate Qdrant collection `nahjul_balagha_ai`; it does not delete or modify the collection used by the older project.

## Index the PDF

```powershell
.\.venv\Scripts\python.exe main.py --index
```

Indexing is idempotent for the same file path and content: it uses stable point IDs and upserts existing chunks rather than duplicating them. The first run downloads the embedding model and may take a while.

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

## Credentials

Keep real keys only in `.env`. Do not commit or share that file. Keys included in earlier code/messages should be revoked and replaced.
