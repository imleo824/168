import { type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '@/styles/components/payment-action-sheet.css';

import ActionButton from '@/ui/ActionButton';
import { InlineSpinner } from '@/ui/LoadingState';
import { useFocusScrollStabilizer } from '@/hooks/useFocusScrollStabilizer';

export type PaymentActionSummaryRow = {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'total';
};

export function normalizePaymentAmountInput(value: string, decimals = 6) {
  const safeDecimals = Math.max(0, Math.min(8, Math.floor(decimals)));
  const normalized = value.replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  const decimalPart = decimalParts.join('').slice(0, safeDecimals);
  return decimalParts.length > 0 ? `${integerPart || '0'}.${decimalPart}` : integerPart;
}

export function formatPaymentInputAmount(value: unknown, decimals = 6) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return parsed
    .toFixed(Math.max(0, Math.min(8, Math.floor(decimals))))
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
}

export function PaymentActionSummary({ rows }: { rows: PaymentActionSummaryRow[] }) {
  return (
    <div className="payment-action-summary">
      {rows.map((row, index) => (
        <div key={index} className={row.tone === 'total' ? 'payment-action-summary-row payment-action-summary-row--total' : 'payment-action-summary-row'}>
          <span>{row.label}</span>
          <span className={row.tone === 'total' ? 'payment-action-summary-total' : 'payment-action-summary-value'}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PaymentActionFieldCard({ children }: { children: ReactNode }) {
  return <div className="payment-action-method-card">{children}</div>;
}

export function PaymentActionPasswordStack({ children }: { children: ReactNode }) {
  return <div className="payment-action-password-stack">{children}</div>;
}

export function PaymentActionInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ui-control payment-action-input ${className}`.trim()} />;
}

export function PaymentActionHelper({ tone = 'muted', children }: { tone?: 'muted' | 'error'; children: ReactNode }) {
  return <p className={`payment-action-helper payment-action-helper--${tone}`}>{children}</p>;
}

export function PaymentActionAmountInput({
  value,
  placeholder,
  disabled,
  maxAmount,
  maxLabel = '全部',
  decimals = 6,
  onChange,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  maxAmount: number;
  maxLabel?: string;
  decimals?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="payment-action-amount-field">
      <PaymentActionInput
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(normalizePaymentAmountInput(event.target.value, decimals))}
        disabled={disabled}
        className="payment-action-amount-input"
        placeholder={placeholder}
      />
      <button
        type="button"
        className="payment-action-inline-max-button"
        disabled={disabled || maxAmount <= 0}
        onClick={() => onChange(formatPaymentInputAmount(maxAmount, decimals))}
      >
        {maxLabel}
      </button>
    </div>
  );
}

export default function PaymentActionSheet({
  open,
  onClose,
  title,
  description,
  labelledBy,
  busy,
  busyLabel,
  canConfirm,
  confirmLabel,
  cancelLabel = '取消',
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  labelledBy: string;
  busy: boolean;
  busyLabel?: string;
  canConfirm: boolean;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const {
    rootRef: sheetRef,
    onFocusCapture: handleFocusCapture,
    onBlurCapture: handleBlurCapture,
  } = useFocusScrollStabilizer('payment-action-sheet--keyboard-active');
  const titleId = `${labelledBy}-title`;
  const descriptionId = `${labelledBy}-description`;

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="payment-action-overlay ui-layer-content-overlay">
      <button
        type="button"
        aria-label="关闭面板"
        onClick={onClose}
        className="ui-modal-scrim ui-modal-scrim-strong payment-action-scrim"
      />
      <div
        ref={sheetRef}
        data-contained-text-entry-surface="true"
        data-payment-action-scroll
        data-promote-sheet-scroll
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy}
        className="ui-sheet-panel payment-action-sheet"
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
      >
        <div className="payment-action-handle" aria-hidden="true" />
        <header className="payment-action-header">
          <h3 id={titleId} className="payment-action-title">{title}</h3>
          {description ? <p id={descriptionId} className="payment-action-description">{description}</p> : null}
        </header>

        {children}

        <div className="payment-action-actions">
          <ActionButton onClick={onClose} disabled={busy} variant="muted" className="payment-action-button">
            {cancelLabel}
          </ActionButton>
          <ActionButton onClick={onConfirm} disabled={!canConfirm} variant={canConfirm ? 'brand' : 'disabled'} className="payment-action-button">
            <span className="payment-action-button-status">
              {busy ? <InlineSpinner size="xs" className="payment-action-button-spinner" /> : <span />}
            </span>
            <span className="payment-action-button-label">{confirmLabel}</span>
            <span className="payment-action-button-spacer" />
          </ActionButton>
        </div>

        {busy && busyLabel ? (
          <div className="ui-busy-overlay">
            <div className="payment-action-busy-pill">
              <InlineSpinner size="xs" className="payment-action-busy-spinner" />
              <span>{busyLabel}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
