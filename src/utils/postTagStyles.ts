import type { PostMetaChipKind } from '@/ui/uiTypes';
import type { PostStructuredMetaItem } from './postStructuredMeta.ts';

export const POST_TAG_ROW_CLASS = 'post-tag-row';

const POST_TAG_CHIP_BASE_CLASS = 'ui-chip post-tag-chip';

export const LOCATION_TAG_CHIP_CLASS = `${POST_TAG_CHIP_BASE_CLASS} post-tag-chip--location pressable`;

export const CATEGORY_TAG_CHIP_CLASS = `${POST_TAG_CHIP_BASE_CLASS} post-tag-chip--category pressable`;

export const NORMAL_TAG_CHIP_CLASS = CATEGORY_TAG_CHIP_CLASS;

function normalizeMetaRef(value: unknown) {
  return String(value || '').trim().replace(/[\s_-]+/g, '').toLowerCase();
}

export function resolvePostMetaChipKind(item: Pick<PostStructuredMetaItem, 'key' | 'label'>): PostMetaChipKind {
  const key = normalizeMetaRef(item.key);
  const label = normalizeMetaRef(item.label);
  if (key === 'location' || label === '地点') return 'location';
  if (['salary', 'salaryrange'].includes(key) || ['薪资', '工资'].includes(label)) return 'salary';
  if (['price', 'rent'].includes(key) || ['价格', '租金'].includes(label)) return 'price';
  if (['type', 'servicetype', 'itemcategory', 'position', 'jobtype', 'role'].includes(key)) return 'category';
  if (['类型', '服务类型', '品类', '岗位', '职位'].includes(label)) return 'category';
  return 'default';
}

export function getPostMetaChipClass(kind: PostMetaChipKind, interactive = false) {
  return `${POST_TAG_CHIP_BASE_CLASS} post-tag-chip--${kind}${interactive ? ' pressable' : ''}`;
}
