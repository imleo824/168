import { Fragment, type ReactNode } from 'react';
import ActionButton from '@/ui/ActionButton';
import BottomSheet from '@/ui/BottomSheet';
import { Skeleton } from '@/ui/Skeleton';
import { InlineSpinner } from '@/ui/LoadingState';
import PaymentActionSheet, {
  PaymentActionFieldCard,
  PaymentActionHelper,
  PaymentActionInput,
  PaymentActionPasswordStack,
  PaymentActionSummary,
} from '@/ui/PaymentActionSheet';
import {
  STEP_TITLE_CLASS,
  promotionTypeLabel,
  type PromotionTypeId,
} from './promoteBookingUtils';

export function StepHeader({
  step,
  title,
  hint,
  action,
}: {
  step?: number;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="promote-step-header">
      <div className="promote-step-heading">
        {step ? (
          <span className="promote-step-index" aria-hidden="true">
            {step}
          </span>
        ) : null}

        <div className="promote-step-copy">
          <h2 className={STEP_TITLE_CLASS}>{title}</h2>
          {hint ? (
            <span className="promote-step-hint">
              {hint}
            </span>
          ) : null}
        </div>
      </div>

      {action ? (
        <div className="promote-step-action">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function PromoteCheckoutBar({
  hidden,
  totalPrice,
  isInsufficientPoints,
  balanceHint,
  checkoutContextLabel,
  onBookClick,
  disabled,
  bookingButtonLabel,
  isBooking,
  isConfirmingAvailability,
}: {
  hidden: boolean;
  totalPrice: number;
  isInsufficientPoints: boolean;
  balanceHint: string;
  checkoutContextLabel: string;
  onBookClick: () => void;
  disabled: boolean;
  bookingButtonLabel: string;
  isBooking: boolean;
  isConfirmingAvailability: boolean;
}) {
  if (hidden) return null;

  const displayTotalPrice = Number.isFinite(totalPrice) ? totalPrice : 0;

  return (
    <div className="promote-checkout-bar ui-checkout-bar">
      <div className="promote-checkout-shell">
        <div className="promote-checkout-summary">
          <div className="promote-checkout-summary-price">
            <span className="promote-checkout-price-value">{displayTotalPrice}</span>
            <span className="promote-checkout-price-unit">积分</span>
          </div>

          <span className={`promote-checkout-balance ${isInsufficientPoints ? 'promote-checkout-balance--danger' : 'promote-checkout-balance--idle'}`}>
            {balanceHint}
          </span>

          <span className="promote-checkout-context">
            {checkoutContextLabel}
          </span>
        </div>

        <ActionButton
          onClick={onBookClick}
          disabled={disabled}
          aria-label={bookingButtonLabel}
          variant={disabled ? 'disabled' : 'brand'}
          className="promote-booking-action"
        >
          <span className="promote-booking-action-status">
            {isBooking || isConfirmingAvailability ? (
              <InlineSpinner size="xs" className="promote-booking-action-spinner" />
            ) : (
              <span />
            )}
          </span>
          <span className="promote-action-label">
            {bookingButtonLabel}
          </span>
        </ActionButton>
      </div>
    </div>
  );
}

export function PromotePostPickerSheet({
  open,
  onClose,
  isLoadingPromotablePosts,
  orderedPromotablePosts,
  renderPromotablePostCard,
  onCreatePost,
}: {
  open: boolean;
  onClose: () => void;
  isLoadingPromotablePosts: boolean;
  orderedPromotablePosts: any[];
  renderPromotablePostCard: (post: any, options?: { closeOnSelect?: boolean }) => ReactNode;
  onCreatePost: () => void;
}) {
  if (!open) return null;

  return (
    <BottomSheet
      open={open}
      title="选择要曝光的推"
      ariaLabel="选择要曝光的推"
      onClose={onClose}
      panelClassName="ui-sheet-panel promote-picker-sheet"
      bodyClassName="promote-picker-body"
    >
        <div
          data-promote-sheet-scroll
          className="promote-picker-scroll"
        >
          {isLoadingPromotablePosts ? (
            <div className="promote-picker-list">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="promote-picker-skeleton-card">
                  <Skeleton className="promote-picker-skeleton-media" />
                  <Skeleton className="promote-picker-skeleton-title" />
                </div>
              ))}
            </div>
          ) : orderedPromotablePosts.length > 0 ? (
            <div className="promote-picker-list">
              {orderedPromotablePosts.map((post: any) => (
                <Fragment key={post.id}>
                  {renderPromotablePostCard(post, { closeOnSelect: true })}
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="promote-picker-empty">
              <div className="promote-picker-empty-copy-group">
                <p className="promote-picker-empty-title">暂无可曝光的推</p>
                <p className="promote-picker-empty-copy">发一条推后，就可以回来买曝光。</p>
              </div>
              <ActionButton
                type="button"
                variant="brand"
                size="sm"
                onClick={onCreatePost}
                className="promote-picker-empty-action"
                aria-label="去发推"
              >
                去发推
              </ActionButton>
            </div>
          )}
        </div>
    </BottomSheet>
  );
}

export function PromotePaymentSheet({
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
