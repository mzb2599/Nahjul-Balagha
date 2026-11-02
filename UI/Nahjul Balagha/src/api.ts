import type {
  AskResponse,
  AskSource,
  Section,
  Topic,
  TopicDetail,
} from "./types";

const API_BASE_URL = (process.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// Render's free tier can take a while to wake up, and Gemini can be slow on the
// first request. Give the answer enough time before the browser gives up.
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

export class ApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status = 0, retryable = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return "";
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail) return JSON.stringify(detail);
  return "";
}

function friendlyMessage(status: number, detail: string): string {
  if (status === 403) {
    return (
      detail ||
      "The AI service is private and rejected this site. Enable ALLOW_PUBLIC_API and add this origin to CORS_ORIGINS on the server."
    );
  }
  if (status === 422) {
    return (
      "The AI service rejected the request. The deployed backend may be out of date; redeploy the latest API."
    );
  }
  if (status === 503 && !detail) {
    return "The AI service is waking up or temporarily unavailable. Please try again shortly.";
  }
  return detail || "The book service could not complete that request.";
}

async function fetchWithTimeout(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const externalSignal = init?.signal;
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    if (timedOut) {
      throw new ApiError(
        "The AI is taking too long to answer. The server may still be waking up — please try again.",
        0,
        true,
      );
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      "The book service is unreachable. Check your connection and that the API is running.",
      0,
      true,
    );
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

async function attempt<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(path, init);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = extractDetail(payload);
    throw new ApiError(
      friendlyMessage(response.status, detail),
      response.status,
      response.status === 429 || response.status >= 500,
    );
  }

  return payload as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attemptNumber = 1; ; attemptNumber += 1) {
    try {
      return await attempt<T>(path, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      const retryable = error instanceof ApiError && error.retryable;
      if (!retryable || attemptNumber >= MAX_ATTEMPTS) throw error;
      const delay = 700 * 2 ** (attemptNumber - 1) + Math.random() * 500;
      await sleep(delay);
    }
  }
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
    // `query` is sent for older API deployments that predate the `question`
    // field; the current API reads `question` first.
    body: JSON.stringify({ ...payload, query: payload.question }),
  });
}

export function sourceKey(source: AskSource, index: number): string {
  return `${source.topicId ?? source.page ?? "source"}-${index}`;
}
