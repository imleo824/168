import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type PageContentShellProps = Omit<ComponentPropsWithoutRef<'div'>, 'as' | 'className' | 'children'> & {
  as?: ElementType;
  children: ReactNode;
  bottomSafe?: boolean;
  className?: string;
  variant?: 'narrow' | 'fluid';
  width?: 'reading' | 'standard' | 'wide' | 'fluid';
};

export default function PageContentShell({
  as,
  bottomSafe = false,
  children,
  className = '',
  variant = 'narrow',
  width,
  ...restProps
}: PageContentShellProps) {
  const Component: ElementType = as || 'div';
  const resolvedWidth = width || (variant === 'fluid' ? 'fluid' : 'standard');
  return (
    <Component
      {...restProps}
      data-ui-content-width={resolvedWidth}
      className={cn(
        'ui-page-content-shell',
        resolvedWidth === 'fluid' ? 'ui-shell-fluid' : 'ui-shell-narrow',
        bottomSafe && 'ui-page-content-shell--bottom-safe',
        className,
      )}
    >
      {children}
    </Component>
  );
}
