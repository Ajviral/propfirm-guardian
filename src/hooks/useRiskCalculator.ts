import { useCallback, useMemo, useState } from 'react';

import {
  calculateMaxLotSize,
  type InstrumentSpec,
  type RiskCalculationInput,
  type RiskCalculationOutput,
} from '../calculators/RiskCalculator';
import { INSTRUMENTS } from '../constants/calculatorInstruments';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import type { FirmProfile } from '../types';

/** UI-facing strings for the sizing form; numbers stay as text until calculate parses them. */
export interface CalculatorFormState {
  selectedInstrument: 'XAUUSD' | 'NAS100' | 'US30';
  entryPrice: string;
  stopLossPrice: string;
  takeProfitPrice: string;
  contractSize: string;
  customRiskPercent: string;
  useCustomRisk: boolean;
}

/** Everything screens need to bind the form and run the engine. */
export interface CalculatorHookReturn {
  formState: CalculatorFormState;
  updateField: (field: keyof CalculatorFormState, value: string | boolean) => void;
  resetForm: () => void;
  calculate: () => RiskCalculationOutput | null;
  lastResult: RiskCalculationOutput | null;
  activeProfile: FirmProfile | null;
  isReadyToCalculate: boolean;
  validationError: string | null;
}

const INITIAL_FORM: CalculatorFormState = {
  selectedInstrument: 'XAUUSD',
  entryPrice: '',
  stopLossPrice: '',
  takeProfitPrice: '',
  contractSize: '',
  customRiskPercent: '',
  useCustomRisk: false,
};

/** Parses user-entered prices; rejects empty, non-numeric, and non-positive values. */
function parsePositivePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Optional override: blank field means “use instrument default”. */
function parseOptionalPositiveContract(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function parseRiskPercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Single source of truth for inline errors and for guarding `calculate`.
 * TODO: validate stop placement vs intended direction (long vs short); entry-only flow does not capture direction yet.
 */
function getValidationError(
  profile: FirmProfile | null,
  form: CalculatorFormState,
): string | null {
  if (!profile) {
    return 'Select an active firm profile before calculating risk.';
  }

  const entry = parsePositivePrice(form.entryPrice);
  if (entry === null) {
    return 'Enter a valid entry price greater than zero.';
  }

  const stop = parsePositivePrice(form.stopLossPrice);
  if (stop === null) {
    return 'Enter a valid stop loss price greater than zero.';
  }

  if (form.useCustomRisk) {
    const pct = parseRiskPercent(form.customRiskPercent);
    if (pct === null) {
      return 'Enter a valid custom risk percentage greater than zero.';
    }
  }

  const contractOverride = form.contractSize.trim();
  if (contractOverride !== '' && parseOptionalPositiveContract(form.contractSize) === undefined) {
    return 'Contract size override must be a positive number, or leave blank to use the instrument default.';
  }

  return null;
}

export function useRiskCalculator(): CalculatorHookReturn {
  // Subscribe to the smallest slice that derives the active profile (avoids extra re-renders).
  const activeProfile = useFirmProfileStore((s) =>
    s.activeProfileId ? (s.profiles.find((p) => p.id === s.activeProfileId) ?? null) : null,
  );

  const [formState, setFormState] = useState<CalculatorFormState>(INITIAL_FORM);
  /** Last successful engine run; kept for display until the next successful calculate or reset. */
  const [lastResult, setLastResult] = useState<RiskCalculationOutput | null>(null);

  const updateField = useCallback((field: keyof CalculatorFormState, value: string | boolean) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetForm = useCallback(() => {
    setFormState(INITIAL_FORM);
    setLastResult(null);
  }, []);

  const validationError = useMemo(
    () => getValidationError(activeProfile, formState),
    [activeProfile, formState],
  );

  /**
   * Minimum gating for enabling the primary button — does not include optional fields
   * like custom risk (those surface via `validationError` on submit).
   */
  const isReadyToCalculate = useMemo(() => {
    if (!activeProfile) return false;
    const entry = parsePositivePrice(formState.entryPrice);
    const stop = parsePositivePrice(formState.stopLossPrice);
    return entry !== null && stop !== null;
  }, [activeProfile, formState.entryPrice, formState.stopLossPrice]);

  const calculate = useCallback((): RiskCalculationOutput | null => {
    const err = getValidationError(activeProfile, formState);
    if (err || !activeProfile) {
      return null;
    }

    const profile = activeProfile;
    const entry = parsePositivePrice(formState.entryPrice)!;
    const stop = parsePositivePrice(formState.stopLossPrice)!;

    const instKey = formState.selectedInstrument;
    const meta = INSTRUMENTS[instKey];

    // Default contract from app constants; user may type an override for non-standard CFD specs.
    const defaultContract = meta.contractSize;
    const contractOverride = parseOptionalPositiveContract(formState.contractSize);
    const contractSize = contractOverride ?? defaultContract;

    const instrumentSpec: InstrumentSpec = {
      symbol: meta.symbol,
      contractSize,
      pointValue: meta.pointValue,
      description: meta.name,
    };

    const riskPercentage = formState.useCustomRisk
      ? parseRiskPercent(formState.customRiskPercent)!
      : profile.dailyLossLimitPercent;

    // Map saved profile metrics into the calculator input so drawdown rules match the firm template.
    const input: RiskCalculationInput = {
      accountBalance: profile.currentBalance,
      riskPercentage,
      entryPrice: entry,
      stopLossPrice: stop,
      instrumentSpec,
      drawdownType: profile.drawdownType,
      currentEquity: profile.currentEquity,
      highestEquityPeak: profile.highestEquityPeak,
      eodSnapshotBalance: profile.eodSnapshotBalance,
      initialStartingBalance: profile.initialStartingBalance,
      allTimeHighBalance: profile.allTimeHighBalance,
    };

    const result = calculateMaxLotSize(input);
    setLastResult(result);
    return result;
  }, [activeProfile, formState]);

  return {
    formState,
    updateField,
    resetForm,
    calculate,
    lastResult,
    activeProfile,
    isReadyToCalculate,
    validationError,
  };
}
