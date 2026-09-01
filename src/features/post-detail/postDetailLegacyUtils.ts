import { buildDisplayLocationTags } from '@/utils/postPresentation';
import type { FeedPost } from '@/features/post/PostCard';

export type DetailRouteState = {
  from?: string;
  returnTo?: string;
  backgroundLocation?: {
    pathname?: string;
    search?: string;
    hash?: string;
    state?: Record<string, unknown>;
  };
};

export type ReturnTarget = {
  pathname: string;
  search?: string;
  hash?: string;
  state?: Record<string, unknown>;
};

const SOURCE_TEXT_KEYS = ['source', 'sourceText', 'sourceUrl', 'originSource', 'webhookSource'] as const;
const HIDDEN_SOURCE_TEXTS = new Set(['quote_publish_robot', 'auto_post_curated_content']);
export const RECORDED_VIEW_TTL_MS = 8 * 60 * 1000;
const RECORDED_VIEW_MAX_IDS = 6000;
const recordedViewPostIds = new Map<string, number>();

export function pruneRecordedViews(now = Date.now()) {
  for (const [postId, ts] of recordedViewPostIds) {
    if (now - ts >= RECORDED_VIEW_TTL_MS) {
      recordedViewPostIds.delete(postId);
    }
  }

  while (recordedViewPostIds.size > RECORDED_VIEW_MAX_IDS) {
    const firstKey = recordedViewPostIds.keys().next().value;
    if (!firstKey) break;
    recordedViewPostIds.delete(firstKey);
  }
}

export function getRecordedViewTimestamp(postId: string) {
  return recordedViewPostIds.get(postId);
}

export function setRecordedViewTimestamp(postId: string, timestamp: number) {
  recordedViewPostIds.set(postId, timestamp);
}

export function deleteRecordedViewTimestamp(postId: string) {
  recordedViewPostIds.delete(postId);
}

export function getHistoryIndex() {
  if (typeof window === 'undefined') return -1;
  return typeof window.history.state?.idx === 'number' ? window.history.state.idx : -1;
}

export function resolveDetailSourceText(post: unknown) {
  if (!post || typeof post !== 'object') return '';
  const record = post as Record<string, unknown>;
  for (const key of SOURCE_TEXT_KEYS) {
    const value = record[key];
    if (typeof value === 'string') {
      const text = value.trim();
      if (HIDDEN_SOURCE_TEXTS.has(text)) continue;
      if (text) return text;
    }
  }
  return '';
}

export function parseReturnPath(value: unknown): ReturnTarget | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;

  const fallbackParse = () => {
    const [pathAndSearch, hashPart = ''] = raw.split('#');
    const questionIndex = pathAndSearch.indexOf('?');
    const pathname = questionIndex >= 0 ? pathAndSearch.slice(0, questionIndex) : pathAndSearch;
    const search = questionIndex >= 0 ? pathAndSearch.slice(questionIndex) : '';

    if (!pathname || (!pathname.startsWith('/') && !pathname.startsWith('.'))) return null;
    return {
      pathname: pathname.startsWith('.') ? '/' : pathname,
      search,
      hash: hashPart ? `#${hashPart}` : '',
    };
  };

  try {
    if (typeof window === 'undefined') return fallbackParse();
    const url = new URL(raw, window.location.origin);
    if (/^https?:\/\//i.test(raw) && url.origin !== window.location.origin) return null;
    return {
      pathname: url.pathname || '/',
      search: url.search || '',
      hash: url.hash || '',
    };
  } catch {
    return fallbackParse();
  }
}

export function getRouteState(locationState: unknown): DetailRouteState | undefined {
  if (!locationState || typeof locationState !== 'object') return undefined;
  return locationState as DetailRouteState;
}

export function normalizeAuthorId(post: any) {
  return String(post?.user?.id || post?.userId || '').trim();
}

export function isAnonymousAuthor(post: any) {
  const uid = normalizeAuthorId(post).toLowerCase();
  return !uid || uid === 'anonymous';
}

export function getDetailQuoteAuthorName(post: FeedPost) {
  if (post.isAnonymous || isAnonymousAuthor(post)) return '匿名用户';
  const name = String(post.user?.displayName || post.user?.username || post.user?.name || '').trim();
  return name || '用户';
}

export function isAbortLike(error: unknown) {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError');
}

export function buildAbsoluteUrl(pathOrUrl: string | undefined, origin: string) {
  if (!pathOrUrl) return undefined;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!origin) return undefined;
  return `${origin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function joinKeywords(values: Array<unknown>) {
  const seen = new Set<string>();
  const out: string[] = [];

  values.forEach((value) => {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  });

  return out.slice(0, 24).join(',');
}

export function normalizeLikerId(value: unknown) {
  return String(value || '').trim();
}

export function buildSortedDetailLocationTags(location: unknown) {
  return typeof location === 'string' ? buildDisplayLocationTags(location) : buildDisplayLocationTags(null);
}
