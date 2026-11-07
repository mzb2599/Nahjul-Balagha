import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  TOPIC_PAGE_SIZE,
  fetchTopicPage,
  getCachedSectionTopics,
  prefetchTopicDetails,
} from "../api";
import type { AskContext, Section, Topic } from "../types";
import { SectionArt } from "./Artwork";
import { IconButton } from "./Chrome";

// Remember where the reader was in each collection so coming back from a topic
// restores the list and scroll position instead of starting again.
const sectionScrollPositions = new Map<number, number>();

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
  const cachedSection = getCachedSectionTopics(section.id);
  const restoredScroll = sectionScrollPositions.get(section.id) ?? 0;
  const initialScrollRef = useRef(restoredScroll);
  const [topics, setTopics] = useState<Topic[]>(
    () => cachedSection?.topics ?? [],
  );
  const [totalCount, setTotalCount] = useState(
    () => cachedSection?.total || section.count,
  );
  const [hasMore, setHasMore] = useState(
    () => cachedSection?.hasMore ?? false,
  );
  const [nextOffset, setNextOffset] = useState<number | null>(
    () => cachedSection?.nextOffset ?? null,
  );
  const [loading, setLoading] = useState(() => !cachedSection);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [scrolled, setScrolled] = useState(() => restoredScroll > 210);
  const [scrollTop, setScrollTop] = useState(() =>
    Math.min(restoredScroll, 320),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && initialScrollRef.current > 0) {
      element.scrollTop = initialScrollRef.current;
    }
  }, [section.id]);

  // First page. It is normally already in the client cache (seeded by
  // `prefetchInitialContent`), so this resolves without a visible delay.
  useEffect(() => {
    let active = true;

    fetchTopicPage(section.id, section.slug, 0, TOPIC_PAGE_SIZE, attempt > 0)
      .then((page) => {
        if (!active) return;
        const snapshot = getCachedSectionTopics(section.id);
        const view = snapshot ?? {
          topics: page.topics,
          total: page.total,
          hasMore: page.hasMore,
          nextOffset: page.nextOffset,
        };
        setTopics(view.topics);
        setTotalCount(view.total || section.count);
        setHasMore(view.hasMore);
        setNextOffset(view.nextOffset);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load this section.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [attempt, section.count, section.id, section.slug]);

  const loadMore = useCallback(() => {
    if (loading || loadingMoreRef.current || !hasMore || nextOffset === null) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");

    fetchTopicPage(section.id, section.slug, nextOffset, TOPIC_PAGE_SIZE)
      .then((page) => {
        const snapshot = getCachedSectionTopics(section.id);
        if (snapshot) {
          setTopics(snapshot.topics);
          setTotalCount(snapshot.total);
          setHasMore(snapshot.hasMore);
          setNextOffset(snapshot.nextOffset);
          return;
        }
        setTopics((current) => {
          const seen = new Set(current.map((topic) => topic.id));
          return [
            ...current,
            ...page.topics.filter((topic) => !seen.has(topic.id)),
          ];
        });
        setTotalCount((current) => page.total || current);
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load more topics.",
        );
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [hasMore, loading, nextOffset, section.id, section.slug]);

  // Load the next page a little before the reader reaches the bottom.
  useEffect(() => {
    if (!hasMore || error || loading) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: scrollRef.current, rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, hasMore, loadMore, loading, topics.length]);

  // Pre-warm details for every card that is already on screen, so tapping one
  // opens the reader immediately.
  useEffect(() => {
    if (topics.length > 0) {
      prefetchTopicDetails(topics.map((topic) => topic.id));
    }
  }, [topics]);

  const total = totalCount || section.count;
  const doneCount = Object.keys(state.done).filter((id) =>
    id.startsWith(`${section.id}-`),
  ).length;
  const percent = total > 0 ? Math.min(100, (doneCount / total) * 100) : 0;
  const totalMinutes = topics.length
    ? Math.max(
        1,
        Math.round(
          (topics.reduce((sum, topic) => sum + topic.minutes, 0) /
            topics.length) *
            total,
        ),
      )
    : Math.max(1, Math.round(total * 2.2));

  const currentTopic =
    topics.find((topic) => !isDone(topic.id)) ?? topics[0] ?? null;
  const lastTopic =
    topics.find((topic) => topic.id === state.last) ?? null;
  const allDone = !hasMore && total > 0 && doneCount >= total;

  const ctaLabel = allDone
    ? "Read again"
    : lastTopic && !isDone(lastTopic.id)
      ? `Continue · ${lastTopic.title}`
      : doneCount > 0 && currentTopic
        ? `Continue · ${currentTopic.title}`
        : "Start reading";
  const ctaTarget = allDone
    ? topics[0]?.id
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
          sectionScrollPositions.set(section.id, top);
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

          {error && topics.length === 0 && (
            <div className="inline-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  setTopics([]);
                  setHasMore(false);
                  setNextOffset(null);
                  setLoading(true);
                  setAttempt((value) => value + 1);
                }}
              >
                Try again
              </button>
            </div>
          )}

          {loading && topics.length === 0 && (
            <div className="timeline-skeletons" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => (
                <div className="skeleton skeleton-row" key={index} />
              ))}
            </div>
          )}

          {topics.length > 0 && (
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

          {loadingMore && (
            <div className="timeline-skeletons" aria-hidden="true">
              <div className="skeleton skeleton-row" />
              <div className="skeleton skeleton-row" />
            </div>
          )}

          {error && topics.length > 0 && (
            <div className="inline-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  loadMore();
                }}
              >
                Try again
              </button>
            </div>
          )}

          {hasMore && !error && !loadingMore && (
            <div
              className="scroll-sentinel"
              ref={sentinelRef}
              aria-hidden="true"
            />
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
