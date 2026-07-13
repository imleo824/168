import { getAutoCrawlConfig } from '../auto-crawl.service';
import { runObservedAutoCrawl } from '../auto-crawl-observed-runner.service';
import { DEFAULT_AUTO_POST_CONFIG, getAutoPostConfig } from '../auto-post.config';
import { runObservedAutoPost } from '../auto-post-observed-runner.service';
import type { AutoPostAfterPostCreated } from '../auto-post.service';
import { getAutoLikeConfig } from '../auto-like.service';
import { getCommentPublishConfig } from '../comment-publish.service';
import { getQuotePublishConfig, type QuotePublishAfterPostCreated } from '../quote-publish.service';
import {
  runObservedAutoLike,
  runObservedCommentPublish,
  runObservedQuotePublish,
} from '../interaction-observed-runner.service';
import type { AutomationRuntimeModule } from './automation-module';

const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 24 * 60 * 60_000;
const DEFAULT_AUTO_CRAWL_INTERVAL_MINUTES = 30;
const DEFAULT_AUTO_POST_INTERVAL_MINUTES = DEFAULT_AUTO_POST_CONFIG.checkIntervalMinutes || 120;
const DEFAULT_AUTO_LIKE_INTERVAL_MINUTES = 120;
const DEFAULT_COMMENT_INTERVAL_MINUTES = 120;
const DEFAULT_QUOTE_INTERVAL_MINUTES = 120;

const STARTUP_DELAY_MS = {
  autoCrawl: 5_000,
  autoPost: 15_000,
  autoLike: 30_000,
  quotePublish: 45_000,
  commentPublish: 60_000,
} as const;

const MODULE_TIMEOUT_MS = {
  autoCrawl: 25 * 60_000,
  autoPost: 12 * 60_000,
  autoLike: 8 * 60_000,
  quotePublish: 12 * 60_000,
  commentPublish: 12 * 60_000,
} as const;

function intervalMsFromMinutes(raw: unknown, fallbackMinutes: number) {
  const minutes = Number(raw);
  const fallbackMs = fallbackMinutes * 60_000;
  if (!Number.isFinite(minutes)) return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, fallbackMs));
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(minutes) * 60_000));
}

export function createDefaultAutomationModules(options: {
  afterAutoPostCreated?: AutoPostAfterPostCreated;
  afterQuotePostCreated?: QuotePublishAfterPostCreated;
} = {}): AutomationRuntimeModule[] {
  return [
    {
      module: 'auto_crawl',
      fallbackIntervalMs: intervalMsFromMinutes(DEFAULT_AUTO_CRAWL_INTERVAL_MINUTES, DEFAULT_AUTO_CRAWL_INTERVAL_MINUTES),
      startupDelayMs: STARTUP_DELAY_MS.autoCrawl,
      timeoutMs: MODULE_TIMEOUT_MS.autoCrawl,
      maxBackoffMultiplier: 4,
      nextIntervalMs: async () => {
        const config = await getAutoCrawlConfig();
        return intervalMsFromMinutes(config.enabled ? config.checkIntervalMinutes : 60, DEFAULT_AUTO_CRAWL_INTERVAL_MINUTES);
      },
      run: ({ reason }) => runObservedAutoCrawl({ trigger: 'SCHEDULED', force: false, reason }),
    },
    {
      module: 'auto_post',
      fallbackIntervalMs: intervalMsFromMinutes(DEFAULT_AUTO_POST_INTERVAL_MINUTES, DEFAULT_AUTO_POST_INTERVAL_MINUTES),
      startupDelayMs: STARTUP_DELAY_MS.autoPost,
      timeoutMs: MODULE_TIMEOUT_MS.autoPost,
      maxBackoffMultiplier: 6,
      nextIntervalMs: async () => intervalMsFromMinutes((await getAutoPostConfig()).checkIntervalMinutes, DEFAULT_AUTO_POST_INTERVAL_MINUTES),
      run: ({ reason }) => runObservedAutoPost({
        trigger: 'SCHEDULED',
        reason,
        afterPostCreated: options.afterAutoPostCreated,
      }),
    },
    {
      module: 'auto_like',
      fallbackIntervalMs: intervalMsFromMinutes(DEFAULT_AUTO_LIKE_INTERVAL_MINUTES, DEFAULT_AUTO_LIKE_INTERVAL_MINUTES),
      startupDelayMs: STARTUP_DELAY_MS.autoLike,
      timeoutMs: MODULE_TIMEOUT_MS.autoLike,
      maxBackoffMultiplier: 6,
      nextIntervalMs: async () => intervalMsFromMinutes((await getAutoLikeConfig()).intervalMinutes, DEFAULT_AUTO_LIKE_INTERVAL_MINUTES),
      run: ({ reason }) => runObservedAutoLike({ trigger: 'SCHEDULED', reason }),
    },
    {
      module: 'quote_publish',
      fallbackIntervalMs: intervalMsFromMinutes(DEFAULT_QUOTE_INTERVAL_MINUTES, DEFAULT_QUOTE_INTERVAL_MINUTES),
      startupDelayMs: STARTUP_DELAY_MS.quotePublish,
      timeoutMs: MODULE_TIMEOUT_MS.quotePublish,
      maxBackoffMultiplier: 6,
      nextIntervalMs: async () => intervalMsFromMinutes((await getQuotePublishConfig({ force: true })).checkIntervalMinutes, DEFAULT_QUOTE_INTERVAL_MINUTES),
      run: ({ reason }) => runObservedQuotePublish({
        trigger: 'SCHEDULED',
        reason,
        afterPostCreated: options.afterQuotePostCreated,
      }),
    },
    {
      module: 'comment_publish',
      fallbackIntervalMs: intervalMsFromMinutes(DEFAULT_COMMENT_INTERVAL_MINUTES, DEFAULT_COMMENT_INTERVAL_MINUTES),
      startupDelayMs: STARTUP_DELAY_MS.commentPublish,
      timeoutMs: MODULE_TIMEOUT_MS.commentPublish,
      maxBackoffMultiplier: 6,
      nextIntervalMs: async () => intervalMsFromMinutes((await getCommentPublishConfig()).intervalMinutes, DEFAULT_COMMENT_INTERVAL_MINUTES),
      run: ({ reason }) => runObservedCommentPublish({ trigger: 'SCHEDULED', reason }),
    },
  ];
}
