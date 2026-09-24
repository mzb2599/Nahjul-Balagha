import type { FormEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Compass,
  Feather,
  FileText,
  History,
  Library,
  LoaderCircle,
  Menu,
  MessageCircle,
  Search,
  Settings2,
  Share2,
  Sparkles,
  SunMedium,
  X,
} from "lucide-react";
import "./App.css";

type Source = {
  page?: number | string;
  text?: string;
  score?: number;
};

type AskResult = {
  answer: string;
  sources: Source[];
};

type SavedAnswer = {
  question: string;
  answer: string;
  sources: Source[];
};

type View = "Home" | "Ask" | "Read" | "Saved";

const starterQuestions = [
  "What is wisdom?",
  "How should a just leader govern?",
  "What does the book say about patience?",
];

function App() {
  const [view, setView] = useState<View>("Home");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedAnswer[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("nahjul-saved") ?? "[]",
      ) as SavedAnswer[];
    } catch {
      return [];
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem("nahjul-saved", JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => setApiStatus(response.ok ? "online" : "offline"))
      .catch(() => setApiStatus("offline"));
  }, []);

  async function askQuestion(question = query) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isLoading) return;

    setQuery(cleanQuestion);
    setView("Ask");
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cleanQuestion }),
      });
      const payload = (await response.json()) as AskResult & {
        detail?: string;
      };
      if (!response.ok)
        throw new Error(
          payload.detail ?? "The question could not be answered.",
        );
      setResult(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not reach the RAG service.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function toggleSaved() {
    if (!result) return;
    const exists = saved.some((item) => item.question === query);
    setSaved(
      exists
        ? saved.filter((item) => item.question !== query)
        : [
            { question: query, answer: result.answer, sources: result.sources },
            ...saved,
          ],
    );
  }

  function submitFromInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askQuestion();
  }

  function selectView(nextView: View) {
    setView(nextView);
    setMenuOpen(false);
  }

  const currentSaved = saved.some((item) => item.question === query);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="#home" onClick={() => selectView("Home")}>
          <span className="brand-mark">
            <Feather size={20} strokeWidth={1.7} />
          </span>
          <span>
            <strong>Nahjul</strong>
            <small>THE WISDOM LIBRARY</small>
          </span>
        </a>

        <div className="sidebar-label">Workspace</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <NavButton
            icon={<Compass />}
            label="Home"
            active={view === "Home"}
            onClick={() => selectView("Home")}
          />
          <NavButton
            icon={<Sparkles />}
            label="Ask"
            active={view === "Ask"}
            onClick={() => {
              selectView("Ask");
              inputRef.current?.focus();
            }}
          />
          <NavButton
            icon={<BookOpen />}
            label="Read"
            active={view === "Read"}
            onClick={() => selectView("Read")}
          />
          <NavButton
            icon={<Bookmark />}
            label="Saved"
            active={view === "Saved"}
            count={saved.length}
            onClick={() => selectView("Saved")}
          />
        </nav>

        <div className="sidebar-rule" />
        <div className="sidebar-label">Explore the book</div>
        <button
          className="collection-link"
          onClick={() => {
            setQuery("What are the central teachings in the sermons?");
            void askQuestion("What are the central teachings in the sermons?");
          }}
        >
          <span className="collection-icon sermon-icon">S</span>
          <span>Sermons</span>
          <span className="collection-count">241</span>
        </button>
        <button
          className="collection-link"
          onClick={() => {
            setQuery("What guidance is given in the letters?");
            void askQuestion("What guidance is given in the letters?");
          }}
        >
          <span className="collection-icon letter-icon">L</span>
          <span>Letters</span>
          <span className="collection-count">79</span>
        </button>
        <button
          className="collection-link"
          onClick={() => {
            setQuery("What sayings offer guidance for daily life?");
            void askQuestion("What sayings offer guidance for daily life?");
          }}
        >
          <span className="collection-icon saying-icon">W</span>
          <span>Sayings</span>
          <span className="collection-count">480</span>
        </button>

        <div className="sidebar-bottom">
          <div className="library-status">
            <span
              className={`status-dot ${apiStatus === "online" ? "" : "status-muted"}`}
            />
            <span>
              <strong>
                {apiStatus === "online"
                  ? "RAG service online"
                  : apiStatus === "checking"
                    ? "Connecting…"
                    : "RAG service offline"}
              </strong>
              <small>
                {apiStatus === "online"
                  ? "Sources ready to explore"
                  : "Check the local API server"}
              </small>
            </span>
          </div>
          <button className="profile-button">
            <span className="profile-avatar">M</span>
            <span>
              <strong>My reading space</strong>
              <small>Personal library</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main className="main-panel">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Library</span>
            <span className="crumb-slash">/</span>
            <strong>{view === "Home" ? "Today" : view}</strong>
          </div>
          <div className="topbar-actions">
            <span className="today-date">
              <SunMedium size={16} /> A moment for reflection
            </span>
            <button className="help-button" aria-label="Help">
              <CircleHelp size={18} />
            </button>
            <span className="top-avatar">M</span>
          </div>
        </header>

        <div className="content-wrap">
          {view === "Home" && (
            <HomeView onAsk={askQuestion} onRead={() => selectView("Read")} />
          )}

          {view === "Ask" && (
            <section className="ask-view">
              <button className="back-link" onClick={() => selectView("Home")}>
                <ArrowLeft size={15} /> Back to today
              </button>
              <div className="section-eyebrow">
                <span className="eyebrow-rule" /> ASK THE TEXT
              </div>
              <h1 className="page-title">
                A question, <em>rooted in wisdom.</em>
              </h1>
              <p className="page-intro">
                Explore the text with answers grounded in passages from Nahjul
                Balagha.
              </p>
              <SearchForm
                query={query}
                setQuery={setQuery}
                onSubmit={submitFromInput}
                isLoading={isLoading}
                inputRef={inputRef}
              />
              {error && (
                <div className="error-message" role="alert">
                  <CircleHelp size={18} />
                  <span>{error}</span>
                </div>
              )}
              {isLoading && (
                <div className="loading-panel">
                  <LoaderCircle className="spin" size={22} />
                  <span>Searching the text and tracing its sources…</span>
                </div>
              )}
              {result && !isLoading && (
                <AnswerPanel
                  result={result}
                  query={query}
                  saved={currentSaved}
                  onToggleSaved={toggleSaved}
                  commentaryOpen={commentaryOpen}
                  onToggleCommentary={() => setCommentaryOpen(!commentaryOpen)}
                />
              )}
              {!result && !isLoading && !error && (
                <StarterQuestions onAsk={askQuestion} />
              )}
            </section>
          )}

          {view === "Read" && <ReadView onAsk={askQuestion} />}
          {view === "Saved" && (
            <SavedView
              saved={saved}
              onAsk={askQuestion}
              onRemove={(question) =>
                setSaved(saved.filter((item) => item.question !== question))
              }
            />
          )}

          <footer className="page-footer">
            <span>Built for thoughtful reading</span>
            <span>
              NAHJUL BALAGHA <i>·</i> WISDOM IN CONTEXT
            </span>
          </footer>
        </div>
      </main>
      <MobileNav view={view} savedCount={saved.length} onSelect={selectView} />
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  count,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-button ${active ? "nav-active" : ""}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="nav-count">{count}</span>
      )}
    </button>
  );
}

function MobileNav({
  view,
  savedCount,
  onSelect,
}: {
  view: View;
  savedCount: number;
  onSelect: (view: View) => void;
}) {
  const items: {
    view: View;
    label: string;
    icon: ReactNode;
    count?: number;
  }[] = [
    { view: "Home", label: "Home", icon: <Compass /> },
    { view: "Ask", label: "Ask", icon: <Sparkles /> },
    { view: "Read", label: "Read", icon: <BookOpen /> },
    { view: "Saved", label: "Saved", icon: <Bookmark />, count: savedCount },
  ];
  return (
    <nav className="mobile-tab-bar" aria-label="Mobile navigation">
      {items.map((item) => (
        <button
          key={item.view}
          className={`mobile-tab ${view === item.view ? "mobile-tab-active" : ""}`}
          onClick={() => onSelect(item.view)}
          aria-current={view === item.view ? "page" : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.count !== undefined && item.count > 0 && (
            <small>{item.count}</small>
          )}
        </button>
      ))}
    </nav>
  );
}

function SearchForm({
  query,
  setQuery,
  onSubmit,
  isLoading,
  inputRef,
}: {
  query: string;
  setQuery: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form className="search-form" onSubmit={onSubmit}>
      <Search size={19} />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ask about justice, leadership, patience…"
        aria-label="Ask a question about Nahjul Balagha"
      />
      <span className="search-shortcut">↵</span>
      <button
        className="search-submit"
        type="submit"
        disabled={isLoading || !query.trim()}
        aria-label="Search the text"
      >
        {isLoading ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <ArrowUpRight size={19} />
        )}
      </button>
    </form>
  );
}

function HomeView({
  onAsk,
  onRead,
}: {
  onAsk: (question: string) => void;
  onRead: () => void;
}) {
  const [homeQuery, setHomeQuery] = useState("");
  const today = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "2-digit",
  })
    .format(new Date())
    .toUpperCase();
  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="section-eyebrow">
            <span className="eyebrow-rule" /> {today}
          </div>
          <h1 className="welcome-title">
            A little wisdom
            <br />
            <em>for the day ahead.</em>
          </h1>
          <p className="welcome-copy">
            Enter the words of Imam Ali through questions, reading, and
            reflection.
          </p>
        </div>
        <div className="ornament" aria-hidden="true">
          <span>۞</span>
          <i />
          <i />
          <i />
        </div>
      </section>

      <section className="home-search-section" aria-label="Ask a question">
        <div className="home-search-heading">
          <Sparkles size={16} />
          <span>ASK THE TEXT</span>
          <span className="home-search-note">Answers with source passages</span>
        </div>
        <form
          className="search-form home-search"
          onSubmit={(event) => {
            event.preventDefault();
            void onAsk(homeQuery);
          }}
        >
          <Search size={19} />
          <input
            value={homeQuery}
            onChange={(event) => setHomeQuery(event.target.value)}
            placeholder="What would you like to understand?"
            aria-label="Ask a question"
          />
          <button
            className="search-submit"
            type="submit"
            disabled={!homeQuery.trim()}
            aria-label="Ask"
          >
            <ArrowUpRight size={19} />
          </button>
        </form>
        <div className="suggestion-row">
          <span>TRY ASKING</span>
          {starterQuestions.map((question) => (
            <button key={question} onClick={() => void onAsk(question)}>
              {question}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
      </section>

      <section className="home-columns">
        <div className="daily-reading">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">THE READING ROOM</span>
              <h2>Choose a path in.</h2>
            </div>
            <button className="text-link" onClick={onRead}>
              Open library <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="collection-grid">
            <button
              className="collection-card collection-card-dark"
              onClick={onRead}
            >
              <span className="card-index">01 / SERMONS</span>
              <span className="collection-card-icon">
                <MessageCircle size={19} />
              </span>
              <strong>
                Public counsel.
                <br />
                Inner clarity.
              </strong>
              <span className="card-bottom">
                241 sermons <ArrowUpRight size={16} />
              </span>
            </button>
            <button
              className="collection-card collection-card-light"
              onClick={onRead}
            >
              <span className="card-index">02 / LETTERS</span>
              <span className="collection-card-icon">
                <FileText size={19} />
              </span>
              <strong>
                Guidance for
                <br />
                the world.
              </strong>
              <span className="card-bottom">
                79 letters <ArrowUpRight size={16} />
              </span>
            </button>
            <button
              className="collection-card collection-card-gold"
              onClick={onRead}
            >
              <span className="card-index">03 / SAYINGS</span>
              <span className="collection-card-icon">
                <Feather size={19} />
              </span>
              <strong>
                Brief words.
                <br />
                Long echoes.
              </strong>
              <span className="card-bottom">
                480 sayings <ArrowUpRight size={16} />
              </span>
            </button>
          </div>
        </div>

        <aside className="continue-reading">
          <div className="section-eyebrow">A WAY TO BEGIN</div>
          <div className="book-glyph">
            <BookOpen size={23} strokeWidth={1.3} />
          </div>
          <h2>
            Read slowly.
            <br />
            <em>Return often.</em>
          </h2>
          <p>
            Browse the sermons, letters, and sayings. Ask a question whenever a
            passage invites a closer look.
          </p>
          <button className="outline-button" onClick={onRead}>
            Enter the reading room <ArrowUpRight size={16} />
          </button>
          <div className="reading-meta">
            <span>
              <Library size={14} /> ONE TEXT
            </span>
            <span>
              <History size={14} /> MANY LIVES
            </span>
          </div>
        </aside>
      </section>
    </>
  );
}

function StarterQuestions({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <div className="starter-block">
      <div className="starter-title">
        <span>QUESTIONS TO BEGIN WITH</span>
        <span>01 — 03</span>
      </div>
      {starterQuestions.map((question, index) => (
        <button
          className="starter-question"
          key={question}
          onClick={() => void onAsk(question)}
        >
          <span className="starter-number">0{index + 1}</span>
          <span>{question}</span>
          <ArrowUpRight size={16} />
        </button>
      ))}
    </div>
  );
}

function AnswerPanel({
  result,
  query,
  saved,
  onToggleSaved,
  commentaryOpen,
  onToggleCommentary,
}: {
  result: AskResult;
  query: string;
  saved: boolean;
  onToggleSaved: () => void;
  commentaryOpen: boolean;
  onToggleCommentary: () => void;
}) {
  return (
    <article className="answer-panel">
      <div className="answer-meta">
        <span>
          <span className="answer-dot" /> ANSWER FROM THE TEXT
        </span>
        <span>
          {result.sources.length} SOURCE{result.sources.length === 1 ? "" : "S"}{" "}
          FOUND
        </span>
      </div>
      <h2 className="answer-question">{query}</h2>
      <div className="answer-copy">
        {result.answer
          .split("\n")
          .filter(Boolean)
          .map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
      </div>
      <div className="answer-actions">
        <button
          className={`action-button ${saved ? "action-selected" : ""}`}
          onClick={onToggleSaved}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
          {saved ? "Saved" : "Save answer"}
        </button>
        <button className="action-button" onClick={onToggleCommentary}>
          <MessageCircle size={16} />
          {commentaryOpen ? "Hide notes" : "Reflect on this"}
        </button>
        <button
          className="action-icon"
          aria-label="Share answer"
          onClick={() => void navigator.clipboard?.writeText(result.answer)}
        >
          <Share2 size={16} />
        </button>
      </div>
      {commentaryOpen && (
        <div className="reflection-note">
          <span className="reflection-mark">✳</span>
          <div>
            <strong>A space to reflect</strong>
            <p>
              What part of this answer would you like to sit with? Try asking a
              follow-up question to explore a particular passage.
            </p>
          </div>
        </div>
      )}
      <div className="source-section">
        <div className="source-heading">
          <span>
            <BookOpen size={15} /> PASSAGES IN CONTEXT
          </span>
          <span>{result.sources.length} retrieved</span>
        </div>
        {result.sources.map((source, index) => (
          <details
            className="source-item"
            key={`${source.page ?? "source"}-${index}`}
            open={index === 0}
          >
            <summary>
              <span className="source-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="source-title">Nahjul Balagha</span>
              <span className="source-page">Page {source.page ?? "—"}</span>
              <ChevronDown className="source-chevron" size={16} />
            </summary>
            <p>{source.text}</p>
          </details>
        ))}
      </div>
    </article>
  );
}

function ReadView({ onAsk }: { onAsk: (question: string) => void }) {
  const [activeTab, setActiveTab] = useState("Sermons");
  const [bookQuery, setBookQuery] = useState("");
  const sections = [
    {
      name: "Sermons",
      count: "241",
      description:
        "Addresses on faith, justice, the life of the community, and the nature of the world.",
    },
    {
      name: "Letters",
      count: "79",
      description:
        "Counsel and correspondence on leadership, duty, and the care of people.",
    },
    {
      name: "Sayings",
      count: "480",
      description:
        "Concise reflections on character, knowledge, conduct, and the heart.",
    },
  ];
  const activeSection =
    sections.find((section) => section.name === activeTab) ?? sections[0];
  return (
    <section className="read-view">
      <button className="back-link" onClick={() => setActiveTab("Sermons")}>
        <ArrowDownLeft size={15} /> THE READING ROOM
      </button>
      <div className="section-eyebrow">
        <span className="eyebrow-rule" /> THE BOOK
      </div>
      <h1 className="page-title">
        A library of <em>living words.</em>
      </h1>
      <p className="page-intro">
        Move between the forms of the text, or search a subject to find its
        passages.
      </p>
      <div className="book-tabs" role="tablist" aria-label="Book sections">
        {sections.map((section) => (
          <button
            key={section.name}
            className={`book-tab ${activeTab === section.name ? "book-tab-active" : ""}`}
            onClick={() => setActiveTab(section.name)}
            role="tab"
            aria-selected={activeTab === section.name}
          >
            <span>{section.name}</span>
            <small>{section.count}</small>
          </button>
        ))}
      </div>
      <div className="reader-feature">
        <div className="reader-feature-top">
          <span>SELECTED SECTION</span>
          <span>NAHJUL BALAGHA</span>
        </div>
        <div className="reader-feature-body">
          <div className="reader-monogram">{activeSection.name[0]}</div>
          <div>
            <h2>{activeSection.name}</h2>
            <p>{activeSection.description}</p>
          </div>
          <span className="reader-count">
            {activeSection.count}
            <small>ENTRIES</small>
          </span>
        </div>
        <form
          className="reader-search"
          onSubmit={(event) => {
            event.preventDefault();
            if (bookQuery.trim())
              void onAsk(
                `Find passages in the ${activeSection.name.toLowerCase()} about ${bookQuery.trim()}.`,
              );
          }}
        >
          <Search size={17} />
          <input
            value={bookQuery}
            onChange={(event) => setBookQuery(event.target.value)}
            placeholder={`Find a theme in ${activeSection.name.toLowerCase()}…`}
            aria-label={`Search ${activeSection.name}`}
          />
          <button aria-label="Search section" type="submit">
            <ArrowUpRight size={17} />
          </button>
        </form>
      </div>
      <div className="reader-note">
        <BookOpen size={17} />
        <p>
          Choose a theme above to retrieve passages from your indexed
          translation. Every answer includes page references so you can return
          to the source.
        </p>
        <button
          onClick={() =>
            void onAsk(
              `What are the central themes in the ${activeSection.name.toLowerCase()}?`,
            )
          }
        >
          Explore a theme <ArrowUpRight size={15} />
        </button>
      </div>
    </section>
  );
}

function SavedView({
  saved,
  onAsk,
  onRemove,
}: {
  saved: SavedAnswer[];
  onAsk: (question: string) => void;
  onRemove: (question: string) => void;
}) {
  return (
    <section className="saved-view">
      <div className="section-eyebrow">
        <span className="eyebrow-rule" /> YOUR READING SPACE
      </div>
      <h1 className="page-title">
        Words to <em>return to.</em>
      </h1>
      <p className="page-intro">
        Keep useful answers close as you explore the text.
      </p>
      {saved.length === 0 ? (
        <div className="saved-empty">
          <div className="empty-mark">
            <Bookmark size={23} />
          </div>
          <h2>Nothing saved yet.</h2>
          <p>When an answer resonates, save it here to revisit later.</p>
          <button
            className="outline-button"
            onClick={() => void onAsk("What is wisdom?")}
          >
            Explore a question <ArrowUpRight size={16} />
          </button>
        </div>
      ) : (
        <div className="saved-list">
          {saved.map((item) => (
            <article className="saved-item" key={item.question}>
              <div className="saved-item-top">
                <span>
                  ANSWER <i>·</i> {item.sources.length} SOURCE
                  {item.sources.length === 1 ? "" : "S"}
                </span>
                <button
                  className="action-icon"
                  aria-label="Remove saved answer"
                  onClick={() => onRemove(item.question)}
                >
                  <X size={16} />
                </button>
              </div>
              <h2>{item.question}</h2>
              <p>{item.answer}</p>
              <button
                className="text-link"
                onClick={() => void onAsk(item.question)}
              >
                Reopen answer <ArrowUpRight size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default App;
