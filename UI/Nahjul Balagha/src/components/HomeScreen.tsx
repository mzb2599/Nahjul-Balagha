import type { CSSProperties } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Sparkles,
  Sunrise,
} from "lucide-react";
import type { AskContext, SageState, Section } from "../types";
import { SectionArt } from "./Artwork";
import { Orb, ProgressRing } from "./Chrome";

const DAILY_SAYING = {
  id: "3-2",
  title: "Saying 2",
  text: "Whoever adopts greed as a habit devalues himself; whoever discloses his hardship agrees to be humiliated, and whoever allows his tongue to overpower his soul debases the soul.",
  section: "Sayings",
  page: 828,
};

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function sectionTheme(section: Section): CSSProperties {
  return {
    "--accent": section.color,
    "--g1": section.g1,
    "--g2": section.g2,
  } as CSSProperties;
}

export function HomeScreen({
  sections,
  loading,
  error,
  onRetry,
  state,
  onOpenSection,
  onOpenTopic,
  onAsk,
}: {
  sections: Section[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  state: SageState;
  onOpenSection: (sectionId: number) => void;
  onOpenTopic: (topicId: string) => void;
  onAsk: (context?: AskContext) => void;
}) {
  const greeting = greetingFor(new Date().getHours());
  const lastSection = sections.find(
    (section) => state.last?.startsWith(`${section.id}-`) ?? false,
  );
  const continueTitle = state.lastTitle ?? "Start here";
  const continueSection = lastSection ?? sections[0];
  const continueTopicId = state.last ?? "1-1";
  const continueDone = continueSection
    ? Object.keys(state.done).filter((id) =>
        id.startsWith(`${continueSection.id}-`),
      ).length
    : 0;
  const continuePercent = continueSection
    ? Math.min(100, (continueDone / continueSection.count) * 100)
    : 0;

  return (
    <section className="screen home-screen">
      <div className="screen-scroll home-scroll">
        <header className="home-header">
          <div>
            <p className="greeting">{greeting}, reader</p>
            <h1>
              Feed your <em>curious mind.</em>
            </h1>
          </div>
          <span className="avatar-ring" aria-hidden="true">
            <span>M</span>
          </span>
        </header>

        <button
          type="button"
          className="continue-card"
          onClick={() => onOpenTopic(continueTopicId)}
        >
          <div className="continue-copy">
            <span className="continue-label">
              {state.last ? "CONTINUE READING" : "START HERE"}
            </span>
            <strong>{continueTitle}</strong>
            <span className="continue-meta">
              {continueSection?.title ?? "Sermons"}
              {state.last ? " · pick up where you left off" : " · Sermon 1"}
            </span>
          </div>
          <ProgressRing
            value={continuePercent}
            size={56}
            label={`${Math.round(continuePercent)}% of ${continueSection?.title ?? "the section"} read`}
          />
        </button>

        <div className="home-section-heading">
          <h2>Read the book</h2>
          <span>Three collections</span>
        </div>

        {loading && (
          <div className="section-skeletons" aria-hidden="true">
            <div className="skeleton skeleton-cover" />
            <div className="skeleton skeleton-cover" />
            <div className="skeleton skeleton-cover" />
          </div>
        )}

        {error && !loading && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            <button type="button" className="text-button" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="cover-stack">
            {sections.map((section) => {
              const done = Object.keys(state.done).filter((id) =>
                id.startsWith(`${section.id}-`),
              ).length;
              const percent = Math.min(100, (done / section.count) * 100);
              return (
                <button
                  key={section.id}
                  type="button"
                  className="cover-card"
                  style={sectionTheme(section)}
                  onClick={() => onOpenSection(section.id)}
                  aria-label={`${section.title}: ${done} of ${section.count} read`}
                >
                  <SectionArt id={section.id} className="cover-art" />
                  <span className="cover-topline">
                    <span className="cover-number">
                      {String(section.id).padStart(2, "0")}
                    </span>
                    <span className="glass-pill">
                      {section.count.toLocaleString()} topics
                    </span>
                  </span>
                  <span className="cover-body">
                    <strong>{section.title}</strong>
                    <span className="cover-description">{section.description}</span>
                    <span className="cover-progress">
                      <span className="cover-progress-track">
                        <span
                          className="cover-progress-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="cover-progress-label">
                        {done} of {section.count} completed
                      </span>
                    </span>
                  </span>
                  <span className="cover-arrow" aria-hidden="true">
                    <ArrowRight size={18} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          className="ask-card"
          onClick={() => onAsk()}
        >
          <span className="ask-card-orbit">
            <Orb size={74} />
          </span>
          <span className="ask-card-copy">
            <span className="ask-card-eyebrow">SAGE · AI COMPANION</span>
            <strong>Ask the book</strong>
            <span>Answers grounded in the text, with sources you can open.</span>
          </span>
          <span className="ask-card-button" aria-hidden="true">
            <Sparkles size={17} />
          </span>
        </button>

        <section className="daily-wisdom" aria-labelledby="daily-wisdom-title">
          <div className="daily-heading">
            <span>DAILY WISDOM</span>
            <Sunrise size={16} />
          </div>
          <blockquote id="daily-wisdom-title">
            “{DAILY_SAYING.text}”
          </blockquote>
          <div className="daily-footer">
            <span>
              {DAILY_SAYING.section} · page {DAILY_SAYING.page}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => onOpenTopic(DAILY_SAYING.id)}
            >
              <BookOpen size={15} /> Read {DAILY_SAYING.title}
            </button>
          </div>
        </section>

        <p className="home-footnote">
          <Clock size={14} /> A few minutes a day is enough. Progress is saved on
          this device.
        </p>
      </div>
    </section>
  );
}
