import type { FeedPageResult, FeedRequestContext } from './feed-contracts';
import { measureFeedStep } from './feed-observability';
import type { FeedRepository, FeedQueryInput, FeedQueryPage } from '../../repositories/feed.repository';

export type FeedQueryServiceDeps = {
  repository: FeedRepository;
  getBlockedUserIds?: (userId?: string | null) => Promise<string[]>;
  getMutedCategoryIds?: (userId?: string | null) => Promise<string[]>;
};

export type HomeFeedQueryKind = 'following' | 'recommended' | 'category';

export type HomeFeedQueryContext = {
  kind: HomeFeedQueryKind;
  currentUserId?: string | null;
  limit: number;
  cursor?: string | null;
  categoryIds?: string[];
  categoryMetaFilters?: unknown[];
  requestId?: string;
};

export type HomeFeedQueryHandlers<TResult> = {
  following: (context: HomeFeedQueryContext) => Promise<TResult>;
  category: (context: HomeFeedQueryContext) => Promise<TResult>;
  recommended: (context: HomeFeedQueryContext) => Promise<TResult>;
};

function toRepositoryInput(
  context: FeedRequestContext,
  blockedUserIds: string[],
  mutedCategoryIds: string[],
): FeedQueryInput {
  return {
    kind: context.kind,
    pagination: context.pagination,
    viewer: context.viewer,
    category: context.category,
    blockedUserIds,
    mutedCategoryIds,
  };
}

function toFeedPageResult<TItem>(page: FeedQueryPage<TItem>): FeedPageResult<TItem> {
  return {
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export class FeedQueryService {
  constructor(private readonly deps: FeedQueryServiceDeps) {}

  async dispatchHomeFeed<TResult>(
    context: HomeFeedQueryContext,
    handlers: HomeFeedQueryHandlers<TResult>,
  ): Promise<TResult> {
    return measureFeedStep({
      name: `feed-query.dispatch.${context.kind}`,
      requestId: context.requestId,
      kind: context.kind,
      limit: context.limit,
    }, async () => {
      if (context.kind === 'following') return handlers.following(context);
      if (context.kind === 'category') return handlers.category(context);
      return handlers.recommended(context);
    });
  }

  async listRecommendedFeed<TItem = unknown>(context: FeedRequestContext): Promise<FeedPageResult<TItem>> {
    const [blockedUserIds, mutedCategoryIds] = await Promise.all([
      this.deps.getBlockedUserIds?.(context.viewer.userId) ?? Promise.resolve([]),
      this.deps.getMutedCategoryIds?.(context.viewer.userId) ?? Promise.resolve([]),
    ]);

    const page = await measureFeedStep({
      name: 'feed-query.recommended',
      requestId: context.requestId,
      kind: 'recommended',
      limit: context.pagination.limit,
    }, () => this.deps.repository.listRecommendedPosts(
      toRepositoryInput(context, blockedUserIds, mutedCategoryIds),
    ) as Promise<FeedQueryPage<TItem>>);

    return toFeedPageResult(page);
  }

  async listCategoryFeed<TItem = unknown>(context: FeedRequestContext): Promise<FeedPageResult<TItem>> {
    const [blockedUserIds, mutedCategoryIds] = await Promise.all([
      this.deps.getBlockedUserIds?.(context.viewer.userId) ?? Promise.resolve([]),
      this.deps.getMutedCategoryIds?.(context.viewer.userId) ?? Promise.resolve([]),
    ]);

    const page = await measureFeedStep({
      name: 'feed-query.category',
      requestId: context.requestId,
      kind: 'category',
      limit: context.pagination.limit,
    }, () => this.deps.repository.listCategoryPosts(
      toRepositoryInput(context, blockedUserIds, mutedCategoryIds),
    ) as Promise<FeedQueryPage<TItem>>);

    return toFeedPageResult(page);
  }
}

export function createFeedQueryService(deps: FeedQueryServiceDeps) {
  return new FeedQueryService(deps);
}
