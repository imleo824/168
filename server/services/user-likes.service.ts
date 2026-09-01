import prisma from '../db';
import { PostService } from '../post.service';

export type UserLikedPostsPage = {
  items: any[];
  hasMore: boolean;
  nextCursor: string | null;
};

export async function listLikedPostsForUser(options: {
  currentUserId: string;
  currentUserRole?: string | null;
  limit: number;
  cursor?: string;
  blockedUserIds?: string[];
}): Promise<UserLikedPostsPage> {
  const {
    currentUserId,
    currentUserRole,
    limit,
    cursor,
    blockedUserIds = [],
  } = options;

  let cursorFilter = {};
  if (cursor) {
    const cursorLike = await prisma.like.findUnique({
      where: { userId_postId: { userId: currentUserId, postId: cursor } },
      select: { createdAt: true },
    });
    if (!cursorLike?.createdAt) {
      throw Object.assign(new Error('cursor 无效或已过期'), { statusCode: 400 });
    }
    cursorFilter = {
      OR: [
        { createdAt: { lt: cursorLike.createdAt } },
        { createdAt: cursorLike.createdAt, postId: { lt: cursor } },
      ],
    };
  }

  const likes = await prisma.like.findMany({
    where: {
      userId: currentUserId,
      post: {
        deletedAt: null,
        isPublished: true,
        ...(blockedUserIds.length > 0 ? { userId: { notIn: blockedUserIds } } : {}),
      },
      ...(cursorFilter as Record<string, unknown>),
    },
    include: {
      post: {
        select: PostService.listPostSelect(currentUserId),
      },
    },
    orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
    take: limit + 1,
  });

  const hasMore = likes.length > limit;
  const pageItems = hasMore ? likes.slice(0, limit) : likes;
  const safeItems = pageItems.filter((item): item is (typeof pageItems)[number] & { post: NonNullable<(typeof pageItems)[number]['post']> } => Boolean(item.post));

  return {
    hasMore,
    nextCursor: hasMore ? pageItems[pageItems.length - 1]?.postId || null : null,
    items: safeItems.map((like) => ({
      ...PostService.maskContact(
        PostService.toClientPost(like.post as any, currentUserId),
        currentUserId,
        currentUserRole,
      ),
      hasLiked: true,
    })),
  };
}
