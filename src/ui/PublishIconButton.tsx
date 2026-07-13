import { Plus } from 'lucide-react';
import { memo, type MouseEvent } from 'react';
import { cn } from '@/utils/cn';
import { useInstantPress } from '@/hooks/useInstantPress';
import { POST_CREATE_FOCUS_TRIGGER_ATTR } from '@/utils/postCreateFocusBridge';

interface PublishIconButtonProps {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  className?: string;
  iconClassName?: string;
  variant?: 'top' | 'topbar' | 'ghost';
  ariaLabel?: string;
  disabled?: boolean;
}

const POST_CREATE_FOCUS_TRIGGER_PROPS = {
  [POST_CREATE_FOCUS_TRIGGER_ATTR]: 'true',
};

function publishIconButtonClass(variant: PublishIconButtonProps['variant']) {
  switch (variant) {
    case 'ghost':
      return 'pressable ui-icon-button ui-button-ghost publish-icon-button publish-icon-button--ghost';
    case 'topbar':
    case 'top':
    default:
      return 'pressable ui-icon-button ui-button-primary topbar-icon-button topbar-icon-button--brand ui-topbar-publish-btn publish-icon-button publish-icon-button--topbar';
  }
}

function publishIconButtonSize(variant: PublishIconButtonProps['variant']) {
  if (variant === 'ghost') return 'lg';
  return 'md';
}

function publishIconClassName(
  variant: PublishIconButtonProps['variant'],
  iconClassName?: string,
) {
  if (variant === 'ghost') {
    return cn('ui-text-secondary', iconClassName);
  }

  return cn('ui-text-inverse', iconClassName);
}

function PublishIconButton({
  onClick,
  title,
  className,
  iconClassName,
  variant = 'topbar',
  ariaLabel = '发布内容',
  disabled,
}: PublishIconButtonProps) {
  const pressHandlers = useInstantPress<HTMLButtonElement>(onClick, Boolean(disabled));

  return (
    <button
      type="button"
      {...POST_CREATE_FOCUS_TRIGGER_PROPS}
      {...pressHandlers}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-icon-action-size={publishIconButtonSize(variant)}
      data-icon-action-context={variant === 'ghost' ? 'feed' : 'topbar'}
      data-icon-action-tone={variant === 'ghost' ? 'muted' : 'brand'}
      data-icon-action-shape="control"
      className={cn(publishIconButtonClass(variant), className)}
    >
      <span className="ui-icon-action-frame">
        <Plus
          className={cn('ui-icon-action-glyph', publishIconClassName(variant, iconClassName))}
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

export default memo(PublishIconButton);
