import { useEffect } from 'react';
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
} from '@/platform/brand';

const MAX_CANONICAL_PATH_LENGTH = 512;
const MAX_TITLE_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 180;
const MAX_KEYWORDS_LENGTH = 220;

interface SEOProps {
  title?: string;
  socialTitle?: string;
  description?: string;
  keywords?: string;
  id?: string;
  canonicalPath?: string;
  image?: string;
  type?: 'website' | 'article';
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

function normalizeOrigin(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const isLocalHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(parsed.hostname);
    const proto = isLocalHost || parsed.protocol === 'https:' ? parsed.protocol : 'https:';
    return `${proto}//${parsed.host}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function resolveAllowedCanonicalParams(normalizedPath: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams();

  if (normalizedPath.startsWith('/category/')) {
    const view = searchParams.get('view');
    if (view === 'tag' || view === 'location') {
      params.set('view', view);
    }

    const country = (searchParams.get('country') || '').trim();
    if (country) {
      params.set('country', country);
    }

    const page = (searchParams.get('page') || '').trim();
    if (/^\d+$/.test(page)) {
      params.set('page', page);
    }

    const query = (searchParams.get('q') || '').trim();
    if (query) {
      params.set('q', query);
    }
    return params;
  }

  return params;
}

function normalizeWhitespace(value: string, maxLength: number) {
  const normalized = `${value || ''}`.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function clampPath(path: string) {
  return path.length > 1 ? path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') : '/';
}

function resolveAppOrigin() {
  const configured = normalizeOrigin((import.meta as any).env?.VITE_APP_URL);
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/+$/, '');
  return '';
}

function normalizeCanonicalPath(path: string) {
  const raw = path.trim();
  if (!raw) return '/';
  const noHash = raw.split('#')[0];
  const normalizedRaw = noHash.length > MAX_CANONICAL_PATH_LENGTH ? '/' : noHash;

  try {
    const parsed = /^https?:\/\//i.test(normalizedRaw)
      ? new URL(normalizedRaw)
      : new URL(normalizedRaw.startsWith('/') ? normalizedRaw : `/${normalizedRaw}`, 'https://canonical.local');
    const pathname = parsed.pathname || '/';
    const normalizedPath = clampPath(pathname);
    const allowedParams = resolveAllowedCanonicalParams(normalizedPath, parsed.searchParams);

    const query = allowedParams.toString();
    return `${normalizedPath}${query ? `?${query}` : ''}`;
  } catch {
    const [pathname] = normalizedRaw.split('?');
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return clampPath(normalizedPath);
  }
}

function resolveCanonicalUrl(id?: string, canonicalPath?: string) {
  const origin = resolveAppOrigin();
  if (!origin) return '';
  if (id) return `${origin}/post/${encodeURIComponent(id)}`;
  if (canonicalPath) {
    if (/^https?:\/\//i.test(canonicalPath)) {
      try {
        const parsed = new URL(canonicalPath);
        return `${parsed.origin}${normalizeCanonicalPath(canonicalPath)}`;
      } catch {
        return `${origin}${normalizeCanonicalPath(canonicalPath)}`;
      }
    }
    return `${origin}${normalizeCanonicalPath(canonicalPath)}`;
  }
  if (typeof window === 'undefined') return origin;
  return `${origin}${window.location.pathname}`;
}

type HeadAttribute = 'name' | 'property';

function upsertMeta(attribute: HeadAttribute, key: string, content: string) {
  const selector = `meta[${attribute}="${CSS.escape(key)}"]`;
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(attribute, key);
    document.head.appendChild(node);
  }
  node.dataset.tuituiSeo = 'managed';
  node.content = content;
}

function removeManagedMeta(attribute: HeadAttribute, key: string) {
  document.head
    .querySelector<HTMLMetaElement>(`meta[${attribute}="${CSS.escape(key)}"][data-tuitui-seo="managed"]`)
    ?.remove();
}

function upsertLink(selector: string, attributes: Record<string, string>) {
  let node = document.head.querySelector<HTMLLinkElement>(selector);
  if (!node) {
    node = document.createElement('link');
    document.head.appendChild(node);
  }
  node.dataset.tuituiSeo = 'managed';
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
}

function removeManagedLink(selector: string) {
  document.head.querySelector<HTMLLinkElement>(`${selector}[data-tuitui-seo="managed"]`)?.remove();
}

export default function SEO({ 
  title = SITE_TITLE,
  socialTitle,
  description = SITE_DESCRIPTION,
  keywords = SITE_KEYWORDS,
  id,
  canonicalPath,
  image,
  type = 'website',
  jsonLd,
  noindex = false,
}: SEOProps) {
  const siteName = SITE_NAME;
  const safeTitle = normalizeWhitespace(title, MAX_TITLE_LENGTH) || SITE_TITLE;
  const fullTitleRaw = safeTitle.includes(siteName) ? safeTitle : `${safeTitle}｜${siteName}`;
  const fullTitle = normalizeWhitespace(fullTitleRaw, MAX_TITLE_LENGTH) || SITE_TITLE;
  const safeSocialTitle = normalizeWhitespace(socialTitle || fullTitle, MAX_TITLE_LENGTH) || fullTitle;
  const resolvedDescription = normalizeWhitespace(description, MAX_DESCRIPTION_LENGTH) || SITE_DESCRIPTION;
  const resolvedKeywords = normalizeWhitespace(keywords, MAX_KEYWORDS_LENGTH) || SITE_KEYWORDS;
  const appOrigin = resolveAppOrigin();
  const canonicalUrl = resolveCanonicalUrl(id, canonicalPath);
  const twitterSite = `${(import.meta as any).env?.VITE_TWITTER_SITE || ''}`.trim();
  const normalizedTwitterSite = twitterSite ? (twitterSite.startsWith('@') ? twitterSite : `@${twitterSite}`) : '';
  const jsonLdItems = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  const baiduSiteVerification = `${(import.meta as any).env?.VITE_BAIDU_SITE_VERIFICATION || ''}`.trim();
  const xDefaultHref = appOrigin || canonicalUrl || undefined;
  const imageSource = image || '/share-fallback.png';
  const resolvedImage = typeof window === 'undefined'
    ? imageSource
    : imageSource.startsWith('http')
      ? imageSource
      : `${appOrigin || window.location.origin}${imageSource.startsWith('/') ? imageSource : `/${imageSource}`}`;
  const jsonLdPayload = JSON.stringify(jsonLdItems);

  useEffect(() => {
    document.title = fullTitle;

    const metaByName: Record<string, string> = {
      description: resolvedDescription,
      keywords: resolvedKeywords,
      robots: noindex ? 'noindex,nofollow,noarchive' : 'index,follow,max-image-preview:large',
      'applicable-device': 'pc,mobile',
      'application-name': siteName,
      'apple-mobile-web-app-title': siteName,
      'twitter:card': 'summary_large_image',
      'twitter:title': safeSocialTitle,
      'twitter:description': resolvedDescription,
      'twitter:image': resolvedImage,
      'twitter:image:src': resolvedImage,
      'twitter:image:alt': safeSocialTitle,
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content',
      'theme-color': '#ffffff',
    };
    if (canonicalUrl) metaByName['twitter:url'] = canonicalUrl;
    if (normalizedTwitterSite) metaByName['twitter:site'] = normalizedTwitterSite;
    if (baiduSiteVerification) metaByName['baidu-site-verification'] = baiduSiteVerification;
    for (const [name, content] of Object.entries(metaByName)) upsertMeta('name', name, content);

    if (!canonicalUrl) removeManagedMeta('name', 'twitter:url');
    if (!normalizedTwitterSite) removeManagedMeta('name', 'twitter:site');
    if (!baiduSiteVerification) removeManagedMeta('name', 'baidu-site-verification');

    const metaByProperty: Record<string, string> = {
      'og:type': type,
      'og:title': safeSocialTitle,
      'og:description': resolvedDescription,
      'og:image': resolvedImage,
      'og:image:secure_url': resolvedImage,
      'og:image:width': '1200',
      'og:image:height': '630',
      'og:image:alt': safeSocialTitle,
      'og:site_name': siteName,
      'og:locale': 'zh_CN',
      'og:locale:alternate': 'zh_CN',
    };
    if (canonicalUrl) metaByProperty['og:url'] = canonicalUrl;
    for (const [property, content] of Object.entries(metaByProperty)) upsertMeta('property', property, content);
    if (!canonicalUrl) removeManagedMeta('property', 'og:url');

    if (canonicalUrl) {
      upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl });
      upsertLink('link[rel="alternate"][hreflang="zh-CN"]', { rel: 'alternate', hreflang: 'zh-CN', href: canonicalUrl });
    } else {
      removeManagedLink('link[rel="canonical"]');
      removeManagedLink('link[rel="alternate"][hreflang="zh-CN"]');
    }

    if (xDefaultHref) {
      upsertLink('link[rel="alternate"][hreflang="x-default"]', { rel: 'alternate', hreflang: 'x-default', href: xDefaultHref });
    } else {
      removeManagedLink('link[rel="alternate"][hreflang="x-default"]');
    }

    if (appOrigin) {
      upsertLink('link[rel="alternate"][type="application/rss+xml"]', {
        rel: 'alternate',
        type: 'application/rss+xml',
        title: '推推分类信息 Feed',
        href: `${appOrigin}/feed.xml`,
      });
      upsertLink('link[rel="alternate"][type="text/markdown"]', {
        rel: 'alternate',
        type: 'text/markdown',
        title: '推推 AI 可读站点说明',
        href: `${appOrigin}/llms.txt`,
      });
    }

    document.head.querySelectorAll('script[data-tuitui-seo-jsonld]').forEach((node) => node.remove());
    for (const item of jsonLdItems) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.tuituiSeoJsonld = 'true';
      script.textContent = JSON.stringify(item);
      document.head.appendChild(script);
    }

    return () => {
      document.head.querySelectorAll('script[data-tuitui-seo-jsonld]').forEach((node) => node.remove());
    };
  }, [
    appOrigin,
    baiduSiteVerification,
    canonicalUrl,
    fullTitle,
    jsonLdPayload,
    noindex,
    normalizedTwitterSite,
    resolvedDescription,
    resolvedImage,
    resolvedKeywords,
    safeSocialTitle,
    siteName,
    type,
    xDefaultHref,
  ]);

  return null;
}
