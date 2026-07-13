import { memo, type ButtonHTMLAttributes, type MouseEventHandler, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/utils/cn';
import { useInstantPress } from '@/hooks/useInstantPress';
import type { ActionState } from '@/ui/uiTypes';

type ActionButtonVariant = 'primary' | 'brand' | 'muted' | 'success' | 'disabled';
type ActionButtonSize = 'md' | 'sm' | 'header';

type ActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'disabled' | 'onClick'> & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  state?: ActionState;
  instantPress?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

interface ActionLinkProps extends LinkProps {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  className?: string;
}

function actionClassName(
  className = '',
) {
  return cn(
    'pressable ui-button',
    className,
  );
}

function ActionButton({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  disabled,
  state,
  instantPress = true,
  onClick,
  ...buttonProps
}: ActionButtonProps) {
  const actionState: ActionState = disabled ? 'disabled' : state || 'idle';
  const isDomDisabled = disabled || actionState === 'disabled';
  const shouldUseInstantPress = instantPress && type === 'button' && Boolean(onClick);
  const instantPressHandlers = useInstantPress<HTMLButtonElement>(
    onClick,
    isDomDisabled || !shouldUseInstantPress,
  );
  const clickHandlers = shouldUseInstantPress ? instantPressHandlers : { onClick };

  return (
    <button
      type={type}
      className={actionClassName(className)}
      data-action-variant={variant}
      data-action-size={size}
      data-action-state={actionState}
      disabled={isDomDisabled}
      {...buttonProps}
      {...clickHandlers}
    >
      {children}
    </button>
  );
}

export const ActionLink = memo(function ActionLink({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...linkProps
}: ActionLinkProps) {
  return (
    <Link
      className={actionClassName(className)}
      data-action-variant={variant}
      data-action-size={size}
      data-action-state="idle"
      {...linkProps}
    >
      {children}
    </Link>
  );
});

export default memo(ActionButton);
