import { format } from 'date-fns';

import { ALERT_THRESHOLDS } from '../constants';
import { INSTRUMENTS, SESSIONS } from '../constants/calculatorInstruments';

/** Resolve overlap between London and New York windows (UTC) by checking NY first. */
const SESSION_PRIORITY = ['NEW_YORK', 'LONDON', 'ASIAN'] as const;

/**
 * Formats a numeric amount with grouping and exactly two fraction digits.
 * @param currencySymbol Prefix shown before the number (default USD-style `$`).
 */
export function formatCurrency(value: number, currencySymbol = '$'): string {
  const rounded = Math.round(value * 100) / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `${currencySymbol}${formatted}`;
}

/**
 * Formats a raw percentage value (e.g. pass `3` for 3%) with a fixed number of decimals.
 */
export function formatPercent(value: number, decimalPlaces = 2): string {
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round(value * factor) / factor;
  return `${rounded.toFixed(decimalPlaces)}%`;
}

/** Lot display: always two decimal places (e.g. micro-lot style strings). */
export function formatLotSize(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2);
}

/** Dollar cap for the intraday loss rule: balance × (daily % / 100). */
export function calculateDailyLossLimit(
  accountBalance: number,
  dailyLossLimitPercent: number,
): number {
  return Math.round(accountBalance * (dailyLossLimitPercent / 100) * 100) / 100;
}

/** Dollar distance to the maximum trailing / overall loss rule. */
export function calculateMaxLossLimit(
  accountBalance: number,
  maxLossLimitPercent: number,
): number {
  return Math.round(accountBalance * (maxLossLimitPercent / 100) * 100) / 100;
}

/**
 * Account-level equity/balance floor under the peak before max-drawdown breach:
 * peak × (1 − maxLossPercent/100). Interpreted as dollars, not an instrument price tick.
 */
export function calculateDrawdownFloor(
  currentPeak: number,
  maxLossLimitPercent: number,
): number {
  const floor = currentPeak * (1 - maxLossLimitPercent / 100);
  return Math.round(floor * 100) / 100;
}

/** How much of a loss allowance has been used, as a 0–100+ percentage. */
export function calculatePercentageConsumed(
  currentLoss: number,
  totalLimit: number,
): number {
  if (totalLimit === 0) return 0;
  return (currentLoss / totalLimit) * 100;
}

/**
 * Maps utilization of a risk limit to coarse UI bands (aligned with common 50 / 75 / 90 gates).
 */
export function getAlertLevel(
  percentageConsumed: number,
): 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL' {
  if (percentageConsumed < ALERT_THRESHOLDS.CAUTION) return 'SAFE';
  if (percentageConsumed < ALERT_THRESHOLDS.WARNING) return 'CAUTION';
  if (percentageConsumed < ALERT_THRESHOLDS.CRITICAL) return 'WARNING';
  return 'CRITICAL';
}

/** Compact unique id: epoch milliseconds + random suffix (stable enough for client-side keys). */
export function generateUniqueId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

/**
 * Labels the active macro session using UTC clock and {@link SESSIONS} hour ranges
 * (half-open [startHour, endHour)). Overlap favors New York, then London, then Asian.
 */
export function getCurrentSession(
  date: Date,
): 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'OFF_SESSION' {
  const hour = date.getUTCHours();
  for (const key of SESSION_PRIORITY) {
    const window = SESSIONS[key];
    if ('startHour' in window && hour >= window.startHour && hour < window.endHour) {
      return key;
    }
  }
  return 'OFF_SESSION';
}

type InstrumentKey = keyof typeof INSTRUMENTS;

function resolveInstrumentKey(instrument: string): InstrumentKey | undefined {
  if (instrument in INSTRUMENTS) return instrument as InstrumentKey;
  const match = (Object.keys(INSTRUMENTS) as InstrumentKey[]).find(
    (key) => INSTRUMENTS[key].symbol === instrument,
  );
  return match;
}

/**
 * True when {@link getCurrentSession} matches one of the instrument’s listed primary sessions.
 */
export function isWithinTradingSession(instrument: string, date: Date): boolean {
  const key = resolveInstrumentKey(instrument);
  if (!key) return false;
  const session = getCurrentSession(date);
  const allowed = INSTRUMENTS[key].sessions;
  return (allowed as readonly string[]).includes(session);
}

/**
 * Locale-styled timestamp for lists and detail screens (24-hour clock).
 */
export function formatTimestamp(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return format(date, "MMMM d, yyyy 'at' HH:mm");
}
