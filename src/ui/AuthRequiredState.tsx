import type { ComponentProps, ReactNode } from 'react';
import ActionButton from '@/ui/ActionButton';
import { cn } from '@/utils/cn';

type AuthRequiredPlacement = 'page' | 'feed' | 'panel' | 'inline';
type AuthRequiredTone = 'card' | 'open' | 'panel' | 'hero' | 'quiet';
type AuthRequiredDensity = 'compact' | 'regular' | 'spacious';
type AuthRequiredContext =
  | 'default'
  | 'create'
  | 'profile'
  | 'promote'
  | 'recharge'
  | 'sponsor'
  | 'wallet'
  | 'records';

type AuthRequiredStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  icon?: ReactNode;
  actionIcon?: ReactNode;
  preview?: ReactNode;
  previewItems?: Array<{
    label: string;
    description?: string;
    icon?: ReactNode;
  }>;
  meta?: ReactNode;
  secondaryAction?: ReactNode;
  actionVariant?: ComponentProps<typeof ActionButton>['variant'];
  placement?: AuthRequiredPlacement;
  tone?: AuthRequiredTone;
  density?: AuthRequiredDensity;
  context?: AuthRequiredContext;
  className?: string;
  titleAs?: 'h1' | 'h2';
};

export default function AuthRequiredState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  actionIcon,
  preview,
  previewItems = [],
  meta,
  secondaryAction,
  actionVariant = 'brand',
  placement = 'page',
  tone = 'card',
  density = 'regular',
  context = 'default',
  className,
  titleAs = 'h2',
}: AuthRequiredStateProps) {
  const TitleElement = titleAs;
  const resolvedPreview = preview ?? (
    previewItems.length > 0 ? (
      <ul className="ui-auth-required-preview-list">
        {previewItems.map((item) => (
          <li key={item.label} className="ui-auth-required-preview-item">
            {item.icon ? <span className="ui-auth-required-preview-icon">{item.icon}</span> : null}
            <span className="ui-auth-required-preview-copy">
              <span className="ui-auth-required-preview-label">{item.label}</span>
              {item.description ? (
                <span className="ui-auth-required-preview-description">{item.description}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    ) : null
  );

  return (
    <div
      className={cn('ui-auth-required-card', className)}
      data-auth-placement={placement}
      data-auth-tone={tone}
      data-auth-density={density}
      data-auth-context={context}
    >
      {icon ? <div className="ui-auth-required-icon">{icon}</div> : null}
      <div className="ui-auth-required-heading">
        <TitleElement className="ui-auth-required-title">{title}</TitleElement>
        <p className="ui-auth-required-copy">{description}</p>
      </div>
      {resolvedPreview ? <div className="ui-auth-required-preview">{resolvedPreview}</div> : null}
      {meta ? <div className="ui-auth-required-meta">{meta}</div> : null}
      <div className="ui-auth-required-actions">
        <ActionButton onClick={onAction} variant={actionVariant} className="ui-auth-required-cta">
          {actionIcon}
          {actionLabel}
        </ActionButton>
        {secondaryAction}
      </div>
    </div>
  );
}
