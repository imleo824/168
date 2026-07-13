import { memo, type ComponentProps, type MouseEventHandler, type ReactNode } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import ActionButton from './ActionButton';
import UIStateBlock, { type UIStateTone } from './UIStateBlock';
import UIText from './UIText';
import { cn } from '@/utils/cn';

type InlineSpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

type InlineSpinnerProps = {
  size?: InlineSpinnerSize | number;
  className?: string;
};

type LoadingBlockProps = {
  text?: string;
  compact?: boolean;
  className?: string;
  iconSize?: number;
};

type PageLoadingStateProps = {
  text?: string;
  className?: string;
};

type StateBlockProps = {
  title: string;
  titleAs?: ComponentProps<typeof UIStateBlock>['titleAs'];
  description?: string;
  icon?: ReactNode;
  tone?: UIStateTone;
  compact?: boolean;
  inline?: boolean;
  className?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  actionLabel?: string;
  onAction?: MouseEventHandler<HTMLButtonElement>;
  actionVariant?: ComponentProps<typeof ActionButton>['variant'];
  actionSize?: ComponentProps<typeof ActionButton>['size'];
  secondaryActionLabel?: string;
  onSecondaryAction?: MouseEventHandler<HTMLButtonElement>;
  secondaryActionVariant?: ComponentProps<typeof ActionButton>['variant'];
  role?: ComponentProps<typeof UIStateBlock>['role'];
  ariaLive?: ComponentProps<typeof UIStateBlock>['ariaLive'];
};

type RefreshHintProps = {
  text?: string;
  error?: boolean;
  className?: string;
  onRetry?: MouseEventHandler<HTMLButtonElement>;
  retryLabel?: string;
};

const INLINE_SPINNER_DEFAULT_SIZE: InlineSpinnerSize = 'md';
const INLINE_SPINNER_LEGACY_SIZE_BY_VALUE = new Map<number, InlineSpinnerSize>([
  [12, 'xs'],
  [13, 'xs'],
  [14, 'xs'],
  [15, 'sm'],
  [16, 'sm'],
  [18, 'md'],
  [20, 'lg'],
  [22, 'lg'],
]);

function resolveInlineSpinnerSize(size: InlineSpinnerProps['size']): InlineSpinnerSize {
  if (!size) return INLINE_SPINNER_DEFAULT_SIZE;
  if (typeof size === 'string') return size;
  return INLINE_SPINNER_LEGACY_SIZE_BY_VALUE.get(size) ?? INLINE_SPINNER_DEFAULT_SIZE;
}

export const InlineSpinner = memo(function InlineSpinner({
  size = INLINE_SPINNER_DEFAULT_SIZE,
  className = '',
}: InlineSpinnerProps) {
  const resolvedSize = resolveInlineSpinnerSize(size);

  return (
    <Loader2
      className={['ui-loading-spinner ui-text-secondary', className].filter(Boolean).join(' ')}
      data-spinner-size={resolvedSize}
      aria-hidden="true"
    />
  );
});

export const LoadingBlock = memo(function LoadingBlock({
  text = '正在加载',
  compact = false,
  className = '',
  iconSize,
}: LoadingBlockProps) {
  return (
    <div
      className={cn(
        'ui-loading-block',
        compact && 'ui-loading-block--compact',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={text}
      aria-busy="true"
    >
      <InlineSpinner size={iconSize ?? (compact ? 'md' : 'lg')} />
      <UIText as="p" variant="caption" tone="muted" className="ui-loading-text">
        {text}
      </UIText>
    </div>
  );
});

export const PageLoadingState = memo(function PageLoadingState({
  text = '正在加载',
  className = '',
}: PageLoadingStateProps) {
  return (
    <LoadingBlock
      text={text}
      className={cn('ui-page-loading-state', className)}
    />
  );
});

export const StateBlock = memo(function StateBlock({
  title,
  titleAs,
  description,
  icon,
  tone = 'neutral',
  compact = false,
  inline = false,
  className = '',
  action,
  secondaryAction,
  actionLabel,
  onAction,
  actionVariant = 'brand',
  actionSize = 'sm',
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionVariant = 'muted',
  role,
  ariaLive,
}: StateBlockProps) {
  const resolvedAction = action ?? (
    actionLabel && onAction ? (
      <ActionButton
        type="button"
        variant={actionVariant}
        size={actionSize}
        onClick={onAction}
      >
        {actionLabel}
      </ActionButton>
    ) : null
  );

  const resolvedSecondaryAction = secondaryAction ?? (
    secondaryActionLabel && onSecondaryAction ? (
      <ActionButton
        type="button"
        variant={secondaryActionVariant}
        size={actionSize}
        onClick={onSecondaryAction}
      >
        {secondaryActionLabel}
      </ActionButton>
    ) : null
  );

  return (
    <UIStateBlock
      title={title}
      titleAs={titleAs}
      description={description}
      icon={icon}
      tone={tone}
      compact={compact}
      inline={inline}
      className={className}
      action={resolvedAction}
      secondaryAction={resolvedSecondaryAction}
      role={role}
      ariaLive={ariaLive}
    />
  );
});

export const RefreshHint = memo(function RefreshHint({
  text = '正在更新',
  error = false,
  className = '',
  onRetry,
  retryLabel = '再试一次',
}: RefreshHintProps) {
  return (
    <div
      className={cn(
        'ui-refresh-hint',
        error && 'ui-refresh-hint--error',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy={!error}
    >
      {error ? (
        <RefreshCcw className="ui-refresh-hint-icon" aria-hidden="true" />
      ) : (
        <InlineSpinner size="xs" className="ui-refresh-hint-icon" />
      )}
      <span className="ui-refresh-hint-text">{text}</span>
      {error && onRetry ? (
        <button type="button" className="ui-refresh-hint-action pressable" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
});
