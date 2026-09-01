import type { MouseEventHandler } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/utils/cn';

type TelegramContactButtonVariant = 'icon' | 'compactText';

type TelegramContactIconButtonProps = {
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  variant?: TelegramContactButtonVariant;
};

function normalizeCompactTextClassName(className?: string) {
  const rawClassName = className || '';
  const isDetailTopbarContact = /\bdetail-topbar-contact-button\b/.test(rawClassName);
  const isFeedCardContact = /\bfeed-action-btn--telegram-contact\b/.test(rawClassName);

  if (isDetailTopbarContact) {
    return cn(
      'pressable ui-compact-action feed-follow-button--compact feed-follow-button',
      rawClassName.replace(/\bdetail-topbar-contact-button\b/g, 'detail-topbar-follow-button').trim(),
    );
  }

  if (isFeedCardContact) {
    return cn(
      'telegram-contact-action pressable ui-compact-action feed-follow-button--compact feed-follow-button feed-card-inline-follow feed-card-inline-contact feed-action-btn--telegram-contact',
    );
  }

  return cn(
    'pressable ui-compact-action feed-follow-button--compact feed-follow-button',
    rawClassName.trim(),
  );
}

export default function TelegramContactIconButton({
  onClick,
  className,
  title,
  ariaLabel = 'Telegram 联系',
  disabled = false,
  variant = 'icon',
}: TelegramContactIconButtonProps) {
  const shouldUseCompactText =
    variant === 'compactText' ||
    /\bdetail-topbar-contact-button\b/.test(className || '') ||
    /\bfeed-action-btn--telegram-contact\b/.test(className || '');

  if (shouldUseCompactText) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title || ariaLabel}
        data-contact-action="telegram"
        data-follow-state="idle"
        data-follow-pending={disabled ? 'true' : 'false'}
        className={normalizeCompactTextClassName(className)}
      >
        <span className="feed-follow-button-inner">
          <span className="feed-follow-button-text">联系</span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      data-contact-action="telegram"
      data-icon-action-size="sm"
      data-icon-action-context="feed"
      data-icon-action-tone="muted"
      data-icon-action-shape="circle"
      className={cn('telegram-contact-action pressable', className)}
    >
      <Send className="telegram-contact-action-icon ui-icon-action-glyph" aria-hidden="true" />
    </button>
  );
}
