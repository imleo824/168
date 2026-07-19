import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type PageContentShellProps = Omit<ComponentPropsWithoutRef<'div'>, 'as' | 'className' | 'children'> & {
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
  ...restProps
}: PageContentShellProps) {
  const Component: ElementType = as || 'div';
  return (
    <Component
      {...restProps}
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
