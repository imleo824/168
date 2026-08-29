import type { ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import type { SurfaceTone } from '@/ui/uiTypes';

type SurfaceSectionCardProps = {
  key?: string | number;
  as?: ElementType;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  paddingClassName?: string;
  tone?: SurfaceTone;
  ariaLabel?: string;
};

export default function SurfaceSectionCard({
  as,
  children,
  className = '',
  compact = false,
  paddingClassName,
  tone = 'solid',
  ariaLabel,
}: SurfaceSectionCardProps) {
  const Component: ElementType = as || 'section';
  return (
    <Component
      data-surface-tone={tone}
      aria-label={ariaLabel}
      className={cn(
        'ui-section-card ui-surface-card',
        paddingClassName || (compact ? 'ui-section-card-compact' : 'ui-section-card-default'),
        className,
      )}
    >
      {children}
    </Component>
  );
}
