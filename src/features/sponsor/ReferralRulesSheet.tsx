import { createPortal } from 'react-dom';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';

import TopbarIconButton from '@/ui/TopbarIconButton';
import type { ReferralSummary } from '@/services/referral';

import { formatRate } from './referralInviteFormatters';

export default function ReferralRulesSheet({
  summary,
  onClose,
}: {
  summary: ReferralSummary;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;

  const rateText = formatRate(summary.settings.commissionRate);

  return createPortal(
    <div className="referral-rules-overlay" role="presentation" onClick={onClose}>
      <section
        className="referral-rules-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-rules-title"
        data-referral-rules-scroll
        onClick={(event) => event.stopPropagation()}
      >
        <div className="referral-rules-handle" aria-hidden="true" />
        <div className="referral-rules-header">
          <h2 id="referral-rules-title">邀请规则</h2>
          <TopbarIconButton
            icon={<X aria-hidden="true" />}
            onClick={onClose}
            ariaLabel="关闭规则"
            title="关闭规则"
            className="referral-rules-close"
          />
        </div>
        <ul className="referral-rules-list">
          <li>
            <ShieldCheck aria-hidden="true" />
            <span>通过你的邀请注册后，好友会与你永久绑定。</span>
          </li>
          <li>
            <CheckCircle2 aria-hidden="true" />
            <span>好友后续每笔充值成功，都会{rateText ? `按当前 ${rateText} 比例` : ''}生成返佣。</span>
          </li>
        </ul>
      </section>
    </div>,
    document.body,
  );
}
