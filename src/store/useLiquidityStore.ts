import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LiquidityLevel } from '../types';

/** Public surface for the liquidity slice — CRUD plus a per-profile selector and a sweep helper. */
export interface LiquidityStore {
  levels: LiquidityLevel[];
  addLevel: (level: LiquidityLevel) => void;
  updateLevel: (id: string, updates: Partial<LiquidityLevel>) => void;
  deleteLevel: (id: string) => void;
  /** Returns levels for one profile, newest first (sorted by `createdAt`). */
  getLevelsByProfile: (profileId: string) => LiquidityLevel[];
  /** Convenience: set status to `'SWEPT'` on a single level. */
  markAsSwept: (id: string) => void;
}

export const useLiquidityStore = create<LiquidityStore>()(
  persist(
    (set, get) => ({
      levels: [],

      addLevel: (level) =>
        set((state) => ({
          levels: [...state.levels, level],
        })),

      updateLevel: (id, updates) =>
        set((state) => ({
          levels: state.levels.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),

      deleteLevel: (id) =>
        set((state) => ({
          levels: state.levels.filter((l) => l.id !== id),
        })),

      getLevelsByProfile: (profileId) =>
        get()
          .levels.filter((l) => l.profileId === profileId)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),

      markAsSwept: (id) =>
        set((state) => ({
          levels: state.levels.map((l) => (l.id === id ? { ...l, status: 'SWEPT' } : l)),
        })),
    }),
    {
      // Stable AsyncStorage key for the JSON snapshot.
      name: 'liquidity-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist `levels`; actions are reattached on hydration.
      partialize: (state) => ({ levels: state.levels }),
    },
  ),
);
