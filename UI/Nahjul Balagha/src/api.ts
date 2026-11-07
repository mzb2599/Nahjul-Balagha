import type {
  AskResponse,
  AskSource,
  BootstrapPayload,
  Section,
  Topic,
  TopicDetail,
  TopicPage,
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

export const TOPIC_PAGE_SIZE = 12;
const DETAIL_PREFETCH_LIMIT = 6;

export type SectionTopicSnapshot = {
  topics: Topic[];
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
};

type TopicPageResponse = {
  topics?: Topic[];
  count?: number;
  total?: number;
  offset?: number;
  limit?: number | null;
  hasMore?: boolean;
  nextOffset?: number | null;
};

const topicPageCache = new Map<string, Promise<TopicPage>>();
const sectionTopicSnapshots = new Map<number, SectionTopicSnapshot>();

function pageKey(sectionId: number, offset: number, limit: number): string {
  return `${sectionId}:${offset}:${limit}`;
}

function mergeSectionSnapshot(
  sectionId: number,
  page: TopicPage,
  reset: boolean,
): SectionTopicSnapshot {
  const existing = sectionTopicSnapshots.get(sectionId);

  // Re-requesting an earlier page (for example after remounting the section)
  // must not shrink a list the reader already scrolled through.
  if (
    existing &&
    !reset &&
    page.offset === 0 &&
    existing.topics.length >= page.topics.length
  ) {
    return existing;
  }

  const topics =
    reset || !existing || page.offset === 0
      ? page.topics
      : (() => {
          const seen = new Set(existing.topics.map((topic) => topic.id));
          return [
            ...existing.topics,
            ...page.topics.filter((topic) => !seen.has(topic.id)),
          ];
        })();

  const base = reset ? undefined : existing;
  const snapshot: SectionTopicSnapshot = {
    topics,
    total: page.total || base?.total || topics.length,
    hasMore: page.hasMore,
    nextOffset: page.hasMore
      ? Math.max(base?.nextOffset ?? 0, page.nextOffset ?? 0)
      : null,
  };
  sectionTopicSnapshots.set(sectionId, snapshot);
  return snapshot;
}

export function getCachedSectionTopics(
  sectionId: number,
): SectionTopicSnapshot | null {
  return sectionTopicSnapshots.get(sectionId) ?? null;
}

/**
 * Load one page of a collection. The first page is normally already seeded by
 * `prefetchInitialContent`, so opening a collection renders instantly; later
 * pages are requested as the reader scrolls.
 */
export function fetchTopicPage(
  sectionId: number,
  slug: string,
  offset = 0,
  limit = TOPIC_PAGE_SIZE,
  force = false,
): Promise<TopicPage> {
  const key = pageKey(sectionId, offset, limit);
  if (force) {
    topicPageCache.delete(key);
    if (offset === 0) sectionTopicSnapshots.delete(sectionId);
  }
  const cached = topicPageCache.get(key);
  if (cached) return cached;

  const promise = request<TopicPageResponse>(
    `/api/sections/${slug}/topics?offset=${offset}&limit=${limit}`,
  )
    .then((payload) => {
      const page: TopicPage = {
        topics: payload.topics ?? [],
        total: payload.total ?? payload.count ?? 0,
        offset: payload.offset ?? offset,
        limit: payload.limit ?? limit,
        hasMore: Boolean(payload.hasMore),
        nextOffset: payload.nextOffset ?? null,
      };
      mergeSectionSnapshot(sectionId, page, force);
      prefetchTopicDetails(page.topics.slice(0, DETAIL_PREFETCH_LIMIT).map((topic) => topic.id));
      return page;
    })
    .catch((error: unknown) => {
      topicPageCache.delete(key);
      throw error;
    });

  topicPageCache.set(key, promise);
  return promise;
}

const topicCache = new Map<string, Promise<TopicDetail>>();
const topicDetails = new Map<string, TopicDetail>();

export function getCachedTopic(topicId: string): TopicDetail | null {
  return topicDetails.get(topicId) ?? null;
}

export function fetchTopic(topicId: string, force = false): Promise<TopicDetail> {
  if (force) topicCache.delete(topicId);
  const cached = topicCache.get(topicId);
  if (cached) return cached;

  const promise = request<TopicDetail>(`/api/topics/${topicId}`)
    .then((detail) => {
      topicDetails.set(detail.id, detail);
      return detail;
    })
    .catch((error: unknown) => {
      topicCache.delete(topicId);
      throw error;
    });

  topicCache.set(topicId, promise);
  return promise;
}

const detailPrefetches = new Set<string>();

/**
 * Warm the detail cache for topic cards so tapping one does not show a loading
 * state. Best-effort: failures are ignored and retried by `fetchTopic`.
 */
export function prefetchTopicDetails(topicIds: string[]): void {
  const ids = [...new Set(topicIds)]
    .filter((id) => !topicCache.has(id) && !detailPrefetches.has(id))
    .slice(0, 50);
  if (ids.length === 0) return;

  ids.forEach((id) => detailPrefetches.add(id));
  request<{ topics?: TopicDetail[] }>(
    `/api/topics?ids=${encodeURIComponent(ids.join(","))}`,
  )
    .then((payload) => {
      for (const detail of payload.topics ?? []) {
        topicDetails.set(detail.id, detail);
        topicCache.set(detail.id, Promise.resolve(detail));
      }
    })
    .catch(() => {
      // Prefetch is an optimization only; the reader will request it on demand.
    })
    .finally(() => {
      ids.forEach((id) => detailPrefetches.delete(id));
    });
}

/**
 * Fetch sections plus the first page of each collection in one request and
 * seed the caches so later navigation is instant.
 */
export async function prefetchInitialContent(): Promise<void> {
  const payload = await request<BootstrapPayload>("/api/bootstrap");
  const pageSize = payload.pageSize || TOPIC_PAGE_SIZE;

  for (const section of payload.sections ?? []) {
    const page = payload.topicPages?.[section.slug];
    if (!page) continue;
    const limit = page.limit ?? pageSize;
    const normalized: TopicPage = {
      ...page,
      limit,
      total: page.total ?? page.topics.length,
    };
    mergeSectionSnapshot(section.id, normalized, false);
    topicPageCache.set(
      pageKey(section.id, normalized.offset, limit),
      Promise.resolve(normalized),
    );
  }

  for (const [id, detail] of Object.entries(payload.topicDetails ?? {})) {
    topicDetails.set(id, detail);
    topicCache.set(id, Promise.resolve(detail));
  }
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
