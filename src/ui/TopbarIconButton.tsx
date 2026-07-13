import { memo, type ReactNode, type MouseEvent } from 'react';
import { cn } from '@/utils/cn';
import { useInstantPress } from '@/hooks/useInstantPress';
import TopbarBackIcon from '@/ui/TopbarBackIcon';

type TopbarIconButtonTone = 'default' | 'strong' | 'brand';

interface TopbarIconButtonBaseProps {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  ariaLabel: string;
  title?: string;
  className?: string;
  tone?: TopbarIconButtonTone;
  disabled?: boolean;
}

type TopbarIconButtonProps =
  | (TopbarIconButtonBaseProps & {
      action?: 'default';
      icon: ReactNode;
    })
  | (TopbarIconButtonBaseProps & {
      action: 'back';
      icon?: ReactNode;
    });

function toneClassName(tone: TopbarIconButtonTone) {
  switch (tone) {
    case 'brand':
      return 'topbar-icon-button--brand ui-button-primary ui-text-inverse';
    case 'strong':
      return 'topbar-icon-button--strong ui-text-strong';
    default:
      return 'topbar-icon-button--default ui-text-secondary';
  }
}

function hasClassName(value: string, target: string) {
  return value.split(/\s+/).includes(target);
}

function TopbarIconButton({
  icon,
  onClick,
  ariaLabel,
  title,
  className = '',
  tone = 'default',
  action = 'default',
  disabled = false,
}: TopbarIconButtonProps) {
  const pressHandlers = useInstantPress<HTMLButtonElement>(onClick, disabled);
  const isBackButton = action === 'back' || hasClassName(className, 'ui-topbar-back-button');

  return (
    <button
      type="button"
      {...pressHandlers}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-topbar-action={isBackButton ? 'back' : undefined}
      data-icon-action-size="md"
      data-icon-action-context="topbar"
      data-icon-action-tone={tone === 'brand' ? 'brand' : tone === 'strong' ? 'muted' : 'quiet'}
      data-icon-action-shape="control"
      className={cn(
        'topbar-icon-button ui-icon-button pressable',
        isBackButton && 'ui-topbar-back-button',
        toneClassName(tone),
        className,
      )}
    >
      <span className="ui-icon-button-content">
        {isBackButton ? <TopbarBackIcon /> : icon}
      </span>
    </button>
  );
}

export default memo(TopbarIconButton);
