import React from 'react';
import PageContentShell from '@/ui/PageContentShell';
import { Skeleton } from '@/ui/Skeleton';

type PageLoaderProps = {
  text?: string;
  className?: string;
};

export function PageLoader({ text = '正在加载...', className = '' }: PageLoaderProps) {
  const cards = [0, 1, 2];

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
