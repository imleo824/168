import type { ReactNode } from 'react';
import { StateBlock } from '@/ui/LoadingState';
import type { UIStateTone } from '@/ui/UIStateBlock';
import { cn } from '@/utils/cn';

type EmptyStateCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: UIStateTone;
  compact?: boolean;
  className?: string;
};

export default function EmptyStateCard({
  title,
  description,
  action,
  tone = 'empty',
  compact = true,
  className = '',
}: EmptyStateCardProps) {
  return (
    <StateBlock
      title={title}
      description={description}
      action={action}
      tone={tone}
      compact={compact}
      className={cn(
        'empty-state-card',
        compact ? 'empty-state-card--compact' : 'empty-state-card--spacious',
        className,
      )}
    />
  );
}
