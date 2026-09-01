import { Helmet } from 'react-helmet-async';
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

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="keywords" content={resolvedKeywords} />
      <meta name="robots" content={noindex ? 'noindex,nofollow,noarchive' : 'index,follow,max-image-preview:large'} />
      <meta name="applicable-device" content="pc,mobile" />
      {baiduSiteVerification && <meta name="baidu-site-verification" content={baiduSiteVerification} />}
      <meta name="application-name" content={siteName} />
      <meta name="apple-mobile-web-app-title" content={siteName} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={safeSocialTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:image" content={resolvedImage} />
      <meta property="og:image:secure_url" content={resolvedImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={safeSocialTitle} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="zh_CN" />
      <meta property="og:locale:alternate" content="zh_CN" />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      {canonicalUrl && <meta name="twitter:url" content={canonicalUrl} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={safeSocialTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      {normalizedTwitterSite ? <meta name="twitter:site" content={normalizedTwitterSite} /> : null}
      <meta name="twitter:image" content={resolvedImage} />
      <meta name="twitter:image:src" content={resolvedImage} />
      <meta name="twitter:image:alt" content={safeSocialTitle} />
      {/* Global Meta */}
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
      <meta name="theme-color" content="#ffffff" />
      
      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {canonicalUrl ? <link rel="alternate" hrefLang="zh-CN" href={canonicalUrl} /> : null}
      {xDefaultHref ? <link rel="alternate" hrefLang="x-default" href={xDefaultHref} /> : null}
      {appOrigin && <link rel="alternate" type="application/rss+xml" title="推推分类信息 Feed" href={`${appOrigin}/feed.xml`} />}
      {appOrigin && <link rel="alternate" type="text/markdown" title="推推 AI 可读站点说明" href={`${appOrigin}/llms.txt`} />}

      {jsonLdItems.map((item, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
}
