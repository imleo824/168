import type { ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type PageContentShellProps = {
  as?: ElementType;
  children: ReactNode;
  bottomSafe?: boolean;
  className?: string;
  variant?: 'narrow' | 'fluid';
};

export default function PageContentShell({
  as,
  bottomSafe = false,
  children,
  className = '',
  variant = 'narrow',
}: PageContentShellProps) {
  const Component: ElementType = as || 'div';
  return (
    <Component
      className={cn(
        'ui-page-content-shell',
        variant === 'fluid' ? 'ui-shell-fluid' : 'ui-shell-narrow',
        bottomSafe && 'ui-page-content-shell--bottom-safe',
        className,
      )}
    >
      {children}
    </Component>
  );
}
