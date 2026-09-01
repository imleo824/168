import prisma from '../db';
import { PostService } from '../post.service';

export async function listMutedFeedCategoryIds(userId: string) {
  return PostService.getMutedFeedCategoryIds(userId);
}

export async function replaceMutedFeedCategoryIds(userId: string, categoryIds: string[]) {
  const categories = categoryIds.length > 0
    ? await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true },
      })
    : [];
  const validCategoryIds = categories.map((category) => category.id);

  await prisma.$transaction([
    (prisma as any).userMutedCategory.deleteMany({
      where: { userId },
    }),
    ...validCategoryIds.map((categoryId) =>
      (prisma as any).userMutedCategory.create({
        data: {
          userId,
          categoryId,
        },
      }),
    ),
  ]);

  return validCategoryIds;
}
