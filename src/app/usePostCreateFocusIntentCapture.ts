import { useEffect } from 'react';

import { installPostCreateFocusIntentCapture } from '@/utils/postCreateFocusPrime';

export function usePostCreateFocusIntentCapture(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return undefined;
    return installPostCreateFocusIntentCapture();
  }, [enabled]);
}
