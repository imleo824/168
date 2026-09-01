import { type ReactNode } from 'react';
import ActionButton from '@/ui/ActionButton';
import { InlineSpinner } from '@/ui/LoadingState';
import { STEP_TITLE_CLASS } from './promoteBookingUtils';

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
  onWarmPaymentSheet,
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
  onWarmPaymentSheet?: () => void;
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
          onPointerEnter={onWarmPaymentSheet}
          onFocus={onWarmPaymentSheet}
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
