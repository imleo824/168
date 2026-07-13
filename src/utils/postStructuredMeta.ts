import { selectFinestDisplayLocation } from '@/utils/postPresentation';

export type PostStructuredMetaItem = {
  key: string;
  label: string;
  value: string;
  rawValue?: unknown;
  filterValues?: Record<string, unknown>;
};

const POST_PROMOTION_LINK_META_KEY = '__postPromotionLink';

const STRUCTURED_META_LABELS: Record<string, string> = {
  location: '地点',
  type: '类型',
  servicetype: '类型',
  itemcategory: '品类',
  position: '岗位',
  jobtype: '岗位',
  role: '岗位',
  salary: '薪资',
  salaryrange: '薪资',
  price: '价格',
  rent: '租金',
  bedrooms: '卧室',
  bathrooms: '浴室',
  area: '面积',
  depositmonths: '押几',
  paymentmonths: '付几',
  condition: '成色',
};

const STRUCTURED_META_ORDER: Record<string, number> = {
  location: 0,
  bedrooms: 1,
  bathrooms: 2,
  price: 3,
  rent: 3,
  area: 4,
  depositpayment: 5,
  depositmonths: 5,
  paymentmonths: 5,
};

const STRUCTURED_META_LABEL_ORDER: Record<string, number> = {
  地点: 0,
  卧室: 1,
  浴室: 2,
  价格: 3,
  租金: 3,
  面积: 4,
  押付: 5,
  押几: 5,
  付几: 5,
};

function normalizeText(value: unknown, maxLength = 80) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeKey(value: unknown) {
  return normalizeText(value, 48).replace(/[\s_-]+/g, '').toLowerCase();
}

function isReservedStructuredMetaKey(key: string) {
  return key === POST_PROMOTION_LINK_META_KEY || normalizeKey(key) === normalizeKey(POST_PROMOTION_LINK_META_KEY);
}

function isPriceMetaKey(key: string) {
  return ['price', 'rent', 'salary', 'salaryrange'].includes(normalizeKey(key));
}

function isAreaMetaKey(key: string) {
  return normalizeKey(key) === 'area';
}

function isDepositMetaKey(key: string) {
  return normalizeKey(key) === 'depositmonths';
}

function isPaymentMetaKey(key: string) {
  return normalizeKey(key) === 'paymentmonths';
}

export function isPostStructuredLocationMeta(item: Pick<PostStructuredMetaItem, 'key' | 'label'>) {
  return normalizeKey(item.key) === 'location' || normalizeKey(item.label) === '地点';
}

export function normalizePostStructuredMetaValue(value: unknown) {
  return normalizeText(value, 80).replace(/\s*·\s*/g, '·').replace(/[：:]/g, '').toLowerCase();
}

function getMetaLabel(key: string) {
  return STRUCTURED_META_LABELS[normalizeKey(key)] || key;
}

function formatMetaValue(value: unknown) {
  if (value === true) return '是';
  if (value === false) return '否';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const range = value as { min?: unknown; max?: unknown };
    const min = typeof range.min === 'number' ? range.min : undefined;
    const max = typeof range.max === 'number' ? range.max : undefined;
    if (min !== undefined && max !== undefined) return `${min}-${max}`;
    if (min !== undefined) return `≥${min}`;
    if (max !== undefined) return `≤${max}`;
    return '';
  }
  return normalizeText(value, 80).replace(/\s*·\s*/g, '·');
}

function formatPlainMetaValue(value: unknown) {
  return formatMetaValue(value).replace(/^[≥≤]/, '');
}

function formatKeyedMetaValue(key: string, value: unknown) {
  const formatted = formatMetaValue(value);
  if (!formatted) return '';
  if (normalizeKey(key) === 'location') return selectFinestDisplayLocation(formatted) || formatted;
  if (isPriceMetaKey(key)) return formatCurrencySuffixValue(formatted);
  if (isAreaMetaKey(key)) return formatted.endsWith('㎡') ? formatted : `${formatted}㎡`;
  return formatted;
}

function formatCurrencySuffixValue(value: string) {
  const normalized = value.replace(/\$/g, '').replace(/\s*-\s*/g, '-').trim();
  return normalized.replace(/\d[\d,]*(?:\.\d+)?/g, (match) => `${match}$`);
}

function getMetaOrder(item: PostStructuredMetaItem) {
  const keyOrder = STRUCTURED_META_ORDER[normalizeKey(item.key)];
  if (typeof keyOrder === 'number') return keyOrder;
  const labelOrder = STRUCTURED_META_LABEL_ORDER[normalizeKey(item.label)];
  return typeof labelOrder === 'number' ? labelOrder : Number.POSITIVE_INFINITY;
}

function buildDepositPaymentMetaItem(categoryMeta: Record<string, unknown>) {
  const depositEntry = Object.entries(categoryMeta).find(([key]) => isDepositMetaKey(key));
  const paymentEntry = Object.entries(categoryMeta).find(([key]) => isPaymentMetaKey(key));
  const depositValue = depositEntry ? formatPlainMetaValue(depositEntry[1]) : '';
  const paymentValue = paymentEntry ? formatPlainMetaValue(paymentEntry[1]) : '';
  if (!depositValue && !paymentValue) return null;
  return {
    key: 'depositPayment',
    label: '押付',
    value: `${depositValue ? `押${depositValue}` : ''}${paymentValue ? `付${paymentValue}` : ''}`,
    filterValues: {
      ...(depositEntry ? { [depositEntry[0]]: depositEntry[1] } : {}),
      ...(paymentEntry ? { [paymentEntry[0]]: paymentEntry[1] } : {}),
    },
  };
}

export function buildPostStructuredMetaItems(
  categoryMeta: unknown,
  options: { maxItems?: number; skipLocation?: boolean } = {},
): PostStructuredMetaItem[] {
  if (!categoryMeta || typeof categoryMeta !== 'object' || Array.isArray(categoryMeta)) return [];
  const maxItems = typeof options.maxItems === 'number' ? Math.max(0, options.maxItems) : Number.POSITIVE_INFINITY;
  const skipLocation = options.skipLocation === true;
  const items: PostStructuredMetaItem[] = [];
  const metaRecord = categoryMeta as Record<string, unknown>;
  const depositPaymentItem = buildDepositPaymentMetaItem(metaRecord);

  Object.entries(metaRecord).forEach(([rawKey, rawValue]) => {
    const key = normalizeText(rawKey, 48);
    if (!key) return;
    if (isReservedStructuredMetaKey(key)) return;
    if (skipLocation && normalizeKey(key) === 'location') return;
    if (isDepositMetaKey(key) || isPaymentMetaKey(key)) return;
    const value = formatKeyedMetaValue(key, rawValue);
    if (!value) return;
    items.push({ key, label: getMetaLabel(key), value, rawValue, filterValues: { [key]: rawValue } });
  });

  if (depositPaymentItem) items.push(depositPaymentItem);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => getMetaOrder(a.item) - getMetaOrder(b.item) || a.index - b.index)
    .map(({ item }) => item)
    .slice(0, maxItems);
}
