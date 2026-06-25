import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { useSettingsStore } from '../store/useSettingsStore';
import { LIVE_SERVER_HTTPS } from '../utils/tokenUtils';

const REVENUECAT_API_KEY = __DEV__
  ? 'test_PqHgolMJHuZdrHtcOfdEWRxoQeb'
  : 'goog_vekYzdfTrVgbhEKhRaWqxKupDSS';

/** Entitlement identifier configured in the RevenueCat dashboard. */
const PRO_ENTITLEMENT_ID = 'PropFirm Guardian Pro';

let purchasesInitialized = false;

/**
 * Initializes the RevenueCat SDK once at app startup.
 * DEBUG logging in development; ERROR in production builds.
 */
export function initializePurchases(): void {
  if (purchasesInitialized) return;

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  Purchases.addCustomerInfoUpdateListener((customerInfo) => {
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    useSettingsStore.getState().updateSetting('isPro', isPro);
  });
  purchasesInitialized = true;
}

/**
 * Returns whether the `PropFirm Guardian Pro` entitlement is currently active for this customer.
 */
export async function checkProStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Pulls entitlement state from RevenueCat and writes `isPro` into settings store.
 */
export async function syncProStatus(): Promise<void> {
  const isPro = await checkProStatus();
  useSettingsStore.getState().updateSetting('isPro', isPro);
}

function isUserCancelled(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
  }
  return false;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Purchase failed';
}

/**
 * Reads Pro status from customerInfo returned by purchase/restore.
 * RevenueCat's servers can lag briefly — if not active yet, wait and retry once.
 */
async function resolveProFromCustomerInfo(
  customerInfo: CustomerInfo,
  failureMessage: string,
): Promise<{ success: boolean; error?: string }> {
  const isProActive = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

  if (isProActive) {
    await syncProStatus();
    return { success: true };
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const fallbackActive = await checkProStatus();
  if (fallbackActive) {
    await syncProStatus();
    return { success: true };
  }

  return { success: false, error: failureMessage };
}

async function purchasePackage(pkg: PurchasesPackage | null | undefined): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!pkg) {
    return { success: false, error: 'Product not available' };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return resolveProFromCustomerInfo(
      customerInfo,
      'Pro entitlement not active after purchase',
    );
  } catch (error) {
    if (isUserCancelled(error)) {
      return { success: false, error: 'cancelled' };
    }
    return { success: false, error: errorMessage(error) };
  }
}

export async function fetchOfferings(): Promise<{
  annual: PurchasesPackage | null;
  monthly: PurchasesPackage | null;
}> {
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    const annual =
      current?.annual ??
      current?.availablePackages.find((p) => p.packageType === 'ANNUAL') ??
      null;
    const monthly =
      current?.monthly ??
      current?.availablePackages.find((p) => p.packageType === 'MONTHLY') ??
      null;
    return { annual, monthly };
  } catch {
    return { annual: null, monthly: null };
  }
}

/**
 * Purchases the monthly subscription from the current RevenueCat offering.
 */
export async function purchaseMonthlyPro(): Promise<{ success: boolean; error?: string }> {
  try {
    const { monthly } = await fetchOfferings();
    return purchasePackage(monthly);
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Purchases the annual subscription from the current RevenueCat offering.
 */
export async function purchaseAnnualPro(): Promise<{ success: boolean; error?: string }> {
  try {
    const { annual } = await fetchOfferings();
    return purchasePackage(annual);
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Restores prior purchases and refreshes Pro status in the local store.
 */
export async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return resolveProFromCustomerInfo(customerInfo, 'No active subscription found');
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Registers an MT5 connection token with the backend, linked to this RevenueCat user.
 * Failures are logged only — never blocks the UI.
 */
export async function registerConnectionToken(token: string): Promise<void> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const revenueCatUserId = customerInfo.originalAppUserId;

    const res = await fetch(`${LIVE_SERVER_HTTPS}/api/register-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        revenueCatUserId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      }),
    });

    if (!res.ok) {
      console.warn('[Live] register-token failed:', res.status);
    }
  } catch (err) {
    console.warn('[Live] register-token error:', err);
  }
}
