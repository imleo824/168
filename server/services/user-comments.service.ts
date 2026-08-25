import prisma from '../db';

const HIDDEN_AUTO_POST_CURATED_SOURCE = 'auto_post_curated_content';

export async function listCommentsForUser(input: {
  userId: string;
  blockedUserIds?: string[];
  limit: number;
  cursor?: string;
}) {
  const comments = await prisma.postComment.findMany({
    where: {
      userId: input.userId,
      deletedAt: null,
      status: 'VISIBLE',
      post: {
        deletedAt: null,
        isPublished: true,
        ...(input.blockedUserIds?.length ? { userId: { notIn: input.blockedUserIds } } : {}),
        NOT: {
          source: HIDDEN_AUTO_POST_CURATED_SOURCE,
          user: { is: { userType: 'ROBOT' as const } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      postId: true,
      userId: true,
      content: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      post: {
        select: {
          id: true,
          title: true,
          content: true,
          images: true,
          createdAt: true,
          userId: true,
          user: { select: { id: true, displayName: true, photoUrl: true, userType: true } },
        },
      },
    },
  });
  const hasMore = comments.length > input.limit;
  const items = hasMore ? comments.slice(0, input.limit) : comments;
  return { items, hasMore, nextCursor: hasMore ? items[items.length - 1]?.id || null : null };
}
