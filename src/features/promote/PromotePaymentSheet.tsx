import PaymentActionSheet, {
  PaymentActionFieldCard,
  PaymentActionHelper,
  PaymentActionInput,
  PaymentActionPasswordStack,
  PaymentActionSummary,
} from '@/ui/PaymentActionSheet';

import {
  promotionTypeLabel,
  type PromotionTypeId,
} from './promoteBookingUtils';

export default function PromotePaymentSheet({
  open,
  onClose,
  isPaymentBusy,
  paymentPanelTitle,
  paymentPanelDescription,
  selectedType,
  bookingDays,
  totalPrice,
  needsPaymentPasswordSetup,
  newPaymentPassword,
  confirmPaymentPassword,
  normalizedNewPaymentPassword,
  normalizedConfirmPaymentPassword,
  paymentPassword,
  paymentError,
  canSubmitBooking,
  confirmPaymentButtonLabel,
  paymentBusyLabel,
  onNewPaymentPasswordChange,
  onConfirmPaymentPasswordChange,
  onPaymentPasswordChange,
  onConfirmBooking,
}: {
  open: boolean;
  onClose: () => void;
  isPaymentBusy: boolean;
  paymentPanelTitle: string;
  paymentPanelDescription: string;
  selectedType: PromotionTypeId;
  bookingDays: number;
  totalPrice: number;
  needsPaymentPasswordSetup: boolean;
  newPaymentPassword: string;
  confirmPaymentPassword: string;
  normalizedNewPaymentPassword: string;
  normalizedConfirmPaymentPassword: string;
  paymentPassword: string;
  paymentPasswordSetupDone: boolean;
  paymentError: string;
  canSubmitBooking: boolean;
  confirmPaymentButtonLabel: string;
  paymentBusyLabel: string;
  onNewPaymentPasswordChange: (value: string) => void;
  onConfirmPaymentPasswordChange: (value: string) => void;
  onPaymentPasswordChange: (value: string) => void;
  onConfirmBooking: () => void;
}) {
  const displayTotalPrice = Number.isFinite(totalPrice) ? totalPrice : 0;

  return (
    <PaymentActionSheet
      open={open}
      onClose={onClose}
      title={paymentPanelTitle}
      description={paymentPanelDescription}
      labelledBy="promote-payment-sheet"
      busy={isPaymentBusy}
      busyLabel={paymentBusyLabel}
      canConfirm={canSubmitBooking}
      confirmLabel={confirmPaymentButtonLabel}
      onConfirm={onConfirmBooking}
    >
      <PaymentActionSummary
        rows={[
          { label: '曝光位置', value: promotionTypeLabel(selectedType) },
          { label: '展示周期', value: `${bookingDays} 天` },
          { label: '支付积分', value: `${displayTotalPrice} 积分`, tone: 'total' },
        ]}
      />

      <PaymentActionFieldCard>
        {needsPaymentPasswordSetup ? (
          <PaymentActionPasswordStack>
            <PaymentActionInput
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={128}
              value={newPaymentPassword}
              onChange={(event) => onNewPaymentPasswordChange(event.target.value.replace(/\s/g, ''))}
              disabled={isPaymentBusy}
              placeholder="设置支付密码，至少 6 位"
            />
            <PaymentActionInput
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={128}
              value={confirmPaymentPassword}
              onChange={(event) => onConfirmPaymentPasswordChange(event.target.value.replace(/\s/g, ''))}
              disabled={isPaymentBusy}
              placeholder="再次输入支付密码"
            />
            {normalizedConfirmPaymentPassword && normalizedNewPaymentPassword !== normalizedConfirmPaymentPassword ? (
              <PaymentActionHelper tone="error">两次输入不一致</PaymentActionHelper>
            ) : (
              <PaymentActionHelper>设置完成后，再确认支付。</PaymentActionHelper>
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
            disabled={isPaymentBusy}
            placeholder="请输入支付密码"
          />
        )}
      </PaymentActionFieldCard>

      {paymentError ? <p role="alert" className="payment-action-error">{paymentError}</p> : null}
    </PaymentActionSheet>
  );
}
