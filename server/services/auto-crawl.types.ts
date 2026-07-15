export type AutoCrawlSourceType = 'telegram' | 'rss';
export type AutoCrawlRunStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIAL_FAILED' | 'SKIPPED' | 'FAILED';
export type AutoCrawlCursorKind = 'message_id' | 'timestamp' | 'baseline_pending';
/** RETRYABLE is automatically reprocessed with bounded backoff; FAILED means retry budget exhausted. */
export type AutoCrawlItemStatus = 'RAW' | 'RETRYABLE' | 'REJECTED' | 'PUBLISHED' | 'FAILED' | 'DUPLICATE';

export type AutoCrawlSourceConfig = {
  id: string;
  source: string;
  type: AutoCrawlSourceType;
  sourceName: string;
  categoryId: string;
  /** Derived from Category by categoryId. Never used as a lookup fallback. */
  categoryName: string;
  authorUserId: string;
  showContact: boolean;
  disabled: boolean;
  cursor: string;
  cursorKind: AutoCrawlCursorKind;
  pollIntervalMinutes: number;
  nextRunAt?: string | null;
  lastSyncAt?: string | null;
  lastFetchedCount?: number;
  lastParsedCount?: number;
  lastCandidateCount?: number;
  lastDeliveredCount?: number;
  lastFilteredCount?: number;
  lastDuplicateCount?: number;
  failCount?: number;
  lastError?: string | null;
  lastVisibleMinCursor?: string | null;
  lastVisibleMaxCursor?: string | null;
  sourceHealth?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AutoCrawlRunRecord = {
  id: string;
  status: AutoCrawlRunStatus;
  trigger: 'MANUAL' | 'SCHEDULED' | 'REPROCESS';
  startedAt: string;
  finishedAt: string;
  scanned: number;
  delivered: number;
  filtered: number;
  duplicate: number;
  error: number;
  sourceCount: number;
  skipReason?: string | null;
  errorMessage?: string | null;
  latestTitle?: string | null;
};

export type AutoCrawlConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  maxItemsPerSource: number;
  maxSourcesPerRun: number;
  categoryOptions: Array<{ id: string; name: string; slug: string }>;
  sources: AutoCrawlSourceConfig[];
  recentRuns: AutoCrawlRunRecord[];
};

export type AutoCrawlItem = {
  id: string;
  title: string;
  content: string;
  rawText: string;
  link: string;
  timestamp: number;
  datetime: string;
  cursorValue: string;
  cursorNumber: number;
  images: string[];
};
