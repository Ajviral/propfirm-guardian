import { DrawdownType } from '../calculators/RiskCalculator';

/** Global app metadata and safety caps for profiles / limits. */
export const APP_CONFIG = {
  appName: 'PropFirm Guardian',
  version: '1.0.0',
  /** End-of-day cutoff in New York local time (used with NY session rules). */
  eodCutoffHour: 17,
  eodCutoffMinute: 0,
  /** Default percentage of the risk reference used for new trade sizing. */
  defaultRiskPercentage: 1,
  maxProfiles: 10,
  freeProfileLimit: 1,
  freeTradingJournalLimit: 20,
} as const;

/** Tooltip copy: how each drawdown mode measures limits vs balance / equity / peaks. */
export const DRAWDOWN_DESCRIPTIONS: Record<DrawdownType, string> = {
  [DrawdownType.BALANCE_BASED]:
    'Daily and max drawdown use your settled account balance. Floating profit or loss on open trades does not change the limit until positions are closed.',
  [DrawdownType.EQUITY_BASED]:
    'Limits track live equity (balance plus unrealized P&L). Open trades can push you closer to the breach level without closing positions.',
  [DrawdownType.EOD]:
    'Drawdown is evaluated against your balance at the end of the trading day (freeze snapshot), not intraday swings.',
  [DrawdownType.STATIC]:
    'Limits are measured from a fixed starting balance that does not increase when you profit—scaling rules stay anchored to the original account size.',
  [DrawdownType.RELATIVE]:
    'Drawdown is measured from your peak equity or balance (high water mark). After new highs, the allowed loss zone moves up with the peak.',
};

/** Percent-of-limit bands used for caution / warning / critical UI and alerts. */
export const ALERT_THRESHOLDS = {
  CAUTION: 50,
  WARNING: 75,
  CRITICAL: 90,
} as const;

/** Preset journal / setup labels for trade tagging. */
export const SETUP_TAGS = [
  'PDH Sweep',
  'PDL Grab',
  'PWH Sweep',
  'PWL Grab',
  'PMH Sweep',
  'PML Grab',
  'FVG Fill',
  'OB Retest',
  'BOS',
  'CHoCH',
  'Liquidity Grab',
  'Other',
] as const;
