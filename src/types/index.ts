import type { RiskCalculationOutput } from '../calculators/RiskCalculator';

// --- Re-exports from feature modules (single import path for the app) ---

export { DrawdownType } from '../calculators/RiskCalculator';
export type { FirmProfile, FirmProfileStore } from '../store/useFirmProfileStore';

// --- Domain types ----------------------------------------------------------

export interface TradeEntry {
  id: string;
  profileId: string;
  instrument: 'XAUUSD' | 'NAS100' | 'US30' | string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  lotSize: number;
  session: 'ASIAN' | 'LONDON' | 'NEW_YORK' | 'OFF_SESSION';
  outcome?: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN';
  profitLoss?: number;
  setupTag?: string;
  notes?: string;
  screenshotUri?: string;
  calculatedRisk: number;
  calculatedRiskPercent: number;
  timestamp: string;
}

export interface LiquidityLevel {
  id: string;
  profileId: string;
  type: 'PDH' | 'PDL' | 'PWH' | 'PWL' | 'PMH' | 'PML';
  price: number;
  session: string;
  status: 'UNTAPPED' | 'SWEPT' | 'PARTIALLY_SWEPT';
  notes?: string;
  createdAt: string;
}

export interface AlertSettings {
  profileId: string;
  dailyLossAt50: boolean;
  dailyLossAt75: boolean;
  dailyLossAt90: boolean;
  maxLossAt50: boolean;
  maxLossAt75: boolean;
  maxLossAt90: boolean;
  profitTargetAt50: boolean;
  preNewsWarning: boolean;
  eodReminder: boolean;
  eodReminderTime: string;
}

export type VerdictType = 'PASS' | 'CAUTION' | 'FAIL';

export interface ManualNewsEvent {
  id: string;
  name: string;
  /** ISO-8601 date string (e.g. '2026-05-15'). */
  date: string;
  /** Time string (e.g. '08:30 ET'). */
  time: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  notes?: string;
}

export interface CalculatorSession {
  activeProfileId: string;
  lastCalculation?: RiskCalculationOutput;
  savedCalculations: RiskCalculationOutput[];
}

/** React Navigation root stack (shared with `Navigation.tsx` to avoid import cycles). */
export type RootStackParamList = {
  /** Shown only while `AppNavigator` hydrates disclaimer acceptance from storage (not part of main flow). */
  LoadingGate: undefined;
  Onboarding: undefined;
  Dashboard: undefined;
  Calculator: { profileId?: string };
  FirmProfile: { profileId?: string; isEditing?: boolean };
  Journal: {
    profileId: string;
    /** Optional draft from the risk calculator for the journal screen to hydrate. */
    calculatorPrefill?: {
      instrument: string;
      entryPrice: string;
      stopLossPrice: string;
      takeProfitPrice?: string;
      lotSize: string;
      calculatedRisk: number;
      calculatedRiskPercent: number;
      setupTag?: string;
    };
  };
  Analytics: { profileId: string };
  LiquidityTracker: { profileId: string };
  Settings: undefined;
  AlertSettings: undefined;
  NewsCalendar: undefined;
  LiveConnection: undefined;
  Disclaimer: undefined;
};
