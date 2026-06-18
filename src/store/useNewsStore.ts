import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ManualNewsEvent } from '../types';

export interface NewsStore {
  manualNewsEvents: ManualNewsEvent[];
  newsBlackoutActive: boolean;
  notify10MinBefore: boolean;
  notify30MinBefore: boolean;
  addManualEvent: (event: ManualNewsEvent) => void;
  removeManualEvent: (id: string) => void;
  toggleNewsBlackout: () => void;
  setNotify10Min: (enabled: boolean) => void;
  setNotify30Min: (enabled: boolean) => void;
}

export const useNewsStore = create<NewsStore>()(
  persist(
    (set) => ({
      manualNewsEvents: [],
      newsBlackoutActive: false,
      notify10MinBefore: true,
      notify30MinBefore: true,

      addManualEvent: (event) =>
        set((state) => ({
          manualNewsEvents: [...state.manualNewsEvents, event],
        })),

      removeManualEvent: (id) =>
        set((state) => ({
          manualNewsEvents: state.manualNewsEvents.filter((e) => e.id !== id),
        })),

      toggleNewsBlackout: () =>
        set((state) => ({ newsBlackoutActive: !state.newsBlackoutActive })),

      setNotify10Min: (enabled) => set(() => ({ notify10MinBefore: enabled })),
      setNotify30Min: (enabled) => set(() => ({ notify30MinBefore: enabled })),
    }),
    {
      name: 'news-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        manualNewsEvents: state.manualNewsEvents,
        newsBlackoutActive: state.newsBlackoutActive,
        notify10MinBefore: state.notify10MinBefore,
        notify30MinBefore: state.notify30MinBefore,
      }),
    },
  ),
);
