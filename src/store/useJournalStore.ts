import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { TradeEntry } from '../types';

/** Public surface of the journal slice — trade CRUD plus a per-profile selector. */
export interface JournalStore {
  trades: TradeEntry[];
  addTrade: (trade: TradeEntry) => void;
  updateTrade: (id: string, updates: Partial<TradeEntry>) => void;
  deleteTrade: (id: string) => void;
  /** Returns trades for one profile, newest first (sorted by `timestamp`). */
  getTradesByProfile: (profileId: string) => TradeEntry[];
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      trades: [],

      addTrade: (trade) =>
        set((state) => ({
          trades: [...state.trades, trade],
        })),

      updateTrade: (id, updates) =>
        set((state) => ({
          trades: state.trades.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      deleteTrade: (id) =>
        set((state) => ({
          trades: state.trades.filter((t) => t.id !== id),
        })),

      getTradesByProfile: (profileId) =>
        get()
          .trades.filter((t) => t.profileId === profileId)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    }),
    {
      // Stable AsyncStorage key for the JSON snapshot.
      name: 'journal-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the `trades` array; actions are reattached on hydrate.
      partialize: (state) => ({ trades: state.trades }),
    },
  ),
);
