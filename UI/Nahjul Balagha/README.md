# Nahjul Balagha AI

A web application for exploring Nahjul Balagha. Browse sermons, letters, and sayings from the configured book PDF, ask questions against the indexed text, review cited source excerpts, and save answers in your browser.

## Features

- Browse and search the book's Sermons, Letters, and Sayings, with entry pages and excerpts.
- Ask questions using retrieval-augmented generation (RAG): local `all-MiniLM-L6-v2` embeddings, a Qdrant vector collection, and Gemini answers.
- Inspect source passages returned with an answer.
- Save and remove answers; saved items persist in the current browser using `localStorage`.
- Check whether the local API is online from the UI.

## Requirements

- Python 3.12
- Node.js and npm
- Gemini API credentials and a Qdrant instance for AI question answering

The backend project root is the parent directory of this UI folder: `Nahjul Balagha AI/`.

## Configure the backend

From the backend project root, create a virtual environment and install the Python dependencies:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Create a `.env` file in the backend project root and set the following values:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
```

The backend reads the book from `Nahjul-Balagha.pdf` in the project root by default. Set `PDF_PATH` in `.env` to use a different PDF. The Qdrant collection defaults to `nahjul_balagha_ai`; override it with `QDRANT_COLLECTION` if needed.

Keep real credentials in `.env` and do not commit or share them.

## Index the book

From the backend project root, build or refresh the searchable index:

```powershell
.\.venv\Scripts\python.exe main.py --index
```

The first run downloads the embedding model and may take a while. Run the command again after changing the PDF. AI question answering requires a populated Qdrant collection.

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

Open the local URL printed by Vite. The Vite development server proxies `/api` requests to `http://127.0.0.1:8000`, so keep the API running while using the UI. The book reader uses the configured PDF; question answering also needs the credentials and index described above.

## UI scripts

Run these commands from `UI\Nahjul Balagha`:

```powershell
npm run dev      # Start the Vite development server
npm run build    # Type-check and create a production build in dist/
npm run lint     # Run ESLint
npm run preview  # Preview the production build locally
```
