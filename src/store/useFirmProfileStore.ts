import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DrawdownType } from '../calculators/RiskCalculator';

/**
 * Single saved prop-firm challenge / evaluation profile.
 * Holds rule parameters used by the risk engine and UI, plus bookkeeping fields.
 */
export interface FirmProfile {
  id: string;
  firmName: string;
  challengeName: string;
  accountSize: number;
  dailyLossLimitPercent: number;
  maxLossLimitPercent: number;
  drawdownType: DrawdownType;
  profitTargetPercent: number;
  minTradingDays: number;
  currentBalance: number;
  currentEquity: number;
  highestEquityPeak: number;
  eodSnapshotBalance: number;
  initialStartingBalance: number;
  allTimeHighBalance: number;
  platform: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Public surface of the Zustand slice: persisted profile list + CRUD and active-profile helpers.
 */
export interface FirmProfileStore {
  profiles: FirmProfile[];
  activeProfileId: string | null;
  addProfile: (profile: FirmProfile) => void;
  updateProfile: (id: string, updates: Partial<FirmProfile>) => void;
  deleteProfile: (id: string) => void;
  setActiveProfile: (id: string) => void;
  getActiveProfile: () => FirmProfile | null;
}

/**
 * Pre-filled rule sets for common firms. UI can merge with user ids, balances, and timestamps.
 * FundedNext includes multiple purchase tiers; others omit size until the trader picks an account.
 */
export const FIRM_TEMPLATES = {
  /** FundedNext Stellar 1-Step — equity-based trailing rules; pick one tier for accountSize when saving. */
  FUNDED_NEXT_STELLAR_1_STEP: {
    firmName: 'FundedNext',
    challengeName: 'Stellar 1-Step',
    accountSizeTiers: [5000, 10000, 25000, 50000, 100000, 200000] as const,
    dailyLossLimitPercent: 3,
    maxLossLimitPercent: 6,
    drawdownType: DrawdownType.EQUITY_BASED,
    profitTargetPercent: 8,
    minTradingDays: 2,
  },
  FTMO: {
    firmName: 'FTMO',
    challengeName: 'Challenge',
    dailyLossLimitPercent: 5,
    maxLossLimitPercent: 10,
    drawdownType: DrawdownType.BALANCE_BASED,
    profitTargetPercent: 10,
    minTradingDays: 4,
  },
  GOAT_FUNDED_TRADER: {
    firmName: 'Goat Funded Trader',
    challengeName: 'Evaluation',
    dailyLossLimitPercent: 4,
    maxLossLimitPercent: 8,
    drawdownType: DrawdownType.EOD,
    profitTargetPercent: 8,
    minTradingDays: 3,
  },
  FUNDING_PIPS: {
    firmName: 'FundingPips',
    challengeName: 'Challenge',
    dailyLossLimitPercent: 4,
    maxLossLimitPercent: 8,
    drawdownType: DrawdownType.BALANCE_BASED,
    profitTargetPercent: 8,
    minTradingDays: 3,
  },
  /** Blank slate: caller supplies every field on top of zeros / empty strings. */
  CUSTOM_FIRM: {
    firmName: '',
    challengeName: '',
    accountSize: 0,
    dailyLossLimitPercent: 0,
    maxLossLimitPercent: 0,
    drawdownType: DrawdownType.BALANCE_BASED,
    profitTargetPercent: 0,
    minTradingDays: 0,
  },
} as const;

// --- Store ----------------------------------------------------------------

export const useFirmProfileStore = create<FirmProfileStore>()(
  persist(
    (set, get) => ({
      // Snapshot fields written to AsyncStorage (see partialize below).
      profiles: [],
      activeProfileId: null,

      /**
       * Append a fully-built profile (callers should assign id / timestamps / balances).
       * Does not auto-select unless you extend this behavior in the UI layer.
       */
      addProfile: (profile) =>
        set((state) => ({
          profiles: [...state.profiles, profile],
        })),

      /**
       * Shallow-merge updates into the matching profile and bump `updatedAt` (ISO time).
       */
      updateProfile: (id, updates) => {
        const updatedAt = new Date().toISOString();
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt } : p,
          ),
        }));
      },

      /**
       * Remove a profile; clears `activeProfileId` when it pointed at the deleted id.
       */
      deleteProfile: (id) =>
        set((state) => {
          const profiles = state.profiles.filter((p) => p.id !== id);
          const activeProfileId =
            state.activeProfileId === id ? null : state.activeProfileId;
          return { profiles, activeProfileId };
        }),

      /**
       * Points navigation at a profile; no-op if the id is missing (guards typos).
       */
      setActiveProfile: (id) =>
        set(() => {
          const exists = get().profiles.some((p) => p.id === id);
          return exists ? { activeProfileId: id } : {};
        }),

      /**
       * Resolves the active profile object from `activeProfileId`, or null when unset / stale.
       */
      getActiveProfile: () => {
        const { profiles, activeProfileId } = get();
        if (!activeProfileId) return null;
        return profiles.find((p) => p.id === activeProfileId) ?? null;
      },
    }),
    {
      // Stable AsyncStorage key for the JSON blob (must not change across releases).
      name: 'firm-profile-store',
      // AsyncStorage already implements `getItem`/`setItem`/`removeItem` with the right shape.
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data — never persist action functions (they are reattached on load).
      partialize: (state) => ({
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
      }),
    },
  ),
);
