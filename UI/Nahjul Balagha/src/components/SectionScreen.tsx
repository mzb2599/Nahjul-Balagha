import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";
import { fetchTopics } from "../api";
import type { AskContext, Section, Topic } from "../types";
import { SectionArt } from "./Artwork";
import { IconButton } from "./Chrome";

export function SectionScreen({
  section,
  onBack,
  onAsk,
  onOpenTopic,
  isDone,
  state,
}: {
  section: Section;
  onBack: () => void;
  onAsk: (context?: AskContext) => void;
  onOpenTopic: (topicId: string) => void;
  isDone: (topicId: string) => boolean;
  state: { done: Record<string, boolean>; last: string | null };
}) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchTopics(section.id, section.slug)
      .then((loaded) => {
        if (active) setTopics(loaded);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load this section.",
        );
      });
    return () => {
      active = false;
    };
  }, [attempt, section.id, section.slug]);

  const total = topics?.length ?? section.count;
  const doneCount = topics
    ? topics.filter((topic) => isDone(topic.id)).length
    : Object.keys(state.done).filter((id) =>
        id.startsWith(`${section.id}-`),
      ).length;
  const percent = total > 0 ? Math.min(100, (doneCount / total) * 100) : 0;
  const totalMinutes = topics
    ? topics.reduce((sum, topic) => sum + topic.minutes, 0)
    : Math.max(1, Math.round(total * 2.2));

  const currentTopic =
    topics?.find((topic) => !isDone(topic.id)) ?? topics?.[0] ?? null;
  const lastTopic =
    topics?.find((topic) => topic.id === state.last) ?? null;
  const allDone = Boolean(topics && topics.length > 0 && doneCount === topics.length);

  const ctaLabel = allDone
    ? "Read again"
    : lastTopic && !isDone(lastTopic.id)
      ? `Continue · ${lastTopic.title}`
      : doneCount > 0 && currentTopic
        ? `Continue · ${currentTopic.title}`
        : "Start reading";
  const ctaTarget = allDone
    ? topics?.[0]?.id
    : (lastTopic && !isDone(lastTopic.id) ? lastTopic : currentTopic)?.id;

  const theme = {
    "--accent": section.color,
    "--g1": section.g1,
    "--g2": section.g2,
  } as CSSProperties;

  return (
    <section className="screen section-screen" style={theme}>
      <div
        className="screen-scroll section-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          setScrolled(top > 210);
          setScrollTop(Math.min(top, 320));
        }}
      >
        <header className={`section-cover ${scrolled ? "is-scrolled" : ""}`}>
          <SectionArt
            id={section.id}
            className="section-cover-art"
            style={{ transform: `translate3d(0, ${scrollTop * 0.22}px, 0)` }}
          />
          <div className="section-cover-glow" />
          <div className="section-cover-copy">
            <span className="cover-eyebrow">
              COLLECTION {String(section.id).padStart(2, "0")}
            </span>
            <h1>{section.title}</h1>
            <p>{section.description}</p>
          </div>
        </header>

        <div className="section-sheet">
          <div className="section-stats" aria-label="Section progress">
            <div>
              <strong>{section.count.toLocaleString()}</strong>
              <span>Topics</span>
            </div>
            <div>
              <strong>{totalMinutes.toLocaleString()}m</strong>
              <span>Total read</span>
            </div>
            <div>
              <strong>{Math.round(percent)}%</strong>
              <span>Complete</span>
            </div>
          </div>

          <button
            type="button"
            className="primary-cta"
            disabled={!ctaTarget}
            onClick={() => ctaTarget && onOpenTopic(ctaTarget)}
          >
            <span>{ctaLabel}</span>
            <ArrowRight size={18} />
          </button>

          {error && (
            <div className="inline-error" role="alert">
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

          {!topics && !error && (
            <div className="timeline-skeletons" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => (
                <div className="skeleton skeleton-row" key={index} />
              ))}
            </div>
          )}

          {topics && (
            <ol className="topic-timeline">
              {topics.map((topic, index) => {
                const done = isDone(topic.id);
                const current = !done && topic.id === currentTopic?.id;
                return (
                  <li
                    key={topic.id}
                    className={`topic-row ${done ? "is-done" : ""} ${
                      current ? "is-current" : ""
                    }`}
                  >
                    <span className="timeline-node" aria-hidden="true">
                      {done ? (
                        <Check size={13} />
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <button
                      type="button"
                      className="topic-card"
                      onClick={() => onOpenTopic(topic.id)}
                      aria-label={`${topic.title}: ${topic.summary}`}
                    >
                      <span className="topic-card-top">
                        <strong>{topic.title}</strong>
                        {done ? (
                          <span className="pill pill-done">Completed</span>
                        ) : current ? (
                          <span className="pill pill-next">Up next</span>
                        ) : null}
                      </span>
                      <span className="topic-summary">{topic.summary}</span>
                      <span className="topic-meta">
                        <Clock size={13} />
                        {topic.minutes} min read · page {topic.page}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      <div className={`section-topbar ${scrolled ? "is-solid" : ""}`}>
        <IconButton label="Back" className="glass" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <span className="section-topbar-title" aria-hidden={!scrolled}>
          {section.title}
        </span>
        <IconButton
          label="Ask about this section"
          className="glass"
          onClick={() =>
            onAsk({
              sectionId: section.id,
              label: section.title,
            })
          }
        >
          <Sparkles size={19} />
        </IconButton>
      </div>
    </section>
  );
}
