import type { PrismaClient } from '@prisma/client';

export const SUPERPOWER_CATEGORY_SEED_SOURCE: string;
export const SUPERPOWER_CATEGORY_SEED_COMPLETION_KEY: string;
export function seedSuperpowerCategoryPosts(
  client: PrismaClient,
  options?: Record<string, unknown>,
): Promise<unknown>;
