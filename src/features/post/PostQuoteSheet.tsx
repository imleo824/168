import { lazy, Suspense } from 'react';

import type { PostQuoteSheetPanelProps } from './PostQuoteSheetPanel';

const LazyPostQuoteSheetPanel = lazy(() =>
  import('./PostQuoteSheetPanel').then((module) => ({
    default: module.PostQuoteSheetPanel,
  })),
);

export default function PostQuoteSheet(props: PostQuoteSheetPanelProps) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LazyPostQuoteSheetPanel {...props} />
    </Suspense>
  );
}
