import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { PurchasesIntroPrice, PurchasesPackage } from 'react-native-purchases';

import { fetchOfferings } from '../services/revenueCat';

export function getRegularPriceString(pkg: PurchasesPackage | null): string | null {
  return pkg?.product?.priceString ?? null;
}

export function getIntroPrice(pkg: PurchasesPackage | null): PurchasesIntroPrice | null {
  return pkg?.product?.introPrice ?? null;
}

export interface AnnualSavings {
  percent: number;
  basis: 'first-year' | 'recurring';
}

export function getAnnualSavings(
  annual: PurchasesPackage | null,
  monthly: PurchasesPackage | null,
): AnnualSavings | null {
  const annualProduct = annual?.product;
  const monthlyProduct = monthly?.product;
  if (!annualProduct || !monthlyProduct) return null;

  const annualRegular = annualProduct.price;
  const monthlyRegular = monthlyProduct.price;
  if (annualRegular == null || monthlyRegular == null || monthlyRegular <= 0) return null;

  const annualIntro = annualProduct.introPrice;
  const monthlyIntro = monthlyProduct.introPrice;

  if (annualIntro != null && monthlyIntro != null) {
    const annualFirstYear = annualIntro.price;
    const introCycles = Math.min(monthlyIntro.cycles ?? 0, 12);
    const monthlyFirstYear =
      monthlyIntro.price * introCycles + monthlyRegular * (12 - introCycles);
    if (monthlyFirstYear <= 0) return null;
    const pct = Math.round(((monthlyFirstYear - annualFirstYear) / monthlyFirstYear) * 100);
    return pct > 0 ? { percent: pct, basis: 'first-year' } : null;
  }

  const yearlyIfMonthly = monthlyRegular * 12;
  if (yearlyIfMonthly <= 0) return null;
  const pct = Math.round(((yearlyIfMonthly - annualRegular) / yearlyIfMonthly) * 100);
  return pct > 0 ? { percent: pct, basis: 'recurring' } : null;
}

export function getAnnualSavingsPercent(
  annual: PurchasesPackage | null,
  monthly: PurchasesPackage | null,
): number | null {
  return getAnnualSavings(annual, monthly)?.percent ?? null;
}

export function useOfferings() {
  const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadOfferings = useCallback(async () => {
    setLoading(true);
    const { annual, monthly } = await fetchOfferings();
    setAnnualPackage(annual);
    setMonthlyPackage(monthly);
    setError(annual == null && monthly == null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  useEffect(() => {
    const onAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void loadOfferings();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [loadOfferings]);

  return { annualPackage, monthlyPackage, loading, error };
}
