import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/utils/cn';

export type AppPageSurface =
  | 'feed'
  | 'detail'
  | 'profile'
  | 'compose'
  | 'conversation'
  | 'workspace'
  | 'content'
  | 'utility';

export type AppPageDensity = 'comfortable' | 'compact';
export type AppPageScrollMode = 'document' | 'contained';

type AppPageProps = Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'> & {
  children: ComponentPropsWithoutRef<'div'>['children'];
  className?: string;
  bottomSafe?: boolean;
  mobileAddressBarScroll?: boolean;
  surface?: AppPageSurface;
  density?: AppPageDensity;
  scrollMode?: AppPageScrollMode;
};

const AppPage = forwardRef<HTMLDivElement, AppPageProps>(function AppPage(
  {
    children,
    className,
    bottomSafe = false,
    mobileAddressBarScroll = false,
    surface = 'utility',
    density = 'comfortable',
    scrollMode = 'document',
    ...restProps
  },
  ref,
) {
  return (
    <div
      {...restProps}
      ref={ref}
      data-mobile-addressbar-scroll={mobileAddressBarScroll ? '' : undefined}
      data-ui-page-surface={surface}
      data-ui-page-density={density}
      data-ui-page-scroll={scrollMode}
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
