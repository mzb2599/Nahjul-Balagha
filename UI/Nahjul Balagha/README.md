# Nahjul Balagha · Sage UI

A mobile-first reader and AI companion for Nahjul Balagha. Browse the book's three collections (Sermons, Letters, Sayings), read topic by topic, and ask questions that are answered only from the book, with sources you can open.

## Experience

- **Home** — a continue-reading card, three section covers with per-section progress, an "Ask the book" card, and a daily saying.
- **Section** — gradient cover with parallax artwork, stat trio (topics, total reading time, completion), and a topic timeline with "up next" and completed states.
- **Reader** — serif reading view with a drop cap, key-idea callout, reading progress, bookmark, paper/sepia/night themes, 16–24px text size, and previous/next navigation.
- **Ask AI** — context-aware chat. Asking from a section or the reader focuses the answer on what you are reading, and each source card links back to the topic it came from.
- **Saved** — bookmarked topics stored on the device.

Reading preferences, bookmarks, completion, and the last topic read persist in `localStorage` under the `sage` key. Reduced-motion preferences are respected.

## Requirements

- Python 3.12
- Node.js and npm
- Gemini and Qdrant credentials, plus an indexed collection, for Ask AI

The backend project root is the parent directory of this UI folder: `Nahjul Balagha AI/`.

## Configure the backend

From the backend project root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Fill in `.env`:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
```

The backend reads `Nahjul-Balagha.pdf` from the project root by default; set `PDF_PATH` to use another file. The Qdrant collection defaults to `nahjul_balagha_ai_gemini`. Keep real credentials in `.env` and never commit them.

## Index the book

```powershell
.\.venv\Scripts\python.exe main.py --index
```

Indexing sends each chunk to Gemini embeddings, so it needs internet access and is subject to API quotas. Run it again after changing the PDF.

## Run the application

Start the API from the backend project root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start the UI:

```powershell
cd "UI\Nahjul Balagha"
npm install
npm run dev
```

Open the local URL printed by Vite. The dev server proxies `/api` to `http://127.0.0.1:8000` unless `VITE_API_BASE_URL` is set (see `.env.production` for the deployed API). Without the API, reading cannot load; without credentials and an index, Ask AI cannot answer.

## API used by this UI

- `GET /api/sections`
- `GET /api/sections/{slug}/topics`
- `GET /api/topics/{id}`
- `POST /api/ask` with `{ question, sectionId?, topicId? }`

## UI scripts

Run these from `UI\Nahjul Balagha`:

```powershell
npm run dev      # Start the Vite development server
npm run build    # Type-check and create a production build in dist/
npm run lint     # Run ESLint
npm run preview  # Preview the production build locally
```
