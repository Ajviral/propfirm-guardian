import { useMemo } from 'react';

import { useTrialStore } from '../store/useTrialStore';

export function useTrialGate() {
  const status = useTrialStore((s) => s.status);
  const daysRemaining = useTrialStore((s) => s.daysRemaining);
  const hoursRemaining = useTrialStore((s) => s.hoursRemaining);
  const minutesRemaining = useTrialStore((s) => s.minutesRemaining);
  const secondsRemaining = useTrialStore((s) => s.secondsRemaining);
  const isProSubscriber = useTrialStore((s) => s.isProSubscriber);
  const continuedWithFree = useTrialStore((s) => s.continuedWithFree);
  const expiresAt = useTrialStore((s) => s.expiresAt);

  return useMemo(() => {
    const isPro = status === 'pro' || isProSubscriber;
    const isExpired = status === 'expired';
    const isProOrTrial =
      isPro || status === 'active' || status === 'new';

    const countdown = {
      days: daysRemaining,
      hours: hoursRemaining,
      minutes: minutesRemaining,
      seconds: secondsRemaining,
    };

    const showLiveFeatures = isProOrTrial && !(isExpired && continuedWithFree);

    return {
      status,
      isPro,
      isProOrTrial,
      isExpired,
      showLiveFeatures,
      continuedWithFree,
      daysRemaining,
      countdown,
      expiresAt,
    };
  }, [
    status,
    daysRemaining,
    hoursRemaining,
    minutesRemaining,
    secondsRemaining,
    isProSubscriber,
    continuedWithFree,
    expiresAt,
  ]);
}
