import {
  compactFeedPostPayload,
  compactQuotedPostPayload,
  compactPostUser,
  toPublicHeatScore,
} from '../../services/post/feed-payload';
import { attachRecentAuthorPostActivity } from '../../services/post/recent-author-activity';
import { annotateTuiPlusAuthorsForRanking } from '../../services/tui-plus-ranking.service';
import type { FeedRepository } from '../../repositories/feed.repository';
import { measureFeedStep } from './feed-observability';

export type FeedHydratorPinMeta = {
  slotIndex: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

export type FeedHydratablePostRow = {
  id: string;
  userId: string;
  categoryId?: string | null;
  location?: string | null;
  viewCount?: number | null;
  shareCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  quoteCount?: number | null;
  quotedPostId?: string | null;
  quotedPost?: any | null;
  rankingScore?: { recommendationScore?: number | null } | null;
  categoryMeta?: unknown;
  user?: any | null;
  category?: any | null;
  [key: string]: unknown;
};

export type FeedHydratorDeps = {
  repository: FeedRepository;
};

export type FeedHydratePostsParams<TRow extends FeedHydratablePostRow> = {
  posts: TRow[];
  currentUserId?: string | null;
  currentUserRole?: string | null;
  pinMetaMap?: Map<string, FeedHydratorPinMeta>;
  getFallbackCategory?: (categoryId?: string | null) => any | null;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

export class FeedHydratorService {
  constructor(private readonly deps: FeedHydratorDeps) {}

  async hydratePosts<TRow extends FeedHydratablePostRow>(params: FeedHydratePostsParams<TRow>) {
    const posts = Array.isArray(params.posts) ? params.posts : [];
    if (posts.length === 0) return [];

    const pinMetaMap = params.pinMetaMap || new Map<string, FeedHydratorPinMeta>();
    const userIds = uniqueStrings(posts.filter((post) => !post.user).map((post) => post.userId));
    const categoryIds = uniqueStrings(posts.filter((post) => post.categoryId && !post.category).map((post) => post.categoryId || null));
    const postIds = uniqueStrings(posts.map((post) => post.id));

    const embeddedLikedPostIds = params.currentUserId
      ? uniqueStrings(posts.filter((post: any) => Array.isArray(post.likes) && post.likes.length > 0).map((post) => post.id))
      : [];
    const needsLikedPostLookup = Boolean(params.currentUserId) && posts.some((post: any) => !Array.isArray(post.likes));
    const [users, categories, likedPostIds] = await Promise.all([
      this.deps.repository.listUsersByIds(userIds).catch((): any[] => []),
      this.deps.repository.listCategoriesByIds(categoryIds).catch((): any[] => []),
      needsLikedPostLookup
        ? this.deps.repository.listLikedPostIds(params.currentUserId, postIds).catch((): any[] => [])
        : Promise.resolve(embeddedLikedPostIds),
    ]);

    const userById = new Map(users.map((user: any) => [user.id, user] as const));
    const categoryById = new Map(categories.map((category: any) => [category.id, category] as const));
    const likedPostIdSet = new Set(likedPostIds);
    const [tuiPlusAnnotatedPosts, recentActivityAnnotatedPosts] = await Promise.all([
      measureFeedStep({ name: 'feed-hydrate.tui-plus', kind: 'recommended', limit: posts.length }, () => annotateTuiPlusAuthorsForRanking(posts as any[])),
      measureFeedStep({ name: 'feed-hydrate.recent-author-activity', kind: 'recommended', limit: posts.length }, () => attachRecentAuthorPostActivity(posts as any[])),
    ]);
    const recentAuthorUserByPostId = new Map(recentActivityAnnotatedPosts.map((post: any) => [post.id, post.user] as const));
    const postsWithRecentAuthorActivity = tuiPlusAnnotatedPosts.map((post: any) => {
      const recentUser = recentAuthorUserByPostId.get(post.id);
      return recentUser && post.user ? { ...post, user: { ...post.user, ...recentUser } } : post;
    });

    return postsWithRecentAuthorActivity.map((post: any) => {
      const pinMeta = pinMetaMap.get(post.id);
      const user = post.user || userById.get(post.userId) || { id: post.userId, displayName: '用户', photoUrl: '', userType: 'NORMAL' };
      const category = post.categoryId
        ? post.category || categoryById.get(post.categoryId) || params.getFallbackCategory?.(post.categoryId) || null
        : null;
      const isOwner = Boolean(params.currentUserId && post.userId === params.currentUserId);
      const isAdmin = params.currentUserRole === 'ADMIN';
      const canSeePrivateContact = isOwner || isAdmin;

      return compactFeedPostPayload({
        ...post,
        contact: post.showContact === false && !canSeePrivateContact ? '' : post.contact,
        user: compactPostUser(user, true),
        category,
        tags: undefined,
        location: post.location || null,
        viewCount: post.viewCount || 0,
        shareCount: post.shareCount || 0,
        likeCount: post.likeCount || 0,
        commentCount: post.commentCount || 0,
        quoteCount: post.quoteCount || 0,
        quotedPostId: post.quotedPostId || null,
        quotedPost: compactQuotedPostPayload(post.quotedPost, { currentUserId: params.currentUserId }),
        heatScore: toPublicHeatScore(post.rankingScore?.recommendationScore),
        rankingScore: undefined,
        hasLiked: likedPostIdSet.has(post.id),
        likes: undefined,
        countryCode: null,
        countryName: null,
        source: null,
        bumpedAt: undefined,
        categoryMeta: post.categoryMeta ?? null,
        isPinned: Boolean(pinMeta),
        pinSlot: pinMeta ? pinMeta.slotIndex : null,
        pinStartedAt: pinMeta ? pinMeta.startsAt : null,
        pinExpiredAt: pinMeta ? pinMeta.endsAt : null,
      }, { currentUserId: params.currentUserId, currentUserRole: params.currentUserRole });
    });
  }
}

export function createFeedHydratorService(deps: FeedHydratorDeps) {
  return new FeedHydratorService(deps);
}
