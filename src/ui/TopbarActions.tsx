import { memo, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface TopbarActionGroupProps {
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

interface TopbarCountBadgeProps {
  children?: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

interface TopbarOnlineBadgeProps {
  countText?: string | null;
  className?: string;
}

export const TopbarActionGroup = memo(function TopbarActionGroup({
  children,
  className,
  'aria-label': ariaLabel,
}: TopbarActionGroupProps) {
  return (
    <div className={cn('ui-topbar-action-group', className)} aria-label={ariaLabel}>
      {children}
    </div>
  );
});

export const TopbarCountBadge = memo(function TopbarCountBadge({
  children,
  className,
  title,
  ariaLabel,
}: TopbarCountBadgeProps) {
  return (
    <span
      className={cn('ui-topbar-count-badge ui-count-badge', className)}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  );
});

export const TopbarOnlineBadge = memo(function TopbarOnlineBadge({
  countText,
  className,
}: TopbarOnlineBadgeProps) {
  const text = String(countText || '').trim();
  if (!text) return null;

  return (
    <span
      className={cn('ui-topbar-online-badge ui-topbar-count-badge ui-count-badge', className)}
      aria-label={`当前在线 ${text}`}
      title={`当前在线 ${text}`}
    >
      <span className="ui-topbar-online-dot" aria-hidden="true" />
      <span className="ui-topbar-online-count">{text}</span>
    </span>
  );
});
