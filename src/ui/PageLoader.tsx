import React from 'react';
import PageContentShell from '@/ui/PageContentShell';
import { Skeleton } from '@/ui/Skeleton';

type PageLoaderProps = {
  text?: string;
  className?: string;
};

function shouldUseDesktopRouteFallback() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (!window.location.pathname.startsWith('/desktop')) return false;
  return !document.querySelector('.desktop-shell');
}

function DesktopRouteLoader({ text }: { text: string }) {
  return (
    <div className="desktop-route-fallback" role="status" aria-live="polite" aria-label={text}>
      <aside className="desktop-route-fallback-sidebar" aria-hidden="true">
        <div className="desktop-route-fallback-skeleton desktop-route-fallback-brand" />
        <div className="desktop-route-fallback-nav">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="desktop-route-fallback-skeleton desktop-route-fallback-nav-item" />
          ))}
        </div>
        <div className="desktop-route-fallback-skeleton desktop-route-fallback-profile" />
      </aside>
      <main className="desktop-route-fallback-main">
        <div className="desktop-route-fallback-page">
          <div className="desktop-route-fallback-card">
            <Skeleton className="desktop-route-fallback-content-line desktop-route-fallback-content-line--short" />
            <Skeleton className="desktop-route-fallback-content-line" />
            <Skeleton className="desktop-route-fallback-content-block" />
          </div>
        </div>
      </main>
    </div>
  );
}

export function PageLoader({ text = '正在加载...', className = '' }: PageLoaderProps) {
  const cards = [0, 1, 2];

  if (shouldUseDesktopRouteFallback()) {
    return <DesktopRouteLoader text={text} />;
  }

  return (
    <div
      className={`ui-page-loader ${className}`}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <PageContentShell className="ui-app-page-stack">
        {cards.map((item) => (
          <div key={item} className="surface-card ui-page-loader-card">
            <div className="ui-page-loader-header">
              <Skeleton circle className="ui-page-loader-avatar" />
              <div className="ui-page-loader-lines">
                <Skeleton className="ui-page-loader-title-line" />
                <Skeleton className="ui-page-loader-meta-line" />
              </div>
            </div>
            <Skeleton className="ui-skeleton-card ui-page-loader-media" />
            <div className="ui-page-loader-copy">
              <Skeleton className="ui-page-loader-copy-line ui-page-loader-copy-line--full" />
              <Skeleton className="ui-page-loader-copy-line ui-skeleton-line-card" />
            </div>
          </div>
        ))}
      </PageContentShell>
    </div>
  );
}
