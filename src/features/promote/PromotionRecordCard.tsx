import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';

import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import RecordIdRow from '@/features/records/RecordIdRow';
import PromotionEffectStatsRow from '@/features/promote/PromotionEffectStatsRow';
import { PromotionType } from '@/types';
import {
  bookingDateText,
  bookingStatusLabel,
  getPromotionEffectStats,
  getPromotionRecordPostId,
  getPromotionTotalPrice,
  isPromotionEditable,
  promotionDisplayTitle,
  promotionRecordId,
  type PromotionGroup,
} from '@/features/promote/promotionDisplayUtils';

export function getPromotionRecordStatusClass(group: PromotionGroup) {
  const status = bookingStatusLabel(group);
  if (status === '投放中') return 'record-status-pill--success';
  if (status === '未开始') return 'record-status-pill--pending';
  return 'record-status-pill--muted';
}

export default function PromotionRecordCard({
  group,
  onCopyRecordId,
  onEdit,
}: {
  key?: string;
  group: PromotionGroup;
  onCopyRecordId: (value: string) => void;
  onEdit?: (group: PromotionGroup) => void;
}) {
  const primary = group.primary;
  const isBannerAd = primary.type === PromotionType.AD_HOME || primary.type === PromotionType.PIN_CHAT;
  const relatedPostId = getPromotionRecordPostId(group);
  const totalPrice = getPromotionTotalPrice(group);
  const effectStats = getPromotionEffectStats(group);

  return (
    <SurfaceSectionCard as="article" compact className="record-card promote-history-card">
      <div className="record-card-row">
        <div className="record-card-main">
          <p className="record-title record-card-line record-card-line--title">{promotionDisplayTitle(primary)}</p>
          <RecordIdRow label="单号" value={promotionRecordId(group)} onCopy={onCopyRecordId} className="record-card-line" />
          <span className="record-time record-card-line">{bookingDateText(group)}</span>
          {relatedPostId ? (
            <Link
              to={`/post/${relatedPostId}`}
              className="record-id-row record-card-line promote-history-related-post-link pressable"
            >
              <span className="record-id-value">推广帖子</span>
            </Link>
          ) : null}
          <PromotionEffectStatsRow stats={effectStats} className="record-effect-stats" />
          {isBannerAd && onEdit && isPromotionEditable(group) ? (
            <button
              type="button"
              onClick={() => onEdit(group)}
              className="record-card-line promote-history-edit-action pressable"
            >
              <Pencil className="promote-history-edit-icon" />
              编辑图片和链接
            </button>
          ) : null}
        </div>
        <div className="record-card-aside">
          <span className={`record-status-pill ${getPromotionRecordStatusClass(group)}`}>
            {bookingStatusLabel(group)}
          </span>
          <span className="record-amount record-amount--neutral">
            {totalPrice > 0 ? `-${totalPrice}` : group.bookings.length}
          </span>
          <span className="record-amount-unit">{totalPrice > 0 ? '积分' : '天'}</span>
        </div>
      </div>
    </SurfaceSectionCard>
  );
}
