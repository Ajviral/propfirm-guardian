import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { LiveAccountData } from '../store/useLiveConnectionStore';
import type { FirmProfile } from '../types';

export interface AlertThresholds {
  dailyDrawdownWarning: number;
  dailyDrawdownCaution: number;
  dailyDrawdownCritical: number;
  maxDrawdownWarning: number;
  maxDrawdownCaution: number;
  maxDrawdownCritical: number;
  marginLevelCaution: number;
  marginLevelWarning: number;
  marginLevelCritical: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  dailyDrawdownWarning: 50,
  dailyDrawdownCaution: 75,
  dailyDrawdownCritical: 90,
  maxDrawdownWarning: 50,
  maxDrawdownCaution: 75,
  maxDrawdownCritical: 90,
  marginLevelCaution: 500,
  marginLevelWarning: 200,
  marginLevelCritical: 150,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('drawdown-alerts', {
      name: 'Drawdown Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00D4AA',
      sound: 'default',
      enableVibrate: true,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDrawdownAlert(params: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  vibrate?: boolean;
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: params.title,
      body: params.body,
      data: params.data,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      ...(Platform.OS === 'android'
        ? {
            channelId: 'drawdown-alerts',
            vibrate: params.vibrate ? [0, 250, 250, 250] : undefined,
          }
        : {}),
    },
    trigger: null,
  });
}

function limitUtilizationPercent(drawdownUsed: number, limitPercent: number): number {
  if (limitPercent <= 0) return 0;
  return (drawdownUsed / limitPercent) * 100;
}

function fireAlertIfNew(
  alertKey: string,
  previousAlerts: Set<string>,
  onAlertFired: (alertKey: string) => void,
  title: string,
  body: string,
  vibrate: boolean,
): void {
  if (previousAlerts.has(alertKey)) return;
  void scheduleDrawdownAlert({ title, body, data: { alertKey }, vibrate });
  onAlertFired(alertKey);
}

export function checkAndFireAlerts(params: {
  liveData: LiveAccountData;
  profile: FirmProfile;
  label: string;
  previousAlerts: Set<string>;
  onAlertFired: (alertKey: string) => void;
  thresholds?: AlertThresholds;
  preferences?: {
    dailyDrawdown: boolean;
    maxDrawdown: boolean;
    marginLevel: boolean;
    vibration: boolean;
  };
}): void {
  const {
    liveData,
    profile,
    label,
    previousAlerts,
    onAlertFired,
    thresholds = DEFAULT_ALERT_THRESHOLDS,
    preferences = {
      dailyDrawdown: true,
      maxDrawdown: true,
      marginLevel: true,
      vibration: true,
    },
  } = params;

  const token = liveData.token;
  const startingBalance = profile.accountSize;

  if (startingBalance > 0 && preferences.dailyDrawdown && profile.dailyLossLimitPercent > 0) {
    const dailyDrawdownUsed = Math.max(
      0,
      ((startingBalance - liveData.equity) / startingBalance) * 100,
    );
    const dailyUtil = limitUtilizationPercent(dailyDrawdownUsed, profile.dailyLossLimitPercent);
    const dailyLimit = profile.dailyLossLimitPercent;

    if (dailyUtil >= thresholds.dailyDrawdownCritical) {
      fireAlertIfNew(
        `daily_critical_${token}`,
        previousAlerts,
        onAlertFired,
        '🚨 CRITICAL: Daily Drawdown Alert',
        `Daily drawdown at ${dailyUtil.toFixed(0)}% of ${dailyLimit}% limit on ${label}. Stop trading immediately.`,
        preferences.vibration,
      );
    } else if (dailyUtil >= thresholds.dailyDrawdownCaution) {
      fireAlertIfNew(
        `daily_caution_${token}`,
        previousAlerts,
        onAlertFired,
        '⚠️ WARNING: Daily Drawdown Alert',
        `Daily drawdown at ${dailyUtil.toFixed(0)}% of ${dailyLimit}% limit on ${label}. Reduce position size.`,
        preferences.vibration,
      );
    } else if (dailyUtil >= thresholds.dailyDrawdownWarning) {
      fireAlertIfNew(
        `daily_warning_${token}`,
        previousAlerts,
        onAlertFired,
        '📊 Daily Drawdown Notice',
        `Daily drawdown at ${dailyUtil.toFixed(0)}% of ${dailyLimit}% limit on ${label}.`,
        false,
      );
    }
  }

  if (preferences.maxDrawdown && profile.maxLossLimitPercent > 0) {
    const peak =
      profile.highestEquityPeak > profile.accountSize
        ? profile.highestEquityPeak
        : Math.max(profile.accountSize, liveData.balance);

    if (peak > 0) {
      const maxDrawdownUsed = Math.max(0, ((peak - liveData.equity) / peak) * 100);
      const maxUtil = limitUtilizationPercent(maxDrawdownUsed, profile.maxLossLimitPercent);
      const maxLimit = profile.maxLossLimitPercent;

      if (maxUtil >= thresholds.maxDrawdownCritical) {
        fireAlertIfNew(
          `max_critical_${token}`,
          previousAlerts,
          onAlertFired,
          '🚨 CRITICAL: Max Drawdown Alert',
          `Max drawdown at ${maxUtil.toFixed(0)}% of ${maxLimit}% limit on ${label}. Stop trading immediately.`,
          preferences.vibration,
        );
      } else if (maxUtil >= thresholds.maxDrawdownCaution) {
        fireAlertIfNew(
          `max_caution_${token}`,
          previousAlerts,
          onAlertFired,
          '⚠️ WARNING: Max Drawdown Alert',
          `Max drawdown at ${maxUtil.toFixed(0)}% of ${maxLimit}% limit on ${label}. Reduce position size.`,
          preferences.vibration,
        );
      } else if (maxUtil >= thresholds.maxDrawdownWarning) {
        fireAlertIfNew(
          `max_warning_${token}`,
          previousAlerts,
          onAlertFired,
          '📊 Max Drawdown Notice',
          `Max drawdown at ${maxUtil.toFixed(0)}% of ${maxLimit}% limit on ${label}.`,
          false,
        );
      }
    }
  }

  if (preferences.marginLevel && liveData.marginLevel !== 0) {
    const margin = liveData.marginLevel;

    if (margin <= thresholds.marginLevelCritical) {
      fireAlertIfNew(
        `margin_critical_${token}`,
        previousAlerts,
        onAlertFired,
        '🚨 CRITICAL: Margin Level Warning',
        `Margin level at ${margin.toFixed(0)}% on ${label}. Broker may close positions at 100%.`,
        preferences.vibration,
      );
    } else if (margin <= thresholds.marginLevelWarning) {
      fireAlertIfNew(
        `margin_warning_${token}`,
        previousAlerts,
        onAlertFired,
        '⚠️ Margin Level Warning',
        `Margin level dropping to ${margin.toFixed(0)}% on ${label}.`,
        preferences.vibration,
      );
    } else if (margin <= thresholds.marginLevelCaution) {
      fireAlertIfNew(
        `margin_caution_${token}`,
        previousAlerts,
        onAlertFired,
        '📊 Margin Level Notice',
        `Margin level at ${margin.toFixed(0)}% on ${label}. Monitor closely.`,
        false,
      );
    }
  }
}

const TRIAL_NOTIFICATION_IDENTIFIERS = [
  'trial-warning-day5',
  'trial-warning-day6',
  'trial-expired',
] as const;

export async function scheduleTrialWarningNotifications(expiresAt: string): Promise<void> {
  await Promise.all(
    TRIAL_NOTIFICATION_IDENTIFIERS.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );

  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return;

  const scheduleAt = async (
    identifier: string,
    title: string,
    body: string,
    triggerDate: Date,
  ) => {
    if (triggerDate.getTime() <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' ? { channelId: 'drawdown-alerts' } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  };

  await scheduleAt(
    'trial-warning-day5',
    '⏰ Trial Ends in 2 Days — PropFirm Guardian',
    "Subscribe to keep live MT5 monitoring. Save 35%+ with the annual plan.",
    new Date(expiryMs - 48 * 60 * 60 * 1000),
  );

  await scheduleAt(
    'trial-warning-day6',
    '⚠️ Last Day of Trial — PropFirm Guardian',
    'Your trial expires in 24 hours. Subscribe now — $9.99/mo for first 2 months.',
    new Date(expiryMs - 24 * 60 * 60 * 1000),
  );

  await scheduleAt(
    'trial-expired',
    '🔒 Trial Expired — PropFirm Guardian',
    'Your free trial has ended. Subscribe to keep live account monitoring.',
    new Date(expiryMs),
  );
}
