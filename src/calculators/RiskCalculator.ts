/**
 * Core risk sizing math for prop-firm style accounts.
 * Interprets “pip” as the broker’s minimum price increment for the instrument;
 * pip value per lot is derived from contract size × point value (USD per one price unit per lot).
 */

export enum DrawdownType {
  BALANCE_BASED = 'BALANCE_BASED',
  EQUITY_BASED = 'EQUITY_BASED',
  EOD = 'EOD',
  STATIC = 'STATIC',
  RELATIVE = 'RELATIVE',
}

export interface InstrumentSpec {
  symbol: string;
  contractSize: number;
  pointValue: number;
  description: string;
}

export const DEFAULT_INSTRUMENTS: Record<string, InstrumentSpec> = {
  XAUUSD: {
    symbol: 'XAUUSD',
    contractSize: 100,
    pointValue: 1,
    description: 'Gold vs USD (default contract assumptions)',
  },
  NAS100: {
    symbol: 'NAS100',
    contractSize: 1,
    pointValue: 1,
    description: 'US Tech 100 index CFD (default contract assumptions)',
  },
  US30: {
    symbol: 'US30',
    contractSize: 1,
    pointValue: 1,
    description: 'US 30 index CFD (default contract assumptions)',
  },
};

export interface RiskCalculationInput {
  accountBalance: number;
  riskPercentage: number;
  entryPrice: number;
  stopLossPrice: number;
  instrumentSpec: InstrumentSpec;
  drawdownType: DrawdownType;
  currentEquity?: number;
  highestEquityPeak?: number;
  eodSnapshotBalance?: number;
  initialStartingBalance?: number;
  allTimeHighBalance?: number;
  existingOpenRisk?: number;
}

export interface RiskCalculationOutput {
  maxLotSize: number;
  exactDollarRisk: number;
  percentageOfDailyLimit: number;
  remainingDailyBuffer: number;
  pipDistance: number;
  pipValue: number;
  verdict: 'PASS' | 'CAUTION' | 'FAIL';
  verdictReason: string;
}

/** Round values that represent money (USD) to 2 decimal places. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolve which account reference amount to apply the daily risk % against,
 * depending on how the firm measures drawdown / risk denomination.
 */
function resolveRiskBase(input: RiskCalculationInput): { base: number; error?: string } {
  const {
    drawdownType,
    accountBalance,
    currentEquity,
    highestEquityPeak,
    eodSnapshotBalance,
    initialStartingBalance,
    allTimeHighBalance,
  } = input;

  switch (drawdownType) {
    case DrawdownType.BALANCE_BASED:
      // Classic: daily risk is a % of the current settled balance (margin account balance).
      return { base: accountBalance };

    case DrawdownType.EQUITY_BASED:
      // Floating P&L matters: risk budget ties to live equity, not only balance.
      if (currentEquity === undefined || Number.isNaN(currentEquity)) {
        return { base: 0, error: 'EQUITY_BASED requires currentEquity.' };
      }
      return { base: currentEquity };

    case DrawdownType.EOD:
      // Use last end-of-day snapshot if provided; otherwise fall back to current balance.
      return { base: eodSnapshotBalance ?? accountBalance };

    case DrawdownType.STATIC:
      // Risk stays anchored to the initial account size (challenge start / static evaluation).
      return { base: initialStartingBalance ?? accountBalance };

    case DrawdownType.RELATIVE:
      // Conservative peak reference: size against high-water mark (peak balance/equity path).
      return {
        base: highestEquityPeak ?? allTimeHighBalance ?? accountBalance,
      };

    default:
      return { base: accountBalance };
  }
}

/**
 * Dollar value per one full price unit (same units as entry/stop) per 1.0 lot,
 * before applying distance to stop.
 */
function pipValuePerLot(spec: InstrumentSpec): number {
  return spec.contractSize * spec.pointValue;
}

/**
 * Main entry: computes maximum lot size so that stop-out loss matches the allowed
 * slice of the daily risk budget (after existing open risk), for the chosen drawdown mode.
 */
export function calculateMaxLotSize(input: RiskCalculationInput): RiskCalculationOutput {
  const { riskPercentage, entryPrice, stopLossPrice, instrumentSpec, existingOpenRisk } = input;

  // --- Step 1: price distance from entry to stop (always positive).
  const pipDistance = Math.abs(entryPrice - stopLossPrice);

  // --- Step 2: how much each lot gains/loses per one price unit (then × distance for full risk per lot).
  const pipValue = pipValuePerLot(instrumentSpec);

  const { base: riskBase, error: baseError } = resolveRiskBase(input);

  // --- Step 3: nominal daily risk cap in dollars = risk reference × (risk % / 100).
  const dailyLimitDollars = roundMoney(riskBase * (riskPercentage / 100));

  // --- Step 4: subtract risk already committed by open positions today.
  const openRisk = existingOpenRisk ?? 0;
  const availableDollarRisk = roundMoney(dailyLimitDollars - openRisk);

  // --- Step 5: dollars lost per 1.0 lot if price travels from entry to stop (full stop width).
  const lossPerLot = pipDistance * pipValue;

  // Default failure output scaffold (overwritten on success path).
  let maxLotSize = 0;
  let exactDollarRisk = 0;
  let percentageOfDailyLimit = 0;
  let remainingDailyBuffer = roundMoney(dailyLimitDollars - openRisk);
  let verdict: 'PASS' | 'CAUTION' | 'FAIL' = 'FAIL';
  let verdictReason = '';

  if (baseError) {
    verdictReason = baseError;
  } else if (riskBase <= 0) {
    verdictReason = 'Risk reference must be positive.';
  } else if (pipDistance <= 0) {
    verdictReason = 'Stop loss must differ from entry (pip distance cannot be zero).';
  } else if (pipValue <= 0) {
    verdictReason = 'Instrument pip value per lot must be positive (check contract/point settings).';
  } else if (availableDollarRisk <= 0) {
    verdictReason =
      'No remaining daily risk budget (existing open risk meets or exceeds the daily limit).';
  } else if (lossPerLot <= 0) {
    verdictReason = 'Invalid loss-per-lot computation.';
  } else {
    // --- Step 6: lot size so that (lots × loss per lot) uses the remaining daily budget.
    // exactDollarRisk is capped to what is still available after existing trades.
    exactDollarRisk = availableDollarRisk;
    maxLotSize = exactDollarRisk / lossPerLot;

    // --- Step 7: how much of the nominal daily cap this allocation represents (independent of open risk).
    percentageOfDailyLimit =
      dailyLimitDollars > 0 ? roundMoney((exactDollarRisk / dailyLimitDollars) * 100) : 0;

    // --- Step 8: headroom under the daily cap after assuming this trade at max size.
    remainingDailyBuffer = roundMoney(dailyLimitDollars - openRisk - exactDollarRisk);

    // Monetary fields rounded for reporting consistency.
    exactDollarRisk = roundMoney(exactDollarRisk);
    maxLotSize = roundMoney(maxLotSize);

    if (maxLotSize <= 0) {
      verdict = 'FAIL';
      verdictReason = 'Computed lot size is zero or negative.';
    } else {
      // --- Step 9: verdict — FAIL on hard blocks; CAUTION when heavily utilizing the daily envelope.
      const openRiskShare = dailyLimitDollars > 0 ? openRisk / dailyLimitDollars : 0;
      if (openRiskShare >= 0.9 || percentageOfDailyLimit >= 95) {
        verdict = 'CAUTION';
        verdictReason =
          'Sizing uses most of the daily risk envelope (high existing use or near-full allocation).';
      } else if (openRiskShare >= 0.5 || percentageOfDailyLimit >= 80) {
        verdict = 'CAUTION';
        verdictReason =
          'Elevated share of daily risk budget in use; verify room for discretion and news risk.';
      } else {
        verdict = 'PASS';
        verdictReason = 'Sizing fits within the modeled daily risk budget for this drawdown mode.';
      }
    }
  }

  return {
    maxLotSize: roundMoney(maxLotSize),
    exactDollarRisk: roundMoney(exactDollarRisk),
    percentageOfDailyLimit: roundMoney(percentageOfDailyLimit),
    remainingDailyBuffer: roundMoney(remainingDailyBuffer),
    pipDistance: roundMoney(pipDistance),
    pipValue: roundMoney(pipValue),
    verdict,
    verdictReason,
  };
}

/*
 * --- Commented example tests (not executed) ---
 *
 * Test 1 — Gold (XAUUSD), $100,000 balance reference, 3% daily risk,
 * entry 2350.00, stop 2340.00 (BALANCE_BASED).
 *
 * const out1 = calculateMaxLotSize({
 *   accountBalance: 100_000,
 *   riskPercentage: 3,
 *   entryPrice: 2350.0,
 *   stopLossPrice: 2340.0,
 *   instrumentSpec: DEFAULT_INSTRUMENTS.XAUUSD,
 *   drawdownType: DrawdownType.BALANCE_BASED,
 * });
 * // Expect: daily cap ≈ $3,000; pip distance = 10; pip value per lot = 100 (contract×point);
 * // loss per lot = 10 × 100 = $1,000; max lots ≈ 3.00; exactDollarRisk ≈ $3,000.
 *
 * Test 2 — NAS100, $50,000 account, 3% daily risk, entry 19450, stop 19380 (BALANCE_BASED).
 *
 * const out2 = calculateMaxLotSize({
 *   accountBalance: 50_000,
 *   riskPercentage: 3,
 *   entryPrice: 19450,
 *   stopLossPrice: 19380,
 *   instrumentSpec: DEFAULT_INSTRUMENTS.NAS100,
 *   drawdownType: DrawdownType.BALANCE_BASED,
 * });
 * // Expect: daily cap ≈ $1,500; pip distance = 70; pip value per lot = 1;
 * // loss per lot = $70; max lots ≈ 21.43; exactDollarRisk ≈ $1,500.
 *
 * Test 3 — US30, $200,000 account, 3% daily risk, entry 42500, stop 42350 (BALANCE_BASED).
 *
 * const out3 = calculateMaxLotSize({
 *   accountBalance: 200_000,
 *   riskPercentage: 3,
 *   entryPrice: 42500,
 *   stopLossPrice: 42350,
 *   instrumentSpec: DEFAULT_INSTRUMENTS.US30,
 *   drawdownType: DrawdownType.BALANCE_BASED,
 * });
 * // Expect: daily cap ≈ $6,000; pip distance = 150; pip value per lot = 1;
 * // loss per lot = $150; max lots = 40.00; exactDollarRisk ≈ $6,000.
 */
