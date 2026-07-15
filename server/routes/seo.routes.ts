import type { Express, Request } from 'express';
import prisma, { isDbConfigured } from '../db';
import { catchAsync } from '../middlewares/error';
import { setPublicCache } from '../http-cache';
import { getPublicOrigin } from '../http-origin';
import { SITE_NAME } from '../site-meta';

const SITEMAP_CACHE_TTL_MS = 10 * 60 * 1000;
const sitemapCache = new Map<string, { expiresAt: number; xml: string }>();

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function collapseText(text: string | undefined, maxLength: number) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function sitemapUrlEntry({
  loc,
  lastmod,
  changefreq,
  priority,
  images,
}: {
  loc: string;
  lastmod?: Date | string | null;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  priority?: string;
  images?: Array<{ loc: string; title?: string; caption?: string }>;
}) {
  const lines = [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
  ];
  if (lastmod) {
    const iso = lastmod instanceof Date ? lastmod.toISOString() : new Date(lastmod).toISOString();
    lines.push(`    <lastmod>${escapeXml(iso)}</lastmod>`);
  }
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  images?.forEach((image) => {
    if (!image.loc) return;
    lines.push('    <image:image>');
    lines.push(`      <image:loc>${escapeXml(image.loc)}</image:loc>`);
    if (image.title) lines.push(`      <image:title>${escapeXml(image.title)}</image:title>`);
    if (image.caption) lines.push(`      <image:caption>${escapeXml(image.caption)}</image:caption>`);
    lines.push('    </image:image>');
  });
  lines.push('  </url>');
  return lines.join('\n');
}

function resolvePublicAssetUrl(origin: string, value?: string | null) {
  const raw = `${value || ''}`.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${origin}${raw}`;
  return `${origin}/${raw}`;
}

async function buildSitemapXml(req: Request, options: { includeImages: boolean }) {
  const origin = getPublicOrigin(req);
  const now = new Date();
  const cacheKey = `${origin}:${options.includeImages ? 'image' : 'standard'}`;
  const cached = sitemapCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.xml;
  }

  const entries = [
    sitemapUrlEntry({ loc: `${origin}/`, lastmod: now, changefreq: 'hourly', priority: '1.0' }),
  ];

  if (isDbConfigured()) {
    const [categories, posts, users] = await Promise.all([
      prisma.category.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, slug: true, updatedAt: true },
      }),
      prisma.post.findMany({
        where: { isPublished: true, deletedAt: null },
        orderBy: [{ updatedAt: 'desc' }],
        take: 5000,
        select: {
          id: true,
          title: true,
          content: true,
          images: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: {
          isDisabled: false,
          posts: { some: { isPublished: true, deletedAt: null } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 1000,
        select: { id: true, updatedAt: true, createdAt: true },
      }),
    ]);

    categories.forEach((category) => {
      entries.push(sitemapUrlEntry({
        loc: `${origin}/category/${encodeURIComponent(category.slug || category.id)}`,
        lastmod: category.updatedAt,
        changefreq: 'daily',
        priority: '0.8',
      }));
    });

    posts.forEach((post) => {
      const postTitle = collapseText(post.title || post.content || `${SITE_NAME}分类信息`, 80);
      const imageUrl = resolvePublicAssetUrl(origin, post.images?.[0]);
      entries.push(sitemapUrlEntry({
        loc: `${origin}/post/${encodeURIComponent(post.id)}`,
        lastmod: post.updatedAt || post.createdAt,
        changefreq: 'weekly',
        priority: '0.7',
        images: options.includeImages && imageUrl
          ? [{
              loc: imageUrl,
              title: postTitle,
              caption: collapseText(post.content || post.title || '', 120),
            }]
          : undefined,
      }));
    });

    users.forEach((user) => {
      entries.push(sitemapUrlEntry({
        loc: `${origin}/user/${encodeURIComponent(user.id)}`,
        lastmod: user.updatedAt || user.createdAt,
        changefreq: 'weekly',
        priority: '0.3',
      }));
    });
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    options.includeImages
      ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">'
      : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  sitemapCache.set(cacheKey, {
    xml,
    expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS,
  });

  return xml;
}

export function registerSeoRoutes(app: Express) {
  app.get('/robots.txt', catchAsync(async (req, res) => {
    const origin = getPublicOrigin(req);
    setPublicCache(res, 3600, 86400, 86400);
    res.type('text/plain; charset=utf-8');
    const disallowRules = [
      'Disallow: /api/',
      'Disallow: /168wc',
      'Disallow: /profile',
      'Disallow: /transactions',
      'Disallow: /recharge',
      'Disallow: /create',
      'Disallow: /sponsor',
      'Disallow: /promote',
      'Disallow: /promote/history',
    ];
    const crawlerGroups = [
      'Baiduspider',
      'Googlebot',
      'Bingbot',
      'Sogou web spider',
      '360Spider',
      'Bytespider',
      '*',
    ].flatMap((agent) => [
      `User-agent: ${agent}`,
      'Allow: /',
      ...disallowRules,
      '',
    ]);
    res.send([
      ...crawlerGroups,
      `Sitemap: ${origin}/sitemap.xml`,
      `Sitemap: ${origin}/baidu-sitemap.xml`,
      '',
    ].join('\n'));
  }));

  app.get('/llms.txt', catchAsync(async (req, res) => {
    const origin = getPublicOrigin(req);
    setPublicCache(res, 1800, 86400, 86400);

    let categoryLines: string[] = [];
    if (isDbConfigured()) {
      const categories = await prisma.category.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        take: 80,
        select: { id: true, slug: true, name: true },
      });
      categoryLines = categories.map((category) =>
        `- [${category.name}](${origin}/category/${encodeURIComponent(category.slug || category.id)})`,
      );
    }

    const markdown = [
      `# ${SITE_NAME}`,
      '',
      '推推是圈内最大的匿名社交分类信息网，聚合资讯快讯、招聘求职、资源对接、房屋租赁、证件护照、保关捞人等信息。',
      '',
      '## 核心定位',
      '- 分类信息网',
      '- 圈内最重要信息聚合',
      '- 信息发布与互动',
      '- 招聘求职、资源合作、本地服务',
      '- 以发布高效、实时更新、内容更准为核心',
      '',
      '## 重要入口',
      `- [首页](${origin}/)`,
      `- [发布信息](${origin}/create)`,
      `- [推广内容](${origin}/promote)`,
      `- [站点地图](${origin}/sitemap.xml)`,
      `- [百度标准站点地图](${origin}/baidu-sitemap.xml)`,
      `- [内容订阅](${origin}/feed.xml)`,
      '',
      categoryLines.length ? '## 分类入口' : '',
      ...categoryLines,
      '',
      '## 抓取建议',
      '- 优先理解首页、分类页、标签页、详情页。',
      '- 详情页是单条分类信息的权威页面。',
      '- 分类页和标签页代表主题聚合页面。',
      '- 个人中心、充值、交易、后台页面不适合收录。',
      '',
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n');

    res.type('text/markdown; charset=utf-8');
    res.send(markdown);
  }));

  app.get('/feed.xml', catchAsync(async (req, res) => {
    const origin = getPublicOrigin(req);
    setPublicCache(res, 600, 3600, 86400);

    const posts = isDbConfigured()
      ? await prisma.post.findMany({
          where: { isPublished: true, deletedAt: null },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 80,
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            images: true,
            category: { select: { name: true } },
          },
        })
      : [];

    const items = posts.map((post) => {
      const loc = `${origin}/post/${encodeURIComponent(post.id)}`;
      const title = collapseText(post.title || post.content || `${SITE_NAME}分类信息`, 80);
      const description = collapseText(post.content || post.title || `${SITE_NAME}分类信息`, 240);
      const imageUrl = resolvePublicAssetUrl(origin, post.images?.[0]);
      const categories = [post.category?.name]
        .filter(Boolean)
        .map((name) => `      <category>${escapeXml(name || '')}</category>`)
        .join('\n');
      return [
        '    <item>',
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(loc)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(loc)}</guid>`,
        `      <pubDate>${post.createdAt.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        imageUrl ? `      <enclosure url="${escapeXml(imageUrl)}" type="image/jpeg" />` : '',
        categories,
        '    </item>',
      ].filter(Boolean).join('\n');
    });

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      '  <channel>',
      `    <title>${SITE_NAME}</title>`,
      `    <link>${escapeXml(origin)}</link>`,
      '    <description>推推是圈内最大的匿名社交分类信息网，聚合资讯快讯、招聘求职、资源对接和本地服务等信息。</description>',
      '    <language>zh-CN</language>',
      `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
      ...items,
      '  </channel>',
      '</rss>',
      '',
    ].join('\n');

    res.type('application/rss+xml; charset=utf-8');
    res.send(xml);
  }));

  app.get('/sitemap.xml', catchAsync(async (req, res) => {
    const xml = await buildSitemapXml(req, { includeImages: true });

    setPublicCache(res, 600, 3600, 86400);
    res.type('application/xml; charset=utf-8');
    return res.send(xml);
  }));

  app.get('/baidu-sitemap.xml', catchAsync(async (req, res) => {
    const xml = await buildSitemapXml(req, { includeImages: false });

    setPublicCache(res, 600, 3600, 86400);
    res.type('application/xml; charset=utf-8');
    return res.send(xml);
  }));
}
