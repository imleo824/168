import {
  POST_CONTENT_MAX_LENGTH,
  POST_LOCATION_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from '../../../shared/postPublishing';

export { POST_CONTENT_MAX_LENGTH };
export { CATEGORY_META_TEXT_MAX_LENGTH } from '@/features/category/categoryMetaSchema';
export const POST_CREATE_TITLE_MAX_LENGTH = POST_TITLE_MAX_LENGTH;
export const POST_CREATE_LOCATION_MAX_LENGTH = POST_LOCATION_MAX_LENGTH;
export const POST_CREATE_CANCEL_GUARD_MS = 280;
export const POST_CREATE_PAGE_TITLE = '发布';
export const POST_CREATE_SETTINGS_LABEL = '公开与隐私';
export const POST_CREATE_CATEGORY_META_INCOMPLETE_TOAST = '请补充完整的分类信息';
export const POST_CREATE_DRAFT_STORAGE_KEY = 'tui_post_create_draft_v1';
export const POST_CREATE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
