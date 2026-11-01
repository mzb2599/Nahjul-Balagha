import { useEffect, useState } from "react";
import { askBook } from "./api";
import type { AskContext, AskSource } from "./types";

export type ChatMessage = {
  id: string;
  role: "user" | "sage";
  text: string;
  sources?: AskSource[];
  revealed?: number;
};

let messageCounter = 0;
function nextMessageId() {
  messageCounter += 1;
  return `m-${messageCounter}`;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useSageChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);

  useEffect(() => {
    if (!streamingId) return;
    const timer = window.setInterval(() => {
      let finished = false;
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== streamingId || message.revealed === undefined) {
            return message;
          }
          const step = Math.max(2, Math.ceil(message.text.length / 90));
          const revealed = Math.min(message.text.length, message.revealed + step);
          if (revealed >= message.text.length) finished = true;
          return { ...message, revealed };
        }),
      );
      if (finished) {
        window.clearInterval(timer);
        setStreamingId(null);
      }
    }, 34);
    return () => window.clearInterval(timer);
  }, [streamingId]);

  async function send(question: string, context?: AskContext) {
    const clean = question.trim();
    if (!clean || typing) return;

    setError("");
    setMessages((current) => [
      ...current,
      { id: nextMessageId(), role: "user", text: clean },
    ]);
    setTyping(true);

    try {
      const response = await askBook({
        question: clean,
        sectionId: context?.sectionId,
        topicId: context?.topicId,
      });
      const id = nextMessageId();
      const reduced = prefersReducedMotion();
      setMessages((current) => [
        ...current,
        {
          id,
          role: "sage",
          text: response.answer,
          sources: response.sources,
          revealed: reduced ? response.answer.length : 0,
        },
      ]);
      if (!reduced) setStreamingId(id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sage could not answer that question.",
      );
    } finally {
      setTyping(false);
    }
  }

  function reset() {
    setMessages([]);
    setError("");
    setStreamingId(null);
  }

  return {
    messages,
    typing,
    error,
    send,
    reset,
    clearError: () => setError(""),
  };
}

export type SageChat = ReturnType<typeof useSageChat>;
