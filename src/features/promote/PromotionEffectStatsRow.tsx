import type { PromotionEffectStats } from '@/types';
import {
  PROMOTION_EFFECT_METRICS,
  normalizePromotionEffectStats,
} from './promotionDisplayUtils';

function formatEffectCount(value: number) {
  return Number(value || 0).toLocaleString('zh-CN');
}

export default function PromotionEffectStatsRow({
  stats,
  className = '',
}: {
  stats?: Partial<PromotionEffectStats> | null;
  className?: string;
}) {
  const normalizedStats = normalizePromotionEffectStats(stats);
  const rootClassName = ['promotion-effect-stats', className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} aria-label="推广效果数据">
      {PROMOTION_EFFECT_METRICS.map((metric) => (
        <span key={metric.key} className="promotion-effect-stat">
          <span className="promotion-effect-stat-label">{metric.label}</span>
          <span className="promotion-effect-stat-value">{formatEffectCount(normalizedStats[metric.key])}</span>
        </span>
      ))}
    </div>
  );
}
