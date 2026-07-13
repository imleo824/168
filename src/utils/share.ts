const SHARE_DEFAULT_TEXT = '来看看这条来自推推的内容';

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export interface ShareLandingOptions {
  cacheBust?: boolean;
  source?: string;
  ref?: string;
}

export function getShareLandingUrl(
  postId: string,
  options: ShareLandingOptions = {},
) {
  const { cacheBust = false, source, ref } = options;
  const url = new URL(`/share/post/${postId}`, window.location.origin);
  if (source) {
    url.searchParams.set('source', source);
  }
  if (ref) {
    url.searchParams.set('ref', ref);
  }
  if (cacheBust) {
    url.searchParams.set('v', String(Date.now()));
  }
  return url.toString();
}

function buildShareText({
  title = '',
  content = '',
  maxTextLength = 120,
}: {
  title?: string;
  content?: string;
  maxTextLength?: number;
}) {
  const normalizedTitle = (title || '').replace(/\s+/g, ' ').trim();
  const normalizedContent = (content || '').replace(/\s+/g, ' ').trim();
  const merged = normalizedContent && normalizedContent === normalizedTitle ? normalizedTitle : [normalizedTitle, normalizedContent].filter(Boolean).join('\n');
  const fallback = normalizedTitle || SHARE_DEFAULT_TEXT;
  const text = (merged || fallback).replace(/\n+/g, '\n');
  return text.length > maxTextLength ? `${text.slice(0, maxTextLength - 1)}…` : text;
}

export function buildSharePayload({
  postId,
  title = '',
  content = '',
  maxTextLength = 120,
  cacheBust = false,
  source,
  ref,
}: {
  postId: string;
  title?: string;
  content?: string;
  maxTextLength?: number;
  cacheBust?: boolean;
  source?: string;
  ref?: string;
}): SharePayload {
  const text = buildShareText({ title, content, maxTextLength });
  const shareUrl = getShareLandingUrl(postId, { cacheBust, source, ref });
  return {
    title: (title || '推推').trim(),
    text,
    url: shareUrl,
  };
}

export async function shareWithSystem(payload: SharePayload) {
  const canUseShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (!canUseShare || typeof navigator === 'undefined') {
    throw new Error('当前环境不支持系统分享');
  }

  const shareData: ShareData = {
    title: payload.title,
    text: payload.text,
    url: payload.url,
  };

  if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
    throw new Error('当前内容无法使用系统分享');
  }

  return navigator.share(shareData);
}
