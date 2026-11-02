import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CornerDownLeft,
  LoaderCircle,
  Send,
  Sparkles,
  SquarePen,
} from "lucide-react";
import { sourceKey } from "../api";
import type { SageChat } from "../chat";
import type { AskContext, AskSource, Section } from "../types";
import { IconButton, Orb } from "./Chrome";

const HOME_SUGGESTIONS = [
  "What is wisdom?",
  "How should a just leader govern?",
  "What does the book say about patience?",
];

const READING_SUGGESTIONS = [
  "Summarize this topic in plain language.",
  "What is the key lesson here?",
  "Find related passages elsewhere in the book.",
];

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function AskScreen({
  chat,
  context,
  sections,
  onBack,
  onOpenSource,
}: {
  chat: SageChat;
  context?: AskContext;
  sections: Section[];
  onBack: () => void;
  onOpenSource: (source: AskSource) => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    });
  }, [chat.messages, chat.typing]);

  const suggestions = context ? READING_SUGGESTIONS : HOME_SUGGESTIONS;
  const empty = chat.messages.length === 0 && !chat.typing && !chat.error;

  return (
    <section className="screen ask-screen">
      <header className="ask-header">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <div className="ask-title">
          <span className="ask-title-mark">
            <Sparkles size={14} />
          </span>
          <strong>Ask Sage</strong>
        </div>
        <IconButton
          label="Start a new chat"
          onClick={chat.reset}
          disabled={chat.messages.length === 0 && !chat.error}
        >
          <SquarePen size={19} />
        </IconButton>
      </header>

      {context?.label && (
        <div
          className="context-chip"
          aria-label={`Reading context: ${context.label}`}
        >
          <BookOpen size={14} />
          <span>
            Focused on <strong>{context.label}</strong>
          </span>
        </div>
      )}

      <div className="ask-scroll">
        {empty && (
          <div className="ask-empty">
            <Orb size={96} />
            <h1>What would you like to understand?</h1>
            <p>
              Sage answers only from Nahjul Balagha and shows the passages it
              used.
            </p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="suggestion"
                  onClick={() => void chat.send(suggestion, context)}
                >
                  <span>{suggestion}</span>
                  <CornerDownLeft size={15} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-log" aria-live="polite">
          {chat.messages.map((message) => (
            <div
              key={message.id}
              className={`chat-turn chat-${message.role}`}
            >
              {message.role === "sage" && (
                <span className="sage-avatar" aria-hidden="true">
                  <Sparkles size={14} />
                </span>
              )}
              <div className="chat-content">
                <div className="chat-bubble">
                  {message.revealed === undefined ||
                  message.revealed >= message.text.length
                    ? message.text
                    : message.text.slice(0, message.revealed)}
                  {message.revealed !== undefined &&
                    message.revealed < message.text.length && (
                      <span className="typing-caret" aria-hidden="true" />
                    )}
                </div>
                {message.sources && message.sources.length > 0 && (
                  <div className="source-cards">
                    <span className="source-cards-label">
                      SOURCES · {message.sources.length}
                    </span>
                    {message.sources.map((source, index) => {
                      const section = sections.find(
                        (item) => item.id === source.sectionId,
                      );
                      const clickable = Boolean(
                        source.topicId || source.sectionId,
                      );
                      return (
                        <button
                          key={sourceKey(source, index)}
                          type="button"
                          className="source-card"
                          style={
                            section
                              ? {
                                  background: `linear-gradient(120deg, ${section.g1}, ${section.g2})`,
                                }
                              : undefined
                          }
                          disabled={!clickable}
                          onClick={() => clickable && onOpenSource(source)}
                          aria-label={
                            clickable
                              ? `Open ${source.label ?? "source"}`
                              : undefined
                          }
                        >
                          <span className="source-card-mark">
                            <BookOpen size={15} />
                          </span>
                          <span className="source-card-copy">
                            <strong>
                              {source.label ?? section?.title ?? "Passage"}
                            </strong>
                            <small>
                              {source.section ??
                                section?.title ??
                                "Nahjul Balagha"}
                              {source.page !== undefined
                                ? ` · p. ${source.page}`
                                : ""}
                            </small>
                          </span>
                          {clickable && <span aria-hidden="true">›</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {chat.typing && (
            <div className="chat-turn chat-sage">
              <span className="sage-avatar" aria-hidden="true">
                <Sparkles size={14} />
              </span>
              <div
                className="chat-bubble typing-bubble"
                aria-label="Sage is thinking"
              >
                <span />
                <span />
                <span />
              </div>
              {chat.slow && (
                <p className="chat-hint">
                  Waking the archive… the free server can take up to a minute to
                  answer.
                </p>
              )}
            </div>
          )}

          {chat.error && (
            <div className="chat-error" role="alert">
              <p>{chat.error}</p>
              <button
                type="button"
                className="text-button"
                onClick={chat.clearError}
              >
                Dismiss
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void chat.send(input, context);
          setInput("");
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about the book…"
          aria-label="Ask Sage a question"
        />
        <button
          type="submit"
          className="composer-send"
          disabled={!input.trim() || chat.typing}
          aria-label="Send question"
        >
          {chat.typing ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </section>
  );
}
