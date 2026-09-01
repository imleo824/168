import { Prisma } from '@prisma/client';
import prisma, { isDbConfigured } from '../db';
import { postFeedListSelect } from './post/post-selects';

const TAG_SEARCH_MAX_LENGTH = 80;
const TAG_SEARCH_PATTERN = /^[\p{L}\p{N}_\-·.]{1,80}$/u;
const TAG_FEED_DEFAULT_LIMIT = 20;
const TAG_FEED_MAX_LIMIT = 50;

function normalizeTagSearchValue(value: unknown) {
  const text = String(value ?? '')
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TAG_SEARCH_MAX_LENGTH);
  return TAG_SEARCH_PATTERN.test(text) ? text : '';
}

function normalizeTagFeedLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return TAG_FEED_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), TAG_FEED_MAX_LIMIT);
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function readCursorCreatedAt(cursor?: string | null) {
  const id = String(cursor || '').trim();
  if (!id) return null;
  const post = await prisma.post.findUnique({ where: { id }, select: { createdAt: true } });
  return post?.createdAt || null;
}

export async function listTagFeedPosts(params: {
  tag: unknown;
  currentUserId?: string | null;
  limit?: number;
  cursor?: string | null;
}) {
  if (!isDbConfigured()) return { items: [], nextCursor: null, hasMore: false };
  const tag = normalizeTagSearchValue(params.tag);
  if (!tag) return { items: [], nextCursor: null, hasMore: false };

  const limit = normalizeTagFeedLimit(params.limit);
  const cursorCreatedAt = await readCursorCreatedAt(params.cursor);
  const escapedTag = escapeLikePattern(tag);
  const hashtagPattern = `%#${escapedTag}%`;
  const jsonPattern = `%${escapedTag}%`;
  const take = limit + 1;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p."id"
    FROM "Post" p
    WHERE p."deletedAt" IS NULL
      AND p."isPublished" = true
      ${cursorCreatedAt ? Prisma.sql`AND p."createdAt" < ${cursorCreatedAt}` : Prisma.empty}
      AND (
        p."content" ILIKE ${hashtagPattern} ESCAPE '\\'
        OR p."title" ILIKE ${hashtagPattern} ESCAPE '\\'
        OR COALESCE(p."categoryMeta"::text, '') ILIKE ${jsonPattern} ESCAPE '\\'
      )
    ORDER BY p."createdAt" DESC, p."id" DESC
    LIMIT ${take}
  `);

  const pageRows = rows.slice(0, limit);
  const ids = pageRows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return { items: [], nextCursor: null, hasMore: false };

  const posts = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: postFeedListSelect(params.currentUserId),
  });
  const postById = new Map(posts.map((post: any) => [post.id, post]));
  const items = ids.map((id) => postById.get(id)).filter(Boolean);

  return {
    items,
    nextCursor: rows.length > limit ? ids[ids.length - 1] || null : null,
    hasMore: rows.length > limit,
  };
}
