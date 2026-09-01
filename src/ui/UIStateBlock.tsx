import { memo, type AriaRole, type ElementType, type ReactNode } from 'react';
import UIText from './UIText';
import { cn } from '@/utils/cn';

export type UIStateTone = 'neutral' | 'empty' | 'error' | 'info' | 'success';

interface UIStateBlockProps {
  icon?: ReactNode;
  title?: ReactNode;
  titleAs?: ElementType;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: UIStateTone;
  compact?: boolean;
  inline?: boolean;
  role?: AriaRole;
  ariaLive?: 'off' | 'polite' | 'assertive';
  className?: string;
}

function UIStateBlock({
  icon,
  title,
  titleAs: TitleComponent = 'h3',
  description,
  action,
  secondaryAction,
  tone = 'neutral',
  compact = false,
  inline = false,
  role,
  ariaLive,
  className = '',
}: UIStateBlockProps) {
  return (
    <div
      className={cn(
        'ui-state-block',
        `ui-state-block--${tone}`,
        compact && 'ui-state-block--compact',
        inline && 'ui-state-block--inline',
        className,
      )}
      role={role}
      aria-live={ariaLive}
    >
      {icon ? <div className="ui-state-icon">{icon}</div> : null}
      {title ? (
        <UIText as={TitleComponent} variant="title" tone="strong" className="ui-state-title">
          {title}
        </UIText>
      ) : null}
      {description ? (
        <UIText as="p" variant="meta" tone="muted" className="ui-state-copy">
          {description}
        </UIText>
      ) : null}
      {action || secondaryAction ? (
        <div className="ui-state-actions">
          {action ? <div className="ui-state-action">{action}</div> : null}
          {secondaryAction ? <div className="ui-state-action ui-state-action--secondary">{secondaryAction}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export default memo(UIStateBlock);
