import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { checkProStatus } from './revenueCat';
import { generateFingerprint } from '../utils/deviceFingerprint';

export const TRIAL_DURATION_DAYS = 7;

/** Railway API base URL — constant only; no network I/O at module load. */
export const SERVER_URL =
  'https://propfirm-guardian-server-production.up.railway.app';

export interface TrialStatus {
  status: 'new' | 'active' | 'expired' | 'pro';
  trialStartedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
  isProSubscriber: boolean;
  reason?: string;
}

const EMPTY_COUNTDOWN = {
  daysRemaining: 0,
  hoursRemaining: 0,
  minutesRemaining: 0,
  secondsRemaining: 0,
};

/** True only inside the React Native app — false during Metro/Node bundling. */
function isReactNativeRuntime(): boolean {
  return (
    typeof global !== 'undefined' &&
    (global as { __fbBatchedBridge?: unknown }).__fbBatchedBridge != null
  );
}

function normalizeTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') return value;
  return null;
}

function mapServerTrialPayload(data: Record<string, unknown>): TrialStatus {
  return {
    status: (data.status as TrialStatus['status']) ?? 'expired',
    trialStartedAt: normalizeTimestamp(data.trialStartedAt),
    expiresAt: normalizeTimestamp(data.expiresAt),
    daysRemaining: Number(data.daysRemaining ?? 0),
    hoursRemaining: Number(data.hoursRemaining ?? 0),
    minutesRemaining: Number(data.minutesRemaining ?? 0),
    secondsRemaining: Number(data.secondsRemaining ?? 0),
    isProSubscriber: false,
    reason: data.reason as string | undefined,
  };
}

/** Offline / timeout fallback until the server responds on a later check. */
export function createOfflineTrialFallback(): TrialStatus {
  const trialStartedAt = Date.now();
  const expiresAt = trialStartedAt + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
  return {
    status: 'active',
    trialStartedAt: new Date(trialStartedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    daysRemaining: TRIAL_DURATION_DAYS,
    hoursRemaining: 0,
    minutesRemaining: 0,
    secondsRemaining: 0,
    isProSubscriber: false,
    reason: 'offline_fallback',
  };
}

async function fetchTrialFromServer(
  method: 'POST' | 'GET',
  fingerprintHash: string,
  body?: Record<string, unknown>,
): Promise<TrialStatus> {
  if (!isReactNativeRuntime()) {
    throw new Error('Trial API unavailable outside app runtime');
  }

  const url =
    method === 'POST'
      ? `${SERVER_URL}/api/trial/check`
      : `${SERVER_URL}/api/trial/status/${encodeURIComponent(fingerprintHash)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Trial API error: ${res.status}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    return mapServerTrialPayload(data);
  } catch (err) {
    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('aborted'));

    if (method === 'POST' && isAbort) {
      console.log('Trial server unreachable, granting temporary access');
      return createOfflineTrialFallback();
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkTrialStatus(): Promise<TrialStatus> {
  if (!isReactNativeRuntime()) {
    throw new Error('Trial check skipped outside app runtime');
  }

  const isPro = await checkProStatus();
  if (isPro) {
    return {
      status: 'pro',
      trialStartedAt: null,
      expiresAt: null,
      ...EMPTY_COUNTDOWN,
      isProSubscriber: true,
    };
  }

  const { fingerprintHash, deviceId, installId } = await generateFingerprint();

  let revenueCatId = 'anonymous';
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    revenueCatId = customerInfo.originalAppUserId;
  } catch {
    // non-fatal — server still validates fingerprint
  }

  return fetchTrialFromServer('POST', fingerprintHash, {
    fingerprintHash,
    deviceId,
    revenueCatId,
    installId,
    platform: Platform.OS,
  });
}

export async function refreshTrialCountdown(): Promise<TrialStatus> {
  if (!isReactNativeRuntime()) {
    throw new Error('Trial refresh skipped outside app runtime');
  }

  const isPro = await checkProStatus();
  if (isPro) {
    return {
      status: 'pro',
      trialStartedAt: null,
      expiresAt: null,
      ...EMPTY_COUNTDOWN,
      isProSubscriber: true,
    };
  }

  const { fingerprintHash } = await generateFingerprint();
  return fetchTrialFromServer('GET', fingerprintHash);
}
