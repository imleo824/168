export const POST_TITLE_MAX_LENGTH = 18;
export const POST_CONTENT_MAX_LENGTH = 5000;
export const POST_CONTACT_MAX_LENGTH = 120;
export const POST_LOCATION_MAX_LENGTH = 120;
export const POST_MAX_IMAGE_COUNT = 9;
export const POST_IMAGE_URL_MAX_LENGTH = 2048;
export const NON_MEMBER_DAILY_CONTACT_POST_LIMIT = 1;
export const POST_IMAGE_ONLY_TITLE = '图片动态';
export const POST_NON_MEMBER_CONTACT_LIMIT_MESSAGE = '普通用户每天可展示 1 次联系方式，会员不限';
export const POST_PROMOTION_LINK_MEMBER_MESSAGE = '开通会员后可添加推广链接';
export const POST_PROMOTION_LINK_META_KEY = '__postPromotionLink';
export const POST_PROMOTION_LINK_TITLE_MAX_LENGTH = 40;
export const POST_PROMOTION_LINK_URL_MAX_LENGTH = 500;

export type PostPromotionLink = {
  title: string;
  url: string;
};

export function cleanPostPromotionLinkTitle(raw: unknown) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, POST_PROMOTION_LINK_TITLE_MAX_LENGTH);
}

export function normalizePostPromotionLinkUrl(raw: unknown) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.length > POST_PROMOTION_LINK_URL_MAX_LENGTH) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function normalizePostPromotionLinkInput(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { link: null, error: '' } as { link: PostPromotionLink | null; error: string };
  }

  const source = raw as Record<string, unknown>;
  const title = cleanPostPromotionLinkTitle(source.title);
  const url = normalizePostPromotionLinkUrl(source.url);
  if (!title && !url) return { link: null, error: '' };
  if (!title || !url) return { link: null, error: '推广链接需要填写标题和网址链接' };
  return { link: { title, url }, error: '' };
}
