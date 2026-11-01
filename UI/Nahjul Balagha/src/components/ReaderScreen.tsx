import type { CSSProperties, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Moon,
  Settings2,
  Sparkles,
  Sun,
  Sunrise,
  X,
} from "lucide-react";
import { fetchTopic, fetchTopics } from "../api";
import type {
  AskContext,
  ReadingTheme,
  Section,
  Topic,
  TopicDetail,
} from "../types";
import { IconButton } from "./Chrome";

const THEMES: { id: ReadingTheme; label: string; icon: typeof Sun }[] = [
  { id: "paper", label: "Paper", icon: Sun },
  { id: "sepia", label: "Sepia", icon: Sunrise },
  { id: "night", label: "Night", icon: Moon },
];

export function ReaderScreen({
  topicId,
  sections,
  onBack,
  onAsk,
  onChangeTopic,
  isDone,
  markDone,
  isSaved,
  toggleSaved,
  remember,
  size,
  theme,
  setSize,
  setTheme,
}: {
  topicId: string;
  sections: Section[];
  onBack: () => void;
  onAsk: (context?: AskContext) => void;
  onChangeTopic: (topicId: string) => void;
  isDone: (topicId: string) => boolean;
  markDone: (topicId: string) => void;
  isSaved: (topicId: string) => boolean;
  toggleSaved: (topic: { id: string; title: string; sectionId: number }) => void;
  remember: (topicId: string, title: string) => void;
  size: number;
  theme: ReadingTheme;
  setSize: (size: number) => void;
  setTheme: (theme: ReadingTheme) => void;
}) {
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(false);

  const sectionId = Number(topicId.split("-")[0]);
  const section = sections.find((item) => item.id === sectionId);
  const accent = section?.color ?? "var(--amber)";

  useEffect(() => {
    let active = true;
    doneRef.current = false;

    fetchTopic(topicId, attempt > 0)
      .then((loaded) => {
        if (!active) return;
        setDetail(loaded);
        remember(loaded.id, loaded.title);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not open this topic.",
        );
      });

    if (section) {
      fetchTopics(section.id, section.slug)
        .then((loaded) => {
          if (active) setTopics(loaded);
        })
        .catch(() => {
          if (active) setTopics(null);
        });
    }

    return () => {
      active = false;
    };
  }, [attempt, remember, section, topicId]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const index = topics?.findIndex((topic) => topic.id === topicId) ?? -1;
  const previous = index > 0 ? topics?.[index - 1] : undefined;
  const next =
    topics && index >= 0 && index < topics.length - 1
      ? topics[index + 1]
      : undefined;
  const total = topics?.length ?? 0;
  const saved = isSaved(topicId);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const max = element.scrollHeight - element.clientHeight;
    const value = max > 0 ? (element.scrollTop / max) * 100 : 100;
    setProgress(value);
    if (value >= 90 && detail && !doneRef.current) {
      doneRef.current = true;
      markDone(detail.id);
    }
  }

  function completeAndContinue() {
    if (!detail) return;
    markDone(detail.id);
    doneRef.current = true;
    if (next) onChangeTopic(next.id);
    else onBack();
  }

  const lead = detail?.paragraphs[0] ?? "";
  const rest = detail?.paragraphs.slice(1) ?? [];
  const keyIdea =
    detail?.keyIdeas && detail.keyIdeas !== lead ? detail.keyIdeas : "";

  const themeVars = {
    "--accent": accent,
    "--g1": section?.g1 ?? "#ffb347",
    "--g2": section?.g2 ?? "#b45309",
  } as CSSProperties;

  return (
    <section
      className={`screen reader-screen theme-${theme}`}
      style={themeVars}
    >
      <header className="reader-topbar">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <span className="reader-position">
          {index >= 0 && total > 0
            ? `TOPIC ${index + 1} / ${total}`
            : detail?.section.toUpperCase() ?? "READING"}
        </span>
        <div className="reader-topbar-actions">
          <IconButton
            label={saved ? "Remove bookmark" : "Bookmark this topic"}
            pressed={saved}
            onClick={() =>
              detail &&
              toggleSaved({
                id: detail.id,
                title: detail.title,
                sectionId: detail.sectionId,
              })
            }
          >
            <Bookmark size={19} fill={saved ? "currentColor" : "none"} />
          </IconButton>
          <IconButton
            label="Reading settings"
            pressed={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={19} />
          </IconButton>
        </div>
        <span
          className="reading-progress-track"
          aria-hidden="true"
        >
          <span
            className="reading-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </span>
      </header>

      <div
        className="reader-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {error && (
          <div className="reader-state" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}

        {!error && !detail && (
          <div className="reader-skeleton" aria-hidden="true">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line title" />
            <div className="skeleton skeleton-line title second" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
          </div>
        )}

        {detail && (
          <article className="reader-article">
            <p className="reader-crumb">
              {detail.section.toUpperCase()} · PAGE {detail.page}
            </p>
            <h1>{detail.title}</h1>
            <p className="reader-lead" style={{ fontSize: `${size}px` }}>
              {lead}
            </p>
            {keyIdea && (
              <aside className="key-idea">
                <span>KEY IDEA</span>
                <p style={{ fontSize: `${Math.max(16, size - 1)}px` }}>
                  {keyIdea}
                </p>
              </aside>
            )}
            {rest.map((paragraph, paragraphIndex) => (
              <p
                key={`${detail.id}-${paragraphIndex}`}
                style={{ fontSize: `${size}px` }}
              >
                {paragraph}
              </p>
            ))}

            <div className="reader-finish">
              <button
                type="button"
                className="finish-button"
                onClick={completeAndContinue}
              >
                <span>
                  {next ? "Finish & next topic" : "Finish this collection"}
                </span>
                {next ? <ArrowRight size={18} /> : <Check size={18} />}
              </button>
              <p>
                {isDone(topicId)
                  ? "Marked as read."
                  : "Scrolling past 90% also marks this topic as read."}
              </p>
            </div>
          </article>
        )}
      </div>

      <nav className="reader-dock" aria-label="Topic navigation">
        <IconButton
          label="Previous topic"
          disabled={!previous}
          onClick={() => previous && onChangeTopic(previous.id)}
        >
          <ChevronLeft size={20} />
        </IconButton>
        <button
          type="button"
          className="dock-ask"
          onClick={() =>
            onAsk({
              sectionId,
              topicId,
              label: detail?.title ?? topicId,
            })
          }
        >
          <Sparkles size={16} />
          <span>Ask about this</span>
        </button>
        <IconButton
          label="Next topic"
          disabled={!next}
          onClick={() => next && onChangeTopic(next.id)}
        >
          <ChevronRight size={20} />
        </IconButton>
      </nav>

      {settingsOpen && (
        <div
          className="sheet-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <div
            className="settings-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-heading">
              <h2 id="settings-title">Reading comfort</h2>
              <IconButton label="Close settings" onClick={() => setSettingsOpen(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <fieldset className="theme-options">
              <legend>Theme</legend>
              <div>
                {THEMES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`theme-option theme-option-${id} ${
                      theme === id ? "is-active" : ""
                    }`}
                    aria-pressed={theme === id}
                    onClick={() => setTheme(id)}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="size-control">
              <span>Text size · {size}px</span>
              <input
                type="range"
                min={16}
                max={24}
                step={1}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
                aria-label="Text size"
              />
            </label>
            <p className="sheet-note">
              Preferences are saved on this device.
            </p>
          </div>
        </div>
      )}

      {!detail && !error && (
        <div className="reader-loading-note" role="status">
          <LoaderCircle className="spin" size={16} /> Opening the text…
        </div>
      )}
    </section>
  );
}
