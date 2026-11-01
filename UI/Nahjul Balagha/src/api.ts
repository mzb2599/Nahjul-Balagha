import type {
  AskResponse,
  AskSource,
  Section,
  Topic,
  TopicDetail,
} from "./types";

const API_BASE_URL = (process.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      "The book service is unreachable. Check that the API is running.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail?: unknown }).detail)
        : "";
    throw new ApiError(
      detail || "The book service could not complete that request.",
      response.status,
    );
  }

  return payload as T;
}

export async function fetchSections(signal?: AbortSignal): Promise<Section[]> {
  const payload = await request<{ sections?: Section[] }>("/api/sections", {
    signal,
  });
  return payload.sections ?? [];
}

const topicsCache = new Map<number, Promise<Topic[]>>();

export function fetchTopics(
  sectionId: number,
  slug: string,
  force = false,
): Promise<Topic[]> {
  if (force) topicsCache.delete(sectionId);
  const cached = topicsCache.get(sectionId);
  if (cached) return cached;

  const promise = request<{ topics?: Topic[] }>(
    `/api/sections/${slug}/topics`,
  )
    .then((payload) => payload.topics ?? [])
    .catch((error: unknown) => {
      topicsCache.delete(sectionId);
      throw error;
    });

  topicsCache.set(sectionId, promise);
  return promise;
}

const topicCache = new Map<string, Promise<TopicDetail>>();

export function fetchTopic(topicId: string, force = false): Promise<TopicDetail> {
  if (force) topicCache.delete(topicId);
  const cached = topicCache.get(topicId);
  if (cached) return cached;

  const promise = request<TopicDetail>(`/api/topics/${topicId}`).catch(
    (error: unknown) => {
      topicCache.delete(topicId);
      throw error;
    },
  );

  topicCache.set(topicId, promise);
  return promise;
}

export function askBook(payload: {
  question: string;
  sectionId?: number;
  topicId?: string;
}): Promise<AskResponse> {
  return request<AskResponse>("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function sourceKey(source: AskSource, index: number): string {
  return `${source.topicId ?? source.page ?? "source"}-${index}`;
}
