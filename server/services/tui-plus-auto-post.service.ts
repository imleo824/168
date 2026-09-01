import prisma, { isDbConfigured } from '../db';
import { PostService } from '../post.service';
import { bumpPublicFeedCacheVersion, clearPublicFeedResultCache } from '../public-feed-cache';

export const TUI_PLUS_AUTO_POST_SOURCE_PREFIX = 'TUI_PLUS_AUTO_POST';

const TUI_PLUS_AUTO_POST_IMAGE = '/api/tui-plus/post-cover.svg';

function normalizeActivationPlan(plan: unknown) {
  const value = String(plan || '').trim().toUpperCase();
  if (value === 'TRIAL') return 'TRIAL';
  if (value === 'MONTHLY') return 'MONTHLY';
  if (value === 'YEARLY') return 'YEARLY';
  return 'MEMBER';
}

function normalizePlanLabel(plan: unknown) {
  const value = normalizeActivationPlan(plan);
  if (value === 'TRIAL') return '免费试用';
  if (value === 'MONTHLY') return '月付会员';
  if (value === 'YEARLY') return '年付会员';
  return '会员';
}

function buildActivationPostContent(plan: unknown) {
  const planLabel = normalizePlanLabel(plan);
  return `我已开启 Tui Plus ${planLabel}。想让自己的信息获得更多曝光？点击了解 Tui Plus。`;
}

function markActivationPostVisible() {
  bumpPublicFeedCacheVersion('tui_plus_activation_post');
  clearPublicFeedResultCache();
}

export async function createTuiPlusActivationPost(userId: string, plan: unknown) {
  if (!userId || !isDbConfigured()) return null;

  const now = new Date();
  const normalizedPlan = normalizeActivationPlan(plan);
  const source = `${TUI_PLUS_AUTO_POST_SOURCE_PREFIX}:${normalizedPlan}`;
  const existing = await prisma.post.findFirst({
    where: {
      userId,
      source: { startsWith: TUI_PLUS_AUTO_POST_SOURCE_PREFIX },
      deletedAt: null,
    } as any,
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return null;

  const post = await prisma.post.create({
    data: {
      title: '我已开启 Tui Plus，曝光提升中',
      content: buildActivationPostContent(normalizedPlan),
      source,
      contact: '',
      showContact: false,
      syncToTelegram: false,
      images: [TUI_PLUS_AUTO_POST_IMAGE],
      isPublished: true,
      isAnonymous: false,
      createdAt: now,
      bumpedAt: now,
      user: { connect: { id: userId } },
    },
    include: {
      user: { select: { id: true, displayName: true, photoUrl: true, userType: true } },
      category: true,
    },
  });

  PostService.schedulePostRankingRefresh(post.id);
  markActivationPostVisible();
  return post;
}

export function isTuiPlusActivationPostSource(source: unknown) {
  return String(source || '').startsWith(TUI_PLUS_AUTO_POST_SOURCE_PREFIX);
}
