import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/utils/cn';

type AppPageProps = Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'> & {
  children: ComponentPropsWithoutRef<'div'>['children'];
  className?: string;
  bottomSafe?: boolean;
  mobileAddressBarScroll?: boolean;
};

const AppPage = forwardRef<HTMLDivElement, AppPageProps>(function AppPage(
  {
    children,
    className,
    bottomSafe = false,
    mobileAddressBarScroll = false,
    ...restProps
  },
  ref,
) {
  return (
    <div
      {...restProps}
      ref={ref}
      data-mobile-addressbar-scroll={mobileAddressBarScroll ? '' : undefined}
      className={cn(
        'ui-app-page ui-page ui-page-enter',
        bottomSafe && 'ui-app-page--bottom-safe',
        className,
      )}
    >
      {children}
    </div>
  );
});

export default AppPage;
