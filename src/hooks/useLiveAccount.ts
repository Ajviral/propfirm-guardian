import { useCallback, useEffect, useRef, useState } from 'react';

import {
  useLiveConnectionStore,
  type LiveAccountData,
  type LiveConnectionStatus,
  type LivePosition,
} from '../store/useLiveConnectionStore';
import { LIVE_SERVER_HTTPS, LIVE_SERVER_WSS } from '../utils/tokenUtils';

const POLL_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 3;

/** Coerce unknown API position rows into {@link LivePosition}. */
function mapPosition(raw: Record<string, unknown>): LivePosition {
  const typeNum = Number(raw.type ?? raw.direction);
  const direction: 'BUY' | 'SELL' =
    raw.direction === 'BUY' || raw.direction === 'SELL'
      ? raw.direction
      : typeNum === 1
        ? 'SELL'
        : 'BUY';

  return {
    ticket: Number(raw.ticket ?? 0),
    symbol: String(raw.symbol ?? ''),
    direction,
    volume: Number(raw.volume ?? 0),
    openPrice: Number(raw.openPrice ?? 0),
    currentPrice: Number(raw.currentPrice ?? raw.openPrice ?? 0),
    stopLoss: Number(raw.sl ?? raw.stopLoss ?? 0),
    takeProfit: Number(raw.tp ?? raw.takeProfit ?? 0),
    profit: Number(raw.profit ?? 0),
    swap: Number(raw.swap ?? 0),
    openTime: Number(raw.openTime ?? 0),
  };
}

/** Normalize REST / WebSocket payloads into {@link LiveAccountData}. */
export function normalizeLiveAccountData(raw: Record<string, unknown>): LiveAccountData {
  const positionsRaw = Array.isArray(raw.positions) ? raw.positions : [];

  return {
    token: String(raw.token ?? ''),
    accountNumber: Number(raw.accountNumber ?? 0),
    accountName: String(raw.accountName ?? ''),
    accountServer: String(raw.accountServer ?? ''),
    accountCurrency: String(raw.accountCurrency ?? 'USD'),
    leverage: Number(raw.leverage ?? 0),
    balance: Number(raw.balance ?? 0),
    equity: Number(raw.equity ?? 0),
    margin: Number(raw.margin ?? 0),
    freeMargin: Number(raw.freeMargin ?? 0),
    floatingPnL: Number(raw.floatingPnL ?? raw.profit ?? 0),
    marginLevel: Number(raw.marginLevel ?? 0),
    positions: positionsRaw.map((p) => mapPosition(p as Record<string, unknown>)),
    timestamp: Number(raw.timestamp ?? 0),
    receivedAt: Number(raw.receivedAt ?? Date.now()),
  };
}

export interface UseLiveAccountResult {
  liveData: LiveAccountData | null;
  status: LiveConnectionStatus;
  lastSeen: string | null;
  reconnect: () => void;
  checkConnection: () => Promise<void>;
  isConnected: boolean;
}

/**
 * Maintains a WebSocket subscription and REST fallback poll for one account token.
 * Updates {@link useLiveConnectionStore} when fresh data arrives.
 */
export function useLiveAccount(token: string | null): UseLiveAccountResult {
  const updateConnection = useLiveConnectionStore((s) => s.updateConnection);
  const stored = useLiveConnectionStore((s) =>
    token ? (s.connections.find((c) => c.token === token) ?? null) : null,
  );

  const [liveData, setLiveData] = useState<LiveAccountData | null>(stored?.lastData ?? null);
  const [status, setStatus] = useState<LiveConnectionStatus>(stored?.status ?? 'pending');
  const [lastSeen, setLastSeen] = useState<string | null>(stored?.lastSeen ?? null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const tokenRef = useRef(token);

  tokenRef.current = token;

  const applyLiveUpdate = useCallback(
    (data: LiveAccountData) => {
      const seen = new Date().toISOString();
      setLiveData(data);
      setLastSeen(seen);
      setStatus('connected');

      if (tokenRef.current) {
        updateConnection(tokenRef.current, {
          lastData: data,
          lastSeen: seen,
          status: 'connected',
        });
      }
    },
    [updateConnection],
  );

  const fetchAccountSnapshot = useCallback(async (): Promise<boolean> => {
    const activeToken = tokenRef.current;
    if (!activeToken) return false;

    try {
      const res = await fetch(`${LIVE_SERVER_HTTPS}/api/account/${encodeURIComponent(activeToken)}`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: Record<string, unknown>;
      };

      if (!res.ok || !json.success || !json.data) {
        return false;
      }

      applyLiveUpdate(normalizeLiveAccountData(json.data));
      return true;
    } catch {
      return false;
    }
  }, [applyLiveUpdate]);

  /** Manual poll used by the "Check Connection" button. */
  const checkConnection = useCallback(async () => {
    const ok = await fetchAccountSnapshot();
    if (!ok && tokenRef.current) {
      setStatus('pending');
      updateConnection(tokenRef.current, { status: 'pending' });
    }
  }, [fetchAccountSnapshot, updateConnection]);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connectWebSocket = useCallback(() => {
    const activeToken = tokenRef.current;
    if (!activeToken) return;

    // Close any existing socket before opening a new one.
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(LIVE_SERVER_WSS);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setStatus('connected');
      updateConnection(activeToken, { status: 'connected' });
      ws.send(JSON.stringify({ type: 'subscribe', token: activeToken }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          data?: Record<string, unknown>;
        };

        if (message.type === 'accountUpdate' && message.data) {
          applyLiveUpdate(normalizeLiveAccountData(message.data));
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    ws.onerror = () => {
      setStatus('error');
      updateConnection(activeToken, { status: 'error' });
    };

    ws.onclose = () => {
      setStatus('disconnected');
      updateConnection(activeToken, { status: 'disconnected' });

      if (retryCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        retryCountRef.current += 1;
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, RECONNECT_DELAY_MS);
      }
    };
  }, [applyLiveUpdate, updateConnection]);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    clearReconnectTimer();
    connectWebSocket();
    void fetchAccountSnapshot();
  }, [connectWebSocket, fetchAccountSnapshot]);

  useEffect(() => {
    if (!token) {
      setLiveData(null);
      setStatus('pending');
      setLastSeen(null);
      return;
    }

    const conn = useLiveConnectionStore.getState().getConnectionByToken(token);
    if (conn) {
      setLiveData(conn.lastData);
      setStatus(conn.status);
      setLastSeen(conn.lastSeen);
    }

    connectWebSocket();

    pollTimerRef.current = setInterval(() => {
      void fetchAccountSnapshot();
    }, POLL_INTERVAL_MS);

    return () => {
      clearReconnectTimer();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, connectWebSocket, fetchAccountSnapshot]);

  return {
    liveData,
    status,
    lastSeen,
    reconnect,
    checkConnection,
    isConnected: status === 'connected',
  };
}
