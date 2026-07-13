import { lazy, Suspense } from 'react';

import type { PostCommentSheetPanelProps } from './PostCommentSheetPanel';

export type { PostComment, PostCommentUser } from './PostCommentSheetPanel';

const LazyPostCommentSheetPanel = lazy(() =>
  import('./PostCommentSheetPanel').then((module) => ({
    default: module.PostCommentSheetPanel,
  })),
);

export default function PostCommentSheet(props: PostCommentSheetPanelProps) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LazyPostCommentSheetPanel {...props} />
    </Suspense>
  );
}
