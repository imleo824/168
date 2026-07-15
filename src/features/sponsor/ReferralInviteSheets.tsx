import { CheckCircle2, ShieldCheck, X } from 'lucide-react';

import PaymentActionSheet, {
  PaymentActionAmountInput,
  PaymentActionFieldCard,
  PaymentActionHelper,
  PaymentActionInput,
  PaymentActionPasswordStack,
  PaymentActionSummary,
} from '@/ui/PaymentActionSheet';
import TopbarIconButton from '@/ui/TopbarIconButton';
import type { ReferralSummary } from '@/services/referral';

import { formatMoney, formatRate } from './referralInviteFormatters';

export function ReferralRulesSheet({ summary, onClose }: { summary: ReferralSummary; onClose: () => void }) {
  const rateText = formatRate(summary.settings.commissionRate);
  return (
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
          <TopbarIconButton icon={<X aria-hidden="true" />} onClick={onClose} ariaLabel="关闭规则" title="关闭规则" className="referral-rules-close" />
        </div>
        <ul className="referral-rules-list">
          <li><ShieldCheck aria-hidden="true" /><span>通过你的邀请注册后，好友会与你永久绑定。</span></li>
          <li><CheckCircle2 aria-hidden="true" /><span>好友后续每笔充值成功，都会{rateText ? `按当前 ${rateText} 比例` : ''}生成返佣。</span></li>
        </ul>
      </section>
    </div>
  );
}

type ReferralConvertSheetProps = {
  open: boolean;
  summary: ReferralSummary;
  amount: string;
  error: string;
  isBusy: boolean;
  canSubmit: boolean;
  previewPoints: number;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ReferralConvertSheet({
  open,
  summary,
  amount,
  error,
  isBusy,
  canSubmit,
  previewPoints,
  onAmountChange,
  onClose,
  onConfirm,
}: ReferralConvertSheetProps) {
  return (
    <PaymentActionSheet
      open={open}
      title="换积分"
      description="输入要转换的返佣金额，确认后会生成一条换积分记录。"
      busy={isBusy}
      busyLabel="转换中"
      labelledBy="referral-convert"
      canConfirm={canSubmit}
      confirmLabel={isBusy ? '转换中' : '确认转换'}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <PaymentActionSummary
        rows={[
          { label: '可转换', value: `${formatMoney(summary.availableCommission)} USDT` },
          { label: '兑换比例', value: `1 USDT = ${summary.settings.pointsPerUsdt} 积分` },
          { label: '预计到账', value: `${previewPoints.toLocaleString()} 积分`, tone: 'total' },
        ]}
      />
      <PaymentActionFieldCard>
        <PaymentActionAmountInput
          value={amount}
          placeholder="输入转换金额"
          disabled={isBusy}
          maxAmount={summary.availableCommission}
          onChange={onAmountChange}
        />
      </PaymentActionFieldCard>
      {error ? <p role="alert" className="payment-action-error">{error}</p> : null}
    </PaymentActionSheet>
  );
}

type ReferralWithdrawSheetProps = {
  open: boolean;
  summary: ReferralSummary;
  amount: string;
  address: string;
  paymentPassword: string;
  newPaymentPassword: string;
  confirmPaymentPassword: string;
  paymentError: string;
  isBusy: boolean;
  isSavingPaymentPassword: boolean;
  needsPaymentPasswordSetup: boolean;
  canSubmit: boolean;
  onAmountChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onPaymentPasswordChange: (value: string) => void;
  onNewPaymentPasswordChange: (value: string) => void;
  onConfirmPaymentPasswordChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ReferralWithdrawSheet({
  open,
  summary,
  amount,
  address,
  paymentPassword,
  newPaymentPassword,
  confirmPaymentPassword,
  paymentError,
  isBusy,
  isSavingPaymentPassword,
  needsPaymentPasswordSetup,
  canSubmit,
  onAmountChange,
  onAddressChange,
  onPaymentPasswordChange,
  onNewPaymentPasswordChange,
  onConfirmPaymentPasswordChange,
  onClose,
  onConfirm,
}: ReferralWithdrawSheetProps) {
  const title = needsPaymentPasswordSetup ? '设置支付密码' : '申请提现';
  const description = needsPaymentPasswordSetup ? '先设置支付密码，设置后再确认本次提现。' : '输入提现金额、地址和支付密码后提交审核。';
  const confirmLabel = needsPaymentPasswordSetup ? (isSavingPaymentPassword ? '设置中' : '设置并继续') : isBusy ? '提交中' : '确认提现';
  return (
    <PaymentActionSheet
      open={open}
      title={title}
      description={description}
      busy={isBusy}
      busyLabel={needsPaymentPasswordSetup ? '设置中' : '提交中'}
      labelledBy="referral-withdraw"
      canConfirm={canSubmit}
      confirmLabel={confirmLabel}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <PaymentActionSummary
        rows={[
          { label: '可提现', value: `${formatMoney(summary.availableCommission)} USDT` },
          { label: '提现网络', value: 'USDT-TRC20' },
          { label: '最低提现', value: `${formatMoney(summary.settings.minWithdrawAmount)}U`, tone: 'total' },
        ]}
      />
      <PaymentActionFieldCard>
        <PaymentActionAmountInput
          value={amount}
          placeholder="输入提现金额"
          disabled={isBusy}
          maxAmount={summary.availableCommission}
          onChange={onAmountChange}
        />
        <PaymentActionInput
          type="text"
          autoComplete="off"
          value={address}
          onChange={(event) => onAddressChange(event.target.value.trim())}
          disabled={isBusy}
          placeholder="USDT-TRC20 提现地址"
        />
        {needsPaymentPasswordSetup ? (
          <PaymentActionPasswordStack>
            <PaymentActionInput
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={128}
              value={newPaymentPassword}
              onChange={(event) => onNewPaymentPasswordChange(event.target.value.replace(/\s/g, ''))}
              disabled={isBusy}
              placeholder="设置支付密码，至少 6 位"
            />
            <PaymentActionInput
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={128}
              value={confirmPaymentPassword}
              onChange={(event) => onConfirmPaymentPasswordChange(event.target.value.replace(/\s/g, ''))}
              disabled={isBusy}
              placeholder="再次输入支付密码"
            />
            {confirmPaymentPassword && newPaymentPassword !== confirmPaymentPassword ? (
              <PaymentActionHelper tone="error">两次输入不一致</PaymentActionHelper>
            ) : (
              <PaymentActionHelper>设置完成后，再确认本次提现。</PaymentActionHelper>
            )}
          </PaymentActionPasswordStack>
        ) : (
          <PaymentActionInput
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={128}
            value={paymentPassword}
            onChange={(event) => onPaymentPasswordChange(event.target.value.replace(/\s/g, ''))}
            disabled={isBusy}
            placeholder="请输入支付密码"
          />
        )}
      </PaymentActionFieldCard>
      {paymentError ? <p role="alert" className="payment-action-error">{paymentError}</p> : null}
    </PaymentActionSheet>
  );
}
