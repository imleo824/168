import {
  POST_CONTENT_MAX_LENGTH,
  POST_LOCATION_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from '../../../shared/postPublishing';

export const POST_CREATE_RETURN_PATH_KEY = 'post-create-return-path';
export const POST_CREATE_EXIT_PATH_KEY = 'post-create-exit-path';
export { POST_CONTENT_MAX_LENGTH };
export { CATEGORY_META_TEXT_MAX_LENGTH } from '@/features/category/categoryMetaSchema';
export const POST_CREATE_TITLE_MAX_LENGTH = POST_TITLE_MAX_LENGTH;
export const POST_CREATE_LOCATION_MAX_LENGTH = POST_LOCATION_MAX_LENGTH;
export const POST_CREATE_CANCEL_GUARD_MS = 280;
export const POST_CREATE_SAVE_CONTACT_RESET_MS = 120;
export const POST_CREATE_FOCUS_RETRY_DELAYS_MS = [0, 80, 180, POST_CREATE_CANCEL_GUARD_MS, 520, 820] as const;
export const POST_CREATE_PAGE_TITLE = '发推';
export const POST_CREATE_SETTINGS_LABEL = '发布设置';
export const POST_CREATE_CATEGORY_META_INCOMPLETE_TOAST = '请补充分类信息';
