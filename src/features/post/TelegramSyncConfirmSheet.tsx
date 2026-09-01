import { lazy, Suspense } from 'react';

import type { TelegramSyncConfirmSheetPanelProps } from './TelegramSyncConfirmSheetPanel';

const LazyTelegramSyncConfirmSheetPanel = lazy(() =>
  import('./TelegramSyncConfirmSheetPanel').then((module) => ({
    default: module.default,
  })),
);

export default function TelegramSyncConfirmSheet(props: TelegramSyncConfirmSheetPanelProps) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LazyTelegramSyncConfirmSheetPanel {...props} />
    </Suspense>
  );
}
