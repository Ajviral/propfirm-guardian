import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Live snapshot pushed from the MT5 EA via the Railway backend. */
export interface LivePosition {
  ticket: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  openTime: number;
}

export interface LiveAccountData {
  token: string;
  accountNumber: number;
  accountName: string;
  accountServer: string;
  accountCurrency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  floatingPnL: number;
  marginLevel: number;
  positions: LivePosition[];
  timestamp: number;
  receivedAt: number;
}

export type LiveConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';

/** Persisted link between a generated token and a firm profile in the app. */
export interface LiveConnection {
  token: string;
  label: string;
  profileId: string;
  serverUrl: string;
  status: LiveConnectionStatus;
  lastSeen: string | null;
  lastData: LiveAccountData | null;
  createdAt: string;
}

export interface LiveConnectionStore {
  connections: LiveConnection[];
  activeConnectionToken: string | null;
  addConnection: (connection: LiveConnection) => void;
  removeConnection: (token: string) => void;
  setActiveConnection: (token: string) => void;
  getConnectionByToken: (token: string) => LiveConnection | null;
  updateConnection: (token: string, updates: Partial<LiveConnection>) => void;
}

export const useLiveConnectionStore = create<LiveConnectionStore>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionToken: null,

      addConnection: (connection) =>
        set((state) => ({
          connections: [...state.connections, connection],
          activeConnectionToken: connection.token,
        })),

      removeConnection: (token) =>
        set((state) => ({
          connections: state.connections.filter((c) => c.token !== token),
          activeConnectionToken:
            state.activeConnectionToken === token ? null : state.activeConnectionToken,
        })),

      setActiveConnection: (token) =>
        set(() => ({ activeConnectionToken: token })),

      getConnectionByToken: (token) =>
        get().connections.find((c) => c.token === token) ?? null,

      updateConnection: (token, updates) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.token === token ? { ...c, ...updates } : c,
          ),
        })),
    }),
    {
      name: 'live-connection-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionToken: state.activeConnectionToken,
      }),
    },
  ),
);
