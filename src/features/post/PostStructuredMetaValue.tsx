import {
  BadgeCheck,
  Bath,
  BedDouble,
  CheckCircle2,
  IdCard,
  MapPin,
  Tag,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import type { PostStructuredMetaItem } from '@/utils/postStructuredMeta';

function normalizeMetaRef(value: unknown) {
  return String(value || '').trim().replace(/[\s_-]+/g, '').toLowerCase();
}

function shouldRenderStructuredMetaIcon(item: PostStructuredMetaItem) {
  const key = normalizeMetaRef(item.key);
  const label = normalizeMetaRef(item.label);
  return ![
    'price',
    'rent',
    'salary',
    'salaryrange',
    'area',
    'depositpayment',
    'depositmonths',
    'paymentmonths',
    'position',
    'jobtype',
    'role',
    'type',
    'servicetype',
    'itemcategory',
  ].includes(key) &&
    ![
      '价格',
      '租金',
      '薪资',
      '工资',
      '面积',
      '押付',
      '押几',
      '付几',
      '押金月数',
      '月付',
      '岗位',
      '职位',
      '类型',
      '服务类型',
      '品类',
    ].includes(label);
}

function resolvePostStructuredMetaIcon(item: PostStructuredMetaItem): LucideIcon {
  const key = normalizeMetaRef(item.key);
  const label = normalizeMetaRef(item.label);
  const value = String(item.value || '').trim();

  if (key === 'location' || label === '地点') return MapPin;
  if (['position', 'jobtype', 'role'].includes(key) || ['岗位', '职位'].includes(label)) return IdCard;
  if (['type', 'servicetype', 'itemcategory'].includes(key) || ['类型', '服务类型', '品类'].includes(label)) return Tag;
  if (key === 'bedrooms' || label === '卧室') return BedDouble;
  if (key === 'bathrooms' || ['浴室', '卫生间'].includes(label)) return Bath;
  if (value === '是') return CheckCircle2;
  if (value === '否') return XCircle;
  return BadgeCheck;
}

export function PostStructuredMetaValue({ item }: { item: PostStructuredMetaItem }) {
  if (!shouldRenderStructuredMetaIcon(item)) {
    return <span>{item.value}</span>;
  }

  const Icon = resolvePostStructuredMetaIcon(item);

  return (
    <>
      <Icon className="post-tag-meta-icon" aria-hidden="true" />
      <span>{item.value}</span>
    </>
  );
}
