import type { Express, Request, Response } from 'express';

import prisma, { isDbConfigured } from '../db';
import { sendDatabaseUnavailable } from '../http/errors';
import { getPublicOrigin } from '../http-origin';
import { setPublicCache } from '../http-cache';
import { catchAsync } from '../middlewares/error';
import { SITE_NAME, SITE_SHARE_DESCRIPTION, SITE_SLOGAN } from '../site-meta';
import { PostService } from '../post.service';
import { UserService } from '../user.service';
import { getCachedCategories } from './config.routes';

const SEO_FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;
const SEO_FALLBACK_CACHE_MAX_ENTRIES = 300;
const seoFallbackCache = new Map<string, { expiresAt: number; html: string }>();

type SocialPreviewImage = {
  buffer: Buffer;
  contentType: string;
};

type SeoFallbackListItem = {
  title: string;
  description?: string | null;
  url?: string | null;
};

type RegisterSeoFallbackRoutesOptions = {
  buildPostSharePreviewCandidates: (sourceImage: string | undefined, context?: Request | string) => string[];
  fetchSocialPreviewImage: (url: string) => Promise<SocialPreviewImage>;
  sendShareFallbackImage: (res: Response) => void;
};

function escapeHtml(value: string) {
  return `${value || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collapseText(text: string | null | undefined, maxLength: number) {
  const collapsed = (text || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}...` : collapsed;
}

function resolveSocialMetaImage(params: {
  coverImage: string;
  fallbackImage: string;
  generatedPreviewImage: string;
  shareFallbackImage: string;
}) {
  const candidates = [
    params.coverImage,
    params.fallbackImage,
    params.shareFallbackImage,
    params.generatedPreviewImage,
  ];

  const socialImage = candidates.find((item) => item) || '';
  const fallbackImage = candidates.find((item) => item) || '';

  return { socialImage, fallbackImage };
}

function isLikelySocialCrawler(req: Request) {
  const userAgent = `${req.get('user-agent') || ''}`.toLowerCase();
  const forcedByQuery =
    req.query.source === 'share' ||
    req.query.ref === 'share' ||
    req.query.utm_source === 'telegram';

  const crawlerPattern = /(bot|crawler|spider|facebookexternalhit|facebot|telegrambot|twitterbot|whatsapp|fbexternal|discordbot|slackbot|linkedinbot|pinterest|googlebot|bingbot|baiduspider|yandex|duckduckbot|redditbot|instagram|lighthouse|prerender)/i;
  return forcedByQuery || crawlerPattern.test(userAgent);
}

function normalizeSeoQueryParam(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

function decodeSeoPathSegment(value: string | undefined) {
  const raw = `${value || ''}`.trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

function collapseSeoText(value: unknown, maxLength: number) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function getSeoFallbackCacheKey(req: Request) {
  const params = new URLSearchParams();
  const view = normalizeSeoQueryParam(req.query.view);
  if (view === 'tag' || view === 'location') params.set('view', view);
  const country = normalizeSeoQueryParam(req.query.country);
  if (country) params.set('country', country);
  const page = normalizeSeoQueryParam(req.query.page);
  if (/^\d+$/.test(page)) params.set('page', page);
  const query = normalizeSeoQueryParam(req.query.q);
  if (query) params.set('q', query);
  const queryString = params.toString();
  return `${req.path}${queryString ? `?${queryString}` : ''}`;
}

function setSeoFallbackCache(key: string, html: string) {
  if (seoFallbackCache.size >= SEO_FALLBACK_CACHE_MAX_ENTRIES) {
    const firstKey = seoFallbackCache.keys().next().value;
    if (firstKey) seoFallbackCache.delete(firstKey);
  }
  seoFallbackCache.set(key, { html, expiresAt: Date.now() + SEO_FALLBACK_CACHE_TTL_MS });
}

function getSeoFallbackCache(key: string) {
  const cached = seoFallbackCache.get(key);
  if (!cached) return '';
  if (cached.expiresAt <= Date.now()) {
    seoFallbackCache.delete(key);
    return '';
  }
  return cached.html;
}

function getSeoCanonicalUrl(req: Request, canonicalPath = req.path) {
  const origin = getPublicOrigin(req);
  const params = new URLSearchParams();
  const view = normalizeSeoQueryParam(req.query.view);
  if (canonicalPath.startsWith('/category/') && (view === 'tag' || view === 'location')) {
    params.set('view', view);
  }
  const country = normalizeSeoQueryParam(req.query.country);
  if (canonicalPath.startsWith('/category/') && country) params.set('country', country);
  const page = normalizeSeoQueryParam(req.query.page);
  if (canonicalPath.startsWith('/category/') && /^\d+$/.test(page)) params.set('page', page);
  const query = normalizeSeoQueryParam(req.query.q);
  if (canonicalPath.startsWith('/category/') && query) params.set('q', query);
  const queryString = params.toString();
  return `${origin}${canonicalPath}${queryString ? `?${queryString}` : ''}`;
}

function toSeoAbsoluteUrl(req: Request, value?: string | null) {
  const raw = `${value || ''}`.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = getPublicOrigin(req);
  return `${origin}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function buildSeoFallbackHtml(params: {
  req: Request;
  title: string;
  description: string;
  canonicalUrl?: string;
  image?: string;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  heading?: string;
  body?: string;
  items?: SeoFallbackListItem[];
}) {
  const origin = getPublicOrigin(params.req);
  const title = collapseSeoText(params.title, 64) || SITE_NAME;
  const pageTitle = title.includes(SITE_NAME) ? title : `${title}｜${SITE_NAME}`;
  const description = collapseSeoText(params.description, 180) || SITE_SHARE_DESCRIPTION;
  const canonicalUrl = params.canonicalUrl || getSeoCanonicalUrl(params.req);
  const image = toSeoAbsoluteUrl(params.req, params.image) || `${origin}/share-fallback.png`;
  const robots = params.noindex ? 'noindex,nofollow,noarchive' : 'index,follow,max-image-preview:large';
  const jsonLdItems = params.jsonLd ? (Array.isArray(params.jsonLd) ? params.jsonLd : [params.jsonLd]) : [];
  const escapedTitle = escapeHtml(pageTitle);
  const escapedDescription = escapeHtml(description);
  const escapedCanonical = escapeHtml(canonicalUrl);
  const escapedImage = escapeHtml(image);
  const escapedHeading = escapeHtml(params.heading || title);
  const escapedBody = escapeHtml(collapseSeoText(params.body || description, 320));
  const listItems = (params.items || []).slice(0, 12).map((item) => {
    const itemTitle = escapeHtml(collapseSeoText(item.title, 96));
    const itemDescription = escapeHtml(collapseSeoText(item.description || '', 160));
    const itemUrl = item.url ? escapeHtml(item.url) : '';
    return `<li>${itemUrl ? `<a href="${itemUrl}">${itemTitle}</a>` : `<span>${itemTitle}</span>`}${itemDescription ? `<p>${itemDescription}</p>` : ''}</li>`;
  }).join('');
  const escapedJsonLd = jsonLdItems
    .map((item) => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`)
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}" />
  <meta name="robots" content="${robots}" />
  <meta name="applicable-device" content="pc,mobile" />
  <meta name="application-name" content="${SITE_NAME}" />
  <meta property="og:type" content="${params.type || 'website'}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="${escapedDescription}" />
  <meta property="og:url" content="${escapedCanonical}" />
  <meta property="og:image" content="${escapedImage}" />
  <meta property="og:image:secure_url" content="${escapedImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapedTitle}" />
  <meta property="og:locale" content="zh_CN" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapedTitle}" />
  <meta name="twitter:description" content="${escapedDescription}" />
  <meta name="twitter:image" content="${escapedImage}" />
  <meta name="twitter:image:alt" content="${escapedTitle}" />
  <link rel="canonical" href="${escapedCanonical}" />
  <link rel="alternate" hrefLang="zh-CN" href="${escapedCanonical}" />
  <link rel="alternate" hrefLang="x-default" href="${origin}/" />
  <link rel="alternate" type="application/rss+xml" title="${SITE_NAME} Feed" href="${origin}/feed.xml" />
  <link rel="alternate" type="text/markdown" title="${SITE_NAME} AI 可读站点说明" href="${origin}/llms.txt" />
  ${escapedJsonLd}
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111827}
    main{max-width:760px;margin:0 auto;padding:32px 20px 48px}
    h1{font-size:28px;line-height:1.25;margin:0 0 12px;font-weight:850}
    p{font-size:15px;line-height:1.75;color:#4b5563;margin:0 0 18px}
    ul{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:14px}
    li{border-top:1px solid #eef2f7;padding-top:14px}
    a{color:#111827;text-decoration:none;font-weight:760}
    li p{font-size:14px;margin:6px 0 0}
  </style>
</head>
<body>
  <main>
    <h1>${escapedHeading}</h1>
    <p>${escapedBody}</p>
    ${listItems ? `<ul>${listItems}</ul>` : ''}
  </main>
</body>
</html>`;
}

function sendSeoFallbackHtml(req: Request, res: Response, html: string, maxAgeSeconds = 300) {
  setPublicCache(res, maxAgeSeconds, 1800, 1800);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}

function buildPostItemListJsonLd(origin: string, posts: any[]) {
  return posts.slice(0, 12).map((post, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: collapseSeoText(post.title || post.content || `${SITE_NAME}分类信息`, 96),
    url: `${origin}/post/${encodeURIComponent(post.id)}`,
  }));
}

function buildPostMetaHtml(params: {
  post: {
    id: string;
    title: string;
    content: string | null;
    images?: (string | null)[] | null;
    category?: { name: string | null } | null;
    viewCount?: number | null;
    likeCount?: number | null;
    shareCount?: number | null;
    user: { displayName: string | null } | null;
    createdAt: Date;
    updatedAt: Date;
  };
  targetUrl: string;
  shareUrl: string;
  req: Request;
  includeRedirectScript?: boolean;
}) {
  const { post, targetUrl, shareUrl, req, includeRedirectScript = false } = params;
  const origin = getPublicOrigin(req);
  const rawTitle = collapseText(post.title, 80) || `${post.user?.displayName || '用户'} 的帖子`;
  const pageTitle = `${rawTitle}｜${SITE_NAME}`;
  const pageDescription = collapseText(post.content || '', 100) || SITE_SHARE_DESCRIPTION;
  const shareFallbackImage = `${origin}/share-fallback.png`;
  const coverImage = post.images?.[0] ? `${origin}/share/post/${post.id}/preview.jpg` : '';
  const fallbackImage = shareFallbackImage;
  const generatedPreviewImage = shareFallbackImage;
  const shareImageMeta = resolveSocialMetaImage({
    coverImage,
    fallbackImage,
    generatedPreviewImage,
    shareFallbackImage,
  });
  const resolvedImage = shareImageMeta.socialImage;
  const resolvedFallbackImage = shareImageMeta.fallbackImage;

  const escapedTitle = escapeHtml(pageTitle);
  const escapedDescription = escapeHtml(pageDescription);
  const escapedTargetUrl = escapeHtml(targetUrl);
  const escapedShareUrl = escapeHtml(shareUrl);
  const escapedCoverImage = escapeHtml(resolvedImage);
  const escapedFallbackImage = escapeHtml(resolvedFallbackImage);
  const escapedAuthor = escapeHtml(post.user?.displayName || `${SITE_NAME}用户`);
  const escapedPublishedAt = escapeHtml(post.createdAt.toISOString());
  const escapedUpdatedAt = escapeHtml(post.updatedAt.toISOString());
  const categoryName = post.category?.name || '圈内信息';
  const keywordText = [
    categoryName,
    '分类信息网',
    '圈内信息',
    SITE_NAME,
  ].filter(Boolean).join(',');
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: rawTitle,
    description: pageDescription,
    image: resolvedImage || resolvedFallbackImage ? [resolvedImage || resolvedFallbackImage] : undefined,
    datePublished: post.createdAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: {
      '@type': 'Person',
      name: post.user?.displayName || `${SITE_NAME}用户`,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: `${origin}/icon-512.png`,
    },
    articleSection: categoryName,
    keywords: keywordText,
    mainEntityOfPage: targetUrl,
    inLanguage: 'zh-CN',
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'ViewAction' },
        userInteractionCount: post.viewCount || 0,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'LikeAction' },
        userInteractionCount: post.likeCount || 0,
      },
      {
        '@type': 'InteractionCounter',
        interactionType: { '@type': 'ShareAction' },
        userInteractionCount: post.shareCount || 0,
      },
    ],
  };
  const escapedJsonLd = JSON.stringify(articleJsonLd).replace(/</g, '\\u003c');
  const redirectMeta = includeRedirectScript
    ? `<meta http-equiv="refresh" content="1;url=${escapedTargetUrl}" />`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="${escapedDescription}" />
  <meta property="og:url" content="${escapedShareUrl}" />
  <meta property="og:image" content="${escapedCoverImage || escapedFallbackImage}" />
  <meta property="og:image:url" content="${escapedCoverImage || escapedFallbackImage}" />
  <meta property="og:image:secure_url" content="${escapedCoverImage || escapedFallbackImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapedTitle}" />
  <meta property="og:locale" content="zh_CN" />
  <meta property="article:author" content="${escapedAuthor}" />
  <meta property="article:published_time" content="${escapedPublishedAt}" />
  <meta property="article:modified_time" content="${escapedUpdatedAt}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapedTitle}" />
  <meta name="twitter:description" content="${escapedDescription}" />
  <meta name="twitter:image" content="${escapedCoverImage || escapedFallbackImage}" />
  <meta name="twitter:image:src" content="${escapedCoverImage || escapedFallbackImage}" />
  <meta name="twitter:image:alt" content="${escapedTitle}" />
  <meta itemprop="image" content="${escapedCoverImage || escapedFallbackImage}" />
  <link rel="image_src" href="${escapedCoverImage || escapedFallbackImage}" />
  <link rel="canonical" href="${escapedTargetUrl}" />
  <script type="application/ld+json">${escapedJsonLd}</script>
  ${redirectMeta}
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f9fb;color:#0f1419}
    .wrap{min-height:100vh;display:grid;place-items:center;padding:24px}
    .card{width:min(520px,100%);background:white;border:1px solid #e8edf2;border-radius:18px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.08)}
    .cover{width:100%;aspect-ratio:1200/630;object-fit:cover;background:#eef2f6;display:block}
    .body{padding:22px}
    h1{font-size:22px;line-height:1.25;margin:0 0 10px;font-weight:850}
    p{font-size:14px;line-height:1.7;color:#536471;margin:0 0 18px}
    a{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 18px;border-radius:999px;background:#0f1419;color:#fff;text-decoration:none;font-weight:800;font-size:14px}
  </style>
</head>
<body>
  <div class="wrap">
    <main class="card">
      <img class="cover" src="${escapedCoverImage || escapedFallbackImage}" alt="${escapedTitle}" />
      <div class="body">
        <h1>${escapedTitle}</h1>
        <p>${escapedDescription}</p>
        <a href="${escapedTargetUrl}">打开${SITE_NAME}查看详情</a>
      </div>
    </main>
  </div>
</body>
</html>`;
}

function wrapPreviewText(text: string, maxChars: number, maxLines: number) {
  const clean = collapseText(text, maxChars * maxLines + maxLines);
  const lines: string[] = [];
  let cursor = clean;

  while (cursor && lines.length < maxLines) {
    if (cursor.length <= maxChars) {
      lines.push(cursor);
      break;
    }
    lines.push(cursor.slice(0, maxChars));
    cursor = cursor.slice(maxChars);
  }

  if (cursor && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.。…]+$/g, '')}...`;
  }

  return lines;
}

function renderSvgText(lines: string[], x: number, y: number, size: number, lineHeight: number, color: string, weight = 700) {
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif">${escapeHtml(line)}</text>`,
  ).join('');
}

function buildSharePreviewSvg(post: { title: string; content: string; user?: { displayName: string | null } | null }) {
  const title = collapseText(post.title, 96) || `${post.user?.displayName || '用户'} 的帖子`;
  const description = collapseText(post.content, 120) || `来自${SITE_NAME}的分享内容`;
  const author = collapseText(post.user?.displayName || SITE_NAME, 28);
  const titleLines = wrapPreviewText(title, 21, 3);
  const descriptionLines = wrapPreviewText(description, 34, 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="54%" stop-color="#eef5ff"/>
      <stop offset="100%" stop-color="#fff7ed"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#0f172a" flood-opacity=".13"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1020" cy="80" r="210" fill="#0f1419" opacity=".05"/>
  <circle cx="180" cy="575" r="260" fill="#0284c7" opacity=".06"/>
  <rect x="90" y="82" width="1020" height="466" rx="44" fill="#ffffff" filter="url(#shadow)"/>
  <rect x="90" y="82" width="1020" height="466" rx="44" fill="none" stroke="#e2e8f0" stroke-width="2"/>
  <text x="136" y="150" fill="#64748b" font-size="28" font-weight="800" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif">${SITE_NAME} · ${SITE_SLOGAN}</text>
  ${renderSvgText(titleLines, 136, 242, 62, 76, '#0f1419', 900)}
  ${renderSvgText(descriptionLines, 138, 448, 30, 44, '#475569', 600)}
  <line x1="136" y1="500" x2="1064" y2="500" stroke="#e2e8f0" stroke-width="2"/>
  <circle cx="158" cy="535" r="16" fill="#0f1419"/>
  <text x="188" y="545" fill="#334155" font-size="26" font-weight="800" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif">${escapeHtml(author)}</text>
</svg>`;
}

async function loadSharePost(postId: string) {
  return prisma.post.findFirst({
    where: {
      id: postId,
      deletedAt: null,
      isPublished: true,
    },
    select: {
      id: true,
      title: true,
      content: true,
      images: true,
      viewCount: true,
      likeCount: true,
      shareCount: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      user: { select: { displayName: true } },
    },
  });
}

export function registerSeoFallbackRoutes(app: Express, options: RegisterSeoFallbackRoutesOptions) {
  const {
    buildPostSharePreviewCandidates,
    fetchSocialPreviewImage,
    sendShareFallbackImage,
  } = options;

  app.get('/share/post/:id/preview.svg', catchAsync(async (req, res) => {
    if (!isDbConfigured()) {
      return sendDatabaseUnavailable(res, '生成分享预览');
    }

    const post = await prisma.post.findFirst({
      where: {
        id: req.params.id,
        deletedAt: null,
        isPublished: true
      },
      select: {
        id: true,
        title: true,
        content: true,
        updatedAt: true,
        user: { select: { displayName: true } }
      }
    });

    if (!post) {
      return res.status(404).send('Post not found');
    }

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    setPublicCache(res, 3600, 86400, 86400);
    res.setHeader('ETag', `"share-preview-${post.id}-${post.updatedAt.getTime()}"`);
    return res.send(buildSharePreviewSvg(post));
  }));

  app.get('/share/post/:id/preview.jpg', catchAsync(async (req, res) => {
    if (!isDbConfigured()) {
      return sendDatabaseUnavailable(res, '生成分享预览');
    }

    const post = await prisma.post.findFirst({
      where: {
        id: req.params.id,
        deletedAt: null,
        isPublished: true
      },
      select: {
        id: true,
        images: true,
        updatedAt: true
      }
    });

    if (!post) {
      return sendShareFallbackImage(res);
    }

    const sourceImage = post.images?.[0];
    const previewCandidates = buildPostSharePreviewCandidates(sourceImage, req);

    if (!previewCandidates.length) {
      return sendShareFallbackImage(res);
    }

    for (const previewUrl of previewCandidates) {
      try {
        const image = await fetchSocialPreviewImage(previewUrl);
        res.setHeader('Content-Type', image.contentType);
        setPublicCache(res, 3600, 86400, 86400);
        res.setHeader('ETag', `"share-preview-image-${post.id}-${post.updatedAt.getTime()}"`);
        return res.send(image.buffer);
      } catch (error) {
        console.warn('Share preview image candidate failed:', previewUrl, error instanceof Error ? error.message : error);
      }
    }

    return sendShareFallbackImage(res);
  }));

  app.get('/post/:id', catchAsync(async (req, res, next) => {
    if (!isLikelySocialCrawler(req)) {
      return next();
    }

    if (!isDbConfigured()) {
      return sendDatabaseUnavailable(res, '生成分享页面');
    }

    const post = await loadSharePost(req.params.id);
    if (!post) {
      return res.status(404).send('Post not found');
    }

    const origin = getPublicOrigin(req);
    const targetUrl = `${origin}/post/${post.id}`;
    const shareUrl = targetUrl;
    const html = buildPostMetaHtml({
      post,
      targetUrl,
      shareUrl,
      req,
    });

    setPublicCache(res, 300, 1800, 1800);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }));

  app.get('/share/post/:id', catchAsync(async (req, res) => {
    if (!isDbConfigured()) {
      return sendDatabaseUnavailable(res, '生成分享页面');
    }

    const post = await loadSharePost(req.params.id);
    if (!post) {
      return res.status(404).send('Post not found');
    }

    const origin = getPublicOrigin(req);
    const targetUrl = `${origin}/post/${post.id}`;
    const shareUrl = `${origin}/share/post/${post.id}`;
    const html = buildPostMetaHtml({
      post,
      targetUrl,
      shareUrl,
      req,
      includeRedirectScript: true,
    });

    setPublicCache(res, 180, 86400, 1800);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }));

  app.get('/', catchAsync(async (req, res, next) => {
    if (!isLikelySocialCrawler(req)) {
      return next();
    }

    const cacheKey = getSeoFallbackCacheKey(req);
    const cachedHtml = getSeoFallbackCache(cacheKey);
    if (cachedHtml) return sendSeoFallbackHtml(req, res, cachedHtml);

    const origin = getPublicOrigin(req);
    const [categories, postsResult] = await Promise.all([
      getCachedCategories(),
      PostService.listPosts({ limit: 12 }),
    ]);
    const posts = postsResult.items || [];
    const categoryItems = (categories || []).slice(0, 24).map((category: any, index: number) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: category.name,
      url: `${origin}/category/${encodeURIComponent(category.slug || category.id)}`,
    }));
    const jsonLd = [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        alternateName: SITE_SLOGAN,
        url: origin,
        description: SITE_SHARE_DESCRIPTION,
        inLanguage: 'zh-CN',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${origin}/category/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      categoryItems.length ? {
        '@context': 'https://schema.org',
        '@type': 'SiteNavigationElement',
        name: '分类入口',
        url: origin,
      } : null,
      categoryItems.length ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${SITE_NAME}分类入口`,
        itemListElement: categoryItems,
      } : null,
      posts.length ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${SITE_NAME}最新分类信息`,
        itemListElement: buildPostItemListJsonLd(origin, posts),
      } : null,
    ].filter(Boolean) as Record<string, unknown>[];
    const html = buildSeoFallbackHtml({
      req,
      title: `${SITE_NAME}｜${SITE_SLOGAN}`,
      description: SITE_SHARE_DESCRIPTION,
      canonicalUrl: `${origin}/`,
      jsonLd,
      heading: SITE_NAME,
      body: SITE_SHARE_DESCRIPTION,
      items: posts.map((post: any) => ({
        title: post.title || post.content || `${SITE_NAME}分类信息`,
        description: post.content,
        url: `${origin}/post/${encodeURIComponent(post.id)}`,
      })),
    });

    setSeoFallbackCache(cacheKey, html);
    return sendSeoFallbackHtml(req, res, html);
  }));

  app.get('/category/:id', catchAsync(async (req, res, next) => {
    if (!isLikelySocialCrawler(req)) {
      return next();
    }

    const cacheKey = getSeoFallbackCacheKey(req);
    const cachedHtml = getSeoFallbackCache(cacheKey);
    if (cachedHtml) return sendSeoFallbackHtml(req, res, cachedHtml);

    const origin = getPublicOrigin(req);
    const rawCategoryId = decodeSeoPathSegment(req.params.id);
    const view = normalizeSeoQueryParam(req.query.view);
    const country = normalizeSeoQueryParam(req.query.country);
    const query = normalizeSeoQueryParam(req.query.q);
    const categories = await getCachedCategories();
    const category = (categories || []).find((item: any) => {
      const refs = [item.id, item.slug, item.name].map((value) => String(value || '').trim().toLowerCase());
      return refs.includes(rawCategoryId.toLowerCase());
    });
    const categoryName = category?.name || (rawCategoryId === 'search' ? '搜索' : rawCategoryId) || '分类';
    const isSearchPage = rawCategoryId === 'search' || Boolean(query);
    const isTagPage = view === 'tag';
    const isLocationPage = view === 'location' || Boolean(country);
    const pageTitle = isSearchPage
      ? `${query || categoryName} 相关分类信息`
      : isTagPage
        ? `${categoryName} 标签页`
        : isLocationPage
          ? `${country || categoryName} 地区分类信息`
          : `${categoryName}分类信息`;
    const pageDescription = isSearchPage
      ? `在${SITE_NAME}搜索“${query || categoryName}”，查看最新圈内分类信息。`
      : isLocationPage
        ? `浏览${country || categoryName}本地分类信息，发现最新服务、资源和动态。`
        : `浏览${categoryName}相关分类信息，发现最新资讯、服务、资源和商务动态。`;
    const listFilter: any = { limit: 12 };
    if (country) listFilter.country = country;
    if (query) listFilter.query = query;
    if (!isSearchPage) {
      if (isTagPage) {
        listFilter.query = categoryName || rawCategoryId;
      } else if (isLocationPage) {
        listFilter.location = categoryName;
      } else {
        listFilter.categoryId = rawCategoryId;
      }
    }

    const postsResult = await PostService.listPosts(listFilter);
    const posts = postsResult.items || [];
    const canonicalUrl = getSeoCanonicalUrl(req);
    const jsonLd = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: pageTitle,
        description: pageDescription,
        url: canonicalUrl,
        inLanguage: 'zh-CN',
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: origin },
        about: [
          { '@type': 'Thing', name: categoryName },
          { '@type': 'Thing', name: '分类信息' },
        ],
      },
      posts.length ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${categoryName}分类信息列表`,
        itemListElement: buildPostItemListJsonLd(origin, posts),
      } : null,
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: origin },
          { '@type': 'ListItem', position: 2, name: categoryName, item: canonicalUrl },
        ],
      },
    ].filter(Boolean) as Record<string, unknown>[];
    const html = buildSeoFallbackHtml({
      req,
      title: pageTitle,
      description: pageDescription,
      canonicalUrl,
      noindex: isSearchPage,
      jsonLd,
      heading: pageTitle,
      body: pageDescription,
      items: posts.map((post: any) => ({
        title: post.title || post.content || `${categoryName}分类信息`,
        description: post.content,
        url: `${origin}/post/${encodeURIComponent(post.id)}`,
      })),
    });

    setSeoFallbackCache(cacheKey, html);
    return sendSeoFallbackHtml(req, res, html);
  }));

  app.get('/user/:id', catchAsync(async (req, res, next) => {
    if (!isLikelySocialCrawler(req)) {
      return next();
    }

    const cacheKey = getSeoFallbackCacheKey(req);
    const cachedHtml = getSeoFallbackCache(cacheKey);
    if (cachedHtml) return sendSeoFallbackHtml(req, res, cachedHtml);

    const safeUserId = decodeSeoPathSegment(req.params.id);
    const user = await UserService.getUser(safeUserId);
    if (!user || (user as any).isDisabled) {
      return res.status(404).send('User not found');
    }

    const origin = getPublicOrigin(req);
    const canonicalUrl = `${origin}/user/${encodeURIComponent(safeUserId)}`;
    const displayName = collapseSeoText((user as any).displayName || '用户', 48) || '用户';
    const bio = collapseSeoText((user as any).bio || `查看${displayName}在${SITE_NAME}发布的公开分类信息。`, 180);
    const postsResult = await PostService.listPosts({ userId: safeUserId, limit: 12 });
    const posts = postsResult.items || [];
    const personId = `${canonicalUrl}#person`;
    const jsonLd = [
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': personId,
        name: displayName,
        description: bio,
        url: canonicalUrl,
        image: toSeoAbsoluteUrl(req, (user as any).photoUrl) || undefined,
        inLanguage: 'zh-CN',
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'ViewAction' },
            userInteractionCount: Number((user as any).viewCount || 0),
          },
          {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'FollowAction' },
            userInteractionCount: Number((user as any).followerCount || 0),
          },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        '@id': canonicalUrl,
        name: `${displayName}的个人主页`,
        url: canonicalUrl,
        inLanguage: 'zh-CN',
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: origin },
        mainEntity: { '@id': personId },
      },
      posts.length ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${displayName}的最近发布`,
        itemListElement: buildPostItemListJsonLd(origin, posts),
      } : null,
    ].filter(Boolean) as Record<string, unknown>[];
    const html = buildSeoFallbackHtml({
      req,
      title: `${displayName}的空间`,
      description: bio,
      canonicalUrl,
      type: 'profile',
      image: (user as any).photoUrl,
      jsonLd,
      heading: `${displayName}的个人主页`,
      body: bio,
      items: posts.map((post: any) => ({
        title: post.title || post.content || `${displayName}的帖子`,
        description: post.content,
        url: `${origin}/post/${encodeURIComponent(post.id)}`,
      })),
    });

    setSeoFallbackCache(cacheKey, html);
    return sendSeoFallbackHtml(req, res, html);
  }));

  app.get([
    '/chat',
    '/create',
    '/sponsor',
    '/promote',
    '/promote/history',
    '/transactions',
    '/recharge',
    '/profile',
  ], catchAsync(async (req, res, next) => {
    if (!isLikelySocialCrawler(req)) {
      return next();
    }

    const origin = getPublicOrigin(req);
    const titleMap: Record<string, string> = {
      '/chat': '聊天室',
      '/create': '发布分类信息',
      '/sponsor': '推广内容',
      '/promote': '推广内容',
      '/promote/history': '推广记录',
      '/transactions': '交易记录',
      '/recharge': '充值',
      '/profile': '个人资料',
    };
    const pageTitle = titleMap[req.path] || SITE_NAME;
    const html = buildSeoFallbackHtml({
      req,
      title: `${pageTitle}｜${SITE_NAME}`,
      description: `${pageTitle}属于${SITE_NAME}的功能页面，需要进入应用后使用。`,
      canonicalUrl: `${origin}${req.path}`,
      noindex: true,
      heading: pageTitle,
      body: '该页面不参与搜索引擎收录，请进入应用后继续操作。',
    });

    return sendSeoFallbackHtml(req, res, html, 600);
  }));
}
