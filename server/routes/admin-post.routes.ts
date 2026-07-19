import type { Express } from 'express';

import prisma, { isDbConfigured } from '../db';
import { isHttpError } from '../http/errors';
import type { createStrictPaginationParser, setCursorPaginationHeaders } from '../http/pagination';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';

type StrictPaginationParser = ReturnType<typeof createStrictPaginationParser>;
type SetPaginationHeaders = typeof setCursorPaginationHeaders;

type QuoteCountPostState = {
  quotedPostId?: string | null;
  isPublished?: boolean | null;
  deletedAt?: Date | string | null;
};

type RegisterAdminPostRoutesOptions = {
  throwOnInvalidPagination: StrictPaginationParser;
  setPaginationHeaders: SetPaginationHeaders;
  normalizeAdminUserTypeFilter: (value: unknown) => string;
  markContentDataChanged: () => void;
  shouldCountQuotePost: (post?: QuoteCountPostState | null) => boolean;
  adjustPostQuoteCount: (tx: any, quotedPostId: string | null | undefined, delta: number) => Promise<void>;
};

export function registerAdminPostRoutes(app: Express, options: RegisterAdminPostRoutesOptions) {
  const {
    throwOnInvalidPagination,
    setPaginationHeaders,
    normalizeAdminUserTypeFilter,
    markContentDataChanged,
    shouldCountQuotePost,
    adjustPostQuoteCount,
  } = options;

  app.get('/api/admin/posts', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    try {
      if (isDbConfigured()) {
        const { categoryId, search, published, userType } = req.query;
        const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 80 });
        const safeSearch = typeof search === 'string' ? search.trim().slice(0, 80) : '';
        const normalizedPublished = typeof published === 'string' ? published.trim().toLowerCase() : '';
        const normalizedUserType = normalizeAdminUserTypeFilter(userType);
        let publishedFilter: boolean | undefined = undefined;
        if (normalizedPublished) {
          if (normalizedPublished === '1' || normalizedPublished === 'true') {
            publishedFilter = true;
          } else if (normalizedPublished === '0' || normalizedPublished === 'false') {
            publishedFilter = false;
          } else {
            return res.status(400).json({ error: 'published 参数不合法' });
          }
        }
        if (typeof userType === 'string' && userType.trim() && !normalizedUserType) {
          return res.status(400).json({ error: 'userType 参数不合法' });
        }

        const posts = await prisma.post.findMany({
          where: {
            ...(typeof categoryId === 'string' && categoryId ? { categoryId: categoryId.trim() } : {}),
            ...(publishedFilter !== undefined ? { isPublished: publishedFilter } : {}),
            ...(normalizedUserType ? { user: { userType: normalizedUserType as any } } : {}),
            ...(safeSearch ? {
              OR: [
                { title: { contains: safeSearch, mode: 'insensitive' } },
                { content: { contains: safeSearch, mode: 'insensitive' } }
              ]
            } : {})
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: {
            user: { select: { id: true, displayName: true, userType: true } },
            category: { select: { id: true, name: true, slug: true } },
          }
        });
        const hasMore = posts.length > limit;
        const items = hasMore ? posts.slice(0, limit) : posts;
        setPaginationHeaders(res, {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
        });
        return res.json(items);
      }
      return res.json([]);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  }));

  app.patch('/api/admin/posts/:id/publish', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!postId) return res.status(400).json({ error: '内容ID不能为空' });
    if (typeof req.body?.isPublished !== 'boolean') {
      return res.status(400).json({ error: 'isPublished 必须是布尔值' });
    }

    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        isPublished: true,
        deletedAt: true,
        quotedPostId: true,
      },
    });

    if (!existingPost || existingPost.deletedAt) {
      return res.status(404).json({ error: '内容不存在' });
    }

    const post = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id: existingPost.id },
        data: { isPublished: req.body.isPublished },
        select: {
          id: true,
          isPublished: true,
          updatedAt: true,
        },
      });

      if (existingPost.quotedPostId && existingPost.deletedAt === null && existingPost.isPublished !== req.body.isPublished) {
        await adjustPostQuoteCount(tx, existingPost.quotedPostId, req.body.isPublished ? 1 : -1);
      }

      return updated;
    });

    markContentDataChanged();
    res.json({ success: true, post });
  }));

  app.delete('/api/admin/posts/:id/permanent', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!postId) return res.status(400).json({ error: '内容ID不能为空' });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, quotedPostId: true, isPublished: true, deletedAt: true },
    });
    if (!post) {
      return res.status(404).json({ error: '内容不存在' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.post.delete({ where: { id: post.id } });
      if (shouldCountQuotePost(post)) {
        await adjustPostQuoteCount(tx, post.quotedPostId, -1);
      }
    });
    markContentDataChanged();
    res.json({ success: true });
  }));

  app.patch('/api/admin/posts/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const postId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!postId) return res.status(400).json({ error: '内容ID不能为空' });
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'categoryId')) {
      return res.status(400).json({ error: '请提交要更新的分类信息' });
    }

    const targetCategoryId = String(req.body?.categoryId || '').trim();
    if (!targetCategoryId) return res.status(400).json({ error: 'categoryId 不能为空' });

    const category = await prisma.category.findUnique({
      where: { id: targetCategoryId },
      select: { id: true },
    });
    if (!category) return res.status(400).json({ error: '分类不存在' });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    });
    if (!post || post.deletedAt) return res.status(404).json({ error: '内容不存在' });

    const updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: { categoryId: targetCategoryId },
      select: { id: true, categoryId: true, updatedAt: true },
    });

    markContentDataChanged();
    return res.json({ success: true, post: updatedPost });
  }));
}
