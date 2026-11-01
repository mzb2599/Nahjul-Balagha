import type { CSSProperties } from "react";
import { ArrowRight, Bookmark, Compass } from "lucide-react";
import type { Section, SavedTopic } from "../types";
import { EmptyMark } from "./Chrome";

export function SavedScreen({
  saved,
  sections,
  onOpenTopic,
  onExplore,
}: {
  saved: SavedTopic[];
  sections: Section[];
  onOpenTopic: (topicId: string) => void;
  onExplore: () => void;
}) {
  return (
    <section className="screen saved-screen">
      <div className="screen-scroll saved-scroll">
        <header className="saved-header">
          <p className="eyebrow">YOUR READING SPACE</p>
          <h1>
            Words to <em>return to.</em>
          </h1>
          <p className="saved-intro">
            Bookmarked topics stay on this device, ready when you are.
          </p>
        </header>

        {saved.length === 0 ? (
          <div className="saved-empty">
            <EmptyMark>
              <Bookmark size={24} />
            </EmptyMark>
            <h2>Nothing saved yet.</h2>
            <p>
              While reading, tap the bookmark button to keep a topic close.
            </p>
            <button type="button" className="outline-cta" onClick={onExplore}>
              Explore the book <Compass size={16} />
            </button>
          </div>
        ) : (
          <ol className="saved-list">
            {saved.map((topic) => {
              const section = sections.find(
                (item) => item.id === topic.sectionId,
              );
              const style = section
                ? ({
                    "--accent": section.color,
                    "--g1": section.g1,
                    "--g2": section.g2,
                  } as CSSProperties)
                : undefined;
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    className="saved-card"
                    style={style}
                    onClick={() => onOpenTopic(topic.id)}
                  >
                    <span className="saved-thumbnail">
                      <Bookmark size={18} />
                    </span>
                    <span className="saved-copy">
                      <span className="saved-section">
                        {section?.title ?? "Nahjul Balagha"}
                      </span>
                      <strong>{topic.title}</strong>
                      <small>Tap to read</small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
