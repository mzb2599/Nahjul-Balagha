export type Section = {
  id: number;
  slug: string;
  title: string;
  description: string;
  color: string;
  g1: string;
  g2: string;
  count: number;
};

export type Topic = {
  id: string;
  number: number;
  title: string;
  summary: string;
  page: number;
  minutes: number;
};

export type TopicDetail = Topic & {
  sectionId: number;
  section: string;
  sectionSlug: string;
  paragraphs: string[];
  keyIdeas: string;
  text: string;
};

export type AskSource = {
  page?: number | string;
  text?: string;
  score?: number;
  sectionId?: number;
  topicId?: string;
  label?: string;
  section?: string;
};

export type AskResponse = {
  answer: string;
  sources: AskSource[];
};

export type AskContext = {
  sectionId?: number;
  topicId?: string;
  label?: string;
};

export type ReadingTheme = "paper" | "sepia" | "night";

export type SavedTopic = {
  id: string;
  title: string;
  sectionId: number;
};

export type SageState = {
  done: Record<string, boolean>;
  saved: SavedTopic[];
  last: string | null;
  lastTitle: string | null;
  size: number;
  theme: ReadingTheme;
};

export type Screen =
  | { name: "home" }
  | { name: "saved" }
  | { name: "section"; sectionId: number }
  | { name: "reader"; topicId: string }
  | { name: "ask"; context?: AskContext };
