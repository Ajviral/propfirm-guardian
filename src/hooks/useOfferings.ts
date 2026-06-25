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

export function getAnnualSavingsPercent(
  annual: PurchasesPackage | null,
  monthly: PurchasesPackage | null,
): number | null {
  const a = annual?.product?.price;
  const m = monthly?.product?.price;
  if (a == null || m == null || m <= 0) return null;
  const yearlyIfMonthly = m * 12;
  if (yearlyIfMonthly <= 0) return null;
  const pct = Math.round(((yearlyIfMonthly - a) / yearlyIfMonthly) * 100);
  return pct > 0 ? pct : null;
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
