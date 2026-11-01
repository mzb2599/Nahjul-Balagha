import { useCallback, useEffect, useState } from "react";
import type { ReadingTheme, SageState, SavedTopic } from "./types";

const STORAGE_KEY = "sage";

const DEFAULT_STATE: SageState = {
  done: {},
  saved: [],
  last: null,
  lastTitle: null,
  size: 19,
  theme: "paper",
};

function isTheme(value: unknown): value is ReadingTheme {
  return value === "paper" || value === "sepia" || value === "night";
}

function loadState(): SageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SageState>;
    return {
      done: parsed.done ?? {},
      saved: Array.isArray(parsed.saved)
        ? (parsed.saved as SavedTopic[])
        : [],
      last: parsed.last ?? null,
      lastTitle: parsed.lastTitle ?? null,
      size:
        typeof parsed.size === "number" && parsed.size >= 16 && parsed.size <= 24
          ? parsed.size
          : DEFAULT_STATE.size,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_STATE.theme,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function useSageStore() {
  const [state, setState] = useState<SageState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing or a full quota should never break reading.
    }
  }, [state]);

  const markDone = useCallback((topicId: string) => {
    setState((current) =>
      current.done[topicId]
        ? current
        : { ...current, done: { ...current.done, [topicId]: true } },
    );
  }, []);

  const toggleSaved = useCallback((topic: SavedTopic) => {
    setState((current) => {
      const exists = current.saved.some((item) => item.id === topic.id);
      return {
        ...current,
        saved: exists
          ? current.saved.filter((item) => item.id !== topic.id)
          : [topic, ...current.saved],
      };
    });
  }, []);

  const remember = useCallback((topicId: string, title: string) => {
    setState((current) => ({ ...current, last: topicId, lastTitle: title }));
  }, []);

  const setSize = useCallback((size: number) => {
    setState((current) => ({
      ...current,
      size: Math.min(24, Math.max(16, size)),
    }));
  }, []);

  const setTheme = useCallback((theme: ReadingTheme) => {
    setState((current) => ({ ...current, theme }));
  }, []);

  const isDone = useCallback(
    (topicId: string) => Boolean(state.done[topicId]),
    [state.done],
  );

  const isSaved = useCallback(
    (topicId: string) => state.saved.some((item) => item.id === topicId),
    [state.saved],
  );

  return {
    state,
    markDone,
    toggleSaved,
    remember,
    setSize,
    setTheme,
    isDone,
    isSaved,
  };
}
