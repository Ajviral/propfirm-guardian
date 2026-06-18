import React from 'react';

import TrialCountdownDisplay from './TrialCountdownDisplay';
import { useTrialStore } from '../store/useTrialStore';

/** Amber-styled DD:HH:MM:SS display (tick handled by TrialCountdownDisplay). */
export default function CountdownTimer() {
  const status = useTrialStore((s) => s.status);

  if (status === 'expired' || status === 'loading' || status === 'pro') {
    return null;
  }

  return <TrialCountdownDisplay color="#F6C90E" fontSize={36} variant="amber" />;
}
