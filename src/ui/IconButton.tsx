import { memo, type MouseEventHandler, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

type IconButtonVariant = 'quiet' | 'action';
type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg';
type IconButtonTone = 'quiet' | 'muted' | 'brand' | 'danger' | 'inverse';
type IconButtonShape = 'control' | 'circle' | 'pill';
type IconButtonContext = 'default' | 'topbar' | 'sheet' | 'lightbox' | 'feed' | 'profile';

interface IconButtonProps {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  shape?: IconButtonShape;
  context?: IconButtonContext;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  children?: ReactNode;
  title?: string;
  disabled?: boolean;
  'aria-label'?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const variantClassMap: Record<IconButtonVariant, string> = {
  quiet: 'quiet-button ui-icon-button',
  action: 'quiet-button ui-icon-action',
};

function IconButton({
  variant = 'quiet',
  size = 'md',
  tone = 'quiet',
  shape = 'control',
  context = 'default',
  type = 'button',
  className = '',
  children,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(variantClassMap[variant], className)}
      data-icon-action-size={size}
      data-icon-action-tone={tone}
      data-icon-action-shape={shape}
      data-icon-action-context={context}
      {...buttonProps}
    >
      <span className="ui-icon-button-content">
        {children}
      </span>
    </button>
  );
}

export default memo(IconButton);
