import { create } from 'zustand';

import type { TrialStatus } from '../services/trialService';

export type TrialUiStatus = 'loading' | 'new' | 'active' | 'expired' | 'pro';

export interface TrialState {
  status: TrialUiStatus;
  trialStartedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
  isProSubscriber: boolean;
  isLoading: boolean;
  error: string | null;
  /** User dismissed expiry overlay and chose free-only features for this session. */
  continuedWithFree: boolean;

  setTrialStatus: (status: TrialStatus) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setContinuedWithFree: (value: boolean) => void;
  decrementSecond: () => void;
}

export const useTrialStore = create<TrialState>((set, get) => ({
  status: 'loading',
  trialStartedAt: null,
  expiresAt: null,
  daysRemaining: 0,
  hoursRemaining: 0,
  minutesRemaining: 0,
  secondsRemaining: 0,
  isProSubscriber: false,
  isLoading: true,
  error: null,
  continuedWithFree: false,

  setTrialStatus: (trial) =>
    set({
      status: trial.status,
      trialStartedAt: trial.trialStartedAt,
      expiresAt: trial.expiresAt,
      daysRemaining: trial.daysRemaining,
      hoursRemaining: trial.hoursRemaining,
      minutesRemaining: trial.minutesRemaining,
      secondsRemaining: trial.secondsRemaining,
      isProSubscriber: trial.isProSubscriber,
      isLoading: false,
      error: null,
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) =>
    set({
      error,
      isLoading: false,
      status: 'expired',
      daysRemaining: 0,
      hoursRemaining: 0,
      minutesRemaining: 0,
      secondsRemaining: 0,
    }),

  setContinuedWithFree: (value) => set({ continuedWithFree: value }),

  decrementSecond: () => {
    const s = get();
    if (s.status !== 'active' && s.status !== 'new') return;

    let { secondsRemaining, minutesRemaining, hoursRemaining, daysRemaining } = s;

    if (secondsRemaining > 0) {
      secondsRemaining -= 1;
    } else if (minutesRemaining > 0) {
      minutesRemaining -= 1;
      secondsRemaining = 59;
    } else if (hoursRemaining > 0) {
      hoursRemaining -= 1;
      minutesRemaining = 59;
      secondsRemaining = 59;
    } else if (daysRemaining > 0) {
      daysRemaining -= 1;
      hoursRemaining = 23;
      minutesRemaining = 59;
      secondsRemaining = 59;
    } else {
      set({ status: 'expired', continuedWithFree: false });
      return;
    }

    set({
      secondsRemaining,
      minutesRemaining,
      hoursRemaining,
      daysRemaining,
    });
  },
}));
