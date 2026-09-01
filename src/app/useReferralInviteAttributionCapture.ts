import { useEffect } from 'react';

import { readReferralInviteFromCurrentUrl, writeStoredReferralInvite } from '@/utils/referralInvite';

export function useReferralInviteAttributionCapture(routeSearch: string) {
  useEffect(() => {
    const invite = readReferralInviteFromCurrentUrl();
    if (!invite) return;
    writeStoredReferralInvite(invite);
  }, [routeSearch]);
}
