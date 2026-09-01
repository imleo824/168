import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import RecordIdRow from '@/features/records/RecordIdRow';
import {
  getRechargeOrderStatusClass,
  getRechargeOrderStatusLabel,
} from '@/features/records/recordDisplay';
import {
  formatLedgerRecordDateTime,
  getLedgerRecordAmount,
  getLedgerRecordId,
  getLedgerRecordTime,
  getLedgerRecordTitle,
  isPromotionTransaction,
  type UnifiedLedgerRecord,
} from '@/features/records/ledgerDisplay';

function formatRechargeOrderTime(record: UnifiedLedgerRecord) {
  if (record.kind !== 'recharge') return '';
  const { order } = record;
  return formatLedgerRecordDateTime(order.creditedAt || order.confirmedAt || order.createdAt);
}

export default function LedgerRecordCard({
  record,
  pointsPerUsdt,
  onCopyRecordId,
}: {
  key?: string;
  record: UnifiedLedgerRecord;
  pointsPerUsdt: number;
  onCopyRecordId: (value: string) => void;
}) {
  if (record.kind === 'recharge') {
    const { order } = record;
    return (
      <SurfaceSectionCard as="article" compact className="record-card pressable">
        <div className="record-card-row">
          <div className="record-card-main">
            <p className="record-title record-card-line record-card-line--title">{getLedgerRecordTitle(record)}</p>
            <RecordIdRow label="单号" value={order.id} onCopy={onCopyRecordId} className="record-card-line" />
            {order.txHash ? <RecordIdRow label="链上哈希" value={order.txHash} onCopy={onCopyRecordId} className="record-card-line" /> : null}
            <span className="record-time record-card-line">{formatRechargeOrderTime(record)}</span>
          </div>
          <div className="record-card-aside">
            <span className={`record-status-pill ${getRechargeOrderStatusClass(order.status)}`}>
              {getRechargeOrderStatusLabel(order.status)}
            </span>
            <span className="record-point-gain">+{getLedgerRecordAmount(record, pointsPerUsdt)}积分</span>
          </div>
        </div>
      </SurfaceSectionCard>
    );
  }

  const { tx } = record;
  const isPositive = tx.amount > 0;
  const isPromotion = isPromotionTransaction(tx);
  const summary = getLedgerRecordTitle(record);

  return (
    <SurfaceSectionCard as="article" compact className="record-card pressable">
      <div className="record-card-row">
        <div className="record-card-main">
          <p className="record-title record-card-line record-card-line--title">{isPromotion ? summary : tx.description}</p>
          <RecordIdRow label="单号" value={getLedgerRecordId(record)} onCopy={onCopyRecordId} className="record-card-line" />
          <span className="record-time record-card-line">{getLedgerRecordTime(record)}</span>
        </div>
        <div className="record-card-aside">
          <span className={`record-amount ${isPositive ? 'record-amount--positive' : 'record-amount--neutral'}`}>
            {isPositive ? `+${getLedgerRecordAmount(record, pointsPerUsdt)}` : getLedgerRecordAmount(record, pointsPerUsdt)}
          </span>
          <span className="record-amount-unit">积分</span>
        </div>
      </div>
    </SurfaceSectionCard>
  );
}
