import { Suspense, lazy, memo } from 'react';

type ListReturnScrollRestorerProps = {
  scope: string;
  ready: boolean;
  restoreVersion: unknown;
};

const LazyListReturnScrollRestorer = lazy(() =>
  import('./listReturnScrollRestore').then((module) => ({
    default: module.ListReturnScrollRestorer,
  })),
);

export default memo(function ListReturnScrollRestorerBoundary(props: ListReturnScrollRestorerProps) {
  if (!props.ready) return null;

  return (
    <Suspense fallback={null}>
      <LazyListReturnScrollRestorer {...props} />
    </Suspense>
  );
});
