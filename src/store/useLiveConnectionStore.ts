import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LIVE_SERVER_HTTPS } from '../utils/tokenUtils';

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

export type TradingPlatform = 'mt5' | 'mt4' | 'ctrader';

/** Persisted link between a generated token and a firm profile in the app. */
export interface LiveConnection {
  token: string;
  label: string;
  profileId: string;
  platform: TradingPlatform;
  serverUrl: string;
  status: LiveConnectionStatus;
  lastSeen: string | null;
  lastData: LiveAccountData | null;
  createdAt: string;
}

type StoredLiveConnection = Omit<LiveConnection, 'platform'> & { platform?: TradingPlatform };

function migrateServerUrl(url: string | undefined): string {
  if (typeof url !== 'string' || url.trim() === '') {
    return LIVE_SERVER_HTTPS;
  }
  return url.replace(
    'propfirm-guardian-server-production.up.railway.app',
    'propfirm-guardian-server.onrender.com',
  );
}

function normalizeConnection(connection: StoredLiveConnection): LiveConnection {
  return {
    ...connection,
    platform: connection.platform ?? 'mt5',
    serverUrl: migrateServerUrl(connection.serverUrl),
  };
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
          connections: [...state.connections, normalizeConnection(connection)],
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

      getConnectionByToken: (token) => {
        const connection = get().connections.find((c) => c.token === token);
        return connection ? normalizeConnection(connection) : null;
      },

      updateConnection: (token, updates) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.token === token ? normalizeConnection({ ...c, ...updates }) : normalizeConnection(c),
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
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<LiveConnectionStore>;
        return {
          ...currentState,
          ...persisted,
          connections: (persisted.connections ?? []).map((c) => normalizeConnection(c)),
        };
      },
    },
  ),
);
