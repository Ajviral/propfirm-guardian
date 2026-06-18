import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Persisted user preferences. The required fields drive the calculator/journal pipelines;
 * notification sub-toggles control which alerts fire when the master switch is on.
 */
export interface SettingsState {
  darkMode: boolean;
  defaultRiskPercentage: number;
  eodCutoffHour: number;
  eodCutoffMinute: number;
  currencySymbol: string;
  notificationsEnabled: boolean;
  biometricLockEnabled: boolean;
  cloudBackupEnabled: boolean;
  /** Pro subscription unlocks live MT5 monitoring and related features. */
  isPro: boolean;

  // --- Notification sub-toggles (persisted; gated by `notificationsEnabled` in the UI). ---
  alertsDailyLoss: boolean;
  alertsMaxLoss: boolean;
  alertsProfitTarget: boolean;
  alertsPreNews: boolean;
  alertsEodReminder: boolean;
  alertsMinTradingDays: boolean;

  /** Live drawdown / margin push alert toggles (Alert Settings screen). */
  alertsDailyDrawdown: boolean;
  alertsMaxDrawdown: boolean;
  alertsMarginLevel: boolean;
  alertsVibration: boolean;
}

export interface SettingsStore extends SettingsState {
  /** Type-safe single-key updater used by every toggle / input on the settings screen. */
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  /** Resets the entire settings slice (used by "Reset all data" on the settings screen). */
  resetAll: () => void;
}

export const DEFAULT_SETTINGS: SettingsState = {
  darkMode: true,
  defaultRiskPercentage: 1,
  eodCutoffHour: 17,
  eodCutoffMinute: 0,
  currencySymbol: '$',
  notificationsEnabled: true,
  biometricLockEnabled: false,
  cloudBackupEnabled: false,
  isPro: false,
  alertsDailyLoss: true,
  alertsMaxLoss: true,
  alertsProfitTarget: true,
  alertsPreNews: true,
  alertsEodReminder: true,
  alertsMinTradingDays: true,
  alertsDailyDrawdown: true,
  alertsMaxDrawdown: true,
  alertsMarginLevel: true,
  alertsVibration: true,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      updateSetting: (key, value) =>
        set(() => ({ [key]: value }) as Pick<SettingsState, typeof key>),

      resetAll: () => set(() => ({ ...DEFAULT_SETTINGS })),
    }),
    {
      // Stable AsyncStorage key for the JSON snapshot.
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Strip actions out of the persisted snapshot.
      partialize: (state) => {
        const {
          updateSetting: _u,
          resetAll: _ra,
          ...persisted
        } = state;
        return persisted;
      },
    },
  ),
);
