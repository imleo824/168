import { ChevronRight, Gift } from 'lucide-react';

const REFERRAL_BANNER_REBATE_RATE_TEXT = '50%';

type ReferralInviteBannerProps = {
  onClick: () => void;
};

export default function ReferralInviteBanner({ onClick }: ReferralInviteBannerProps) {
  const title = `邀请注册，返现${REFERRAL_BANNER_REBATE_RATE_TEXT}`;

  return (
    <button
      type="button"
      className="sponsor-referral-banner pressable"
      onClick={onClick}
      aria-label={title}
    >
      <span className="sponsor-referral-banner-icon" aria-hidden="true">
        <Gift />
      </span>
      <span className="sponsor-referral-banner-copy">
        <strong>{title}</strong>
        <span>好友每笔充值成功都可获得返佣</span>
      </span>
      <ChevronRight className="sponsor-referral-banner-chevron" aria-hidden="true" />
    </button>
  );
}
