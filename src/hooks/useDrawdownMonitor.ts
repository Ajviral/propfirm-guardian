import { useEffect, useRef } from 'react';

import { checkAndFireAlerts } from '../services/notifications';
import { useTrialGate } from '../hooks/useTrialGate';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import { useLiveConnectionStore } from '../store/useLiveConnectionStore';
import { useSettingsStore } from '../store/useSettingsStore';

/**
 * Watches live connection snapshots and fires local drawdown / margin alerts
 * while the app is in the foreground. Each alert key fires at most once per
 * session; the set resets at local midnight.
 */
export function useDrawdownMonitor(): void {
  const connections = useLiveConnectionStore((s) => s.connections);
  const profiles = useFirmProfileStore((s) => s.profiles);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const { showLiveFeatures } = useTrialGate();
  const alertsDailyDrawdown = useSettingsStore((s) => s.alertsDailyDrawdown);
  const alertsMaxDrawdown = useSettingsStore((s) => s.alertsMaxDrawdown);
  const alertsMarginLevel = useSettingsStore((s) => s.alertsMarginLevel);
  const alertsVibration = useSettingsStore((s) => s.alertsVibration);

  const firedAlerts = useRef(new Set<string>());

  useEffect(() => {
    if (!notificationsEnabled || !showLiveFeatures) return;

    for (const connection of connections) {
      if (connection.status !== 'connected' || connection.lastData == null) continue;

      const profile = profiles.find((p) => p.id === connection.profileId);
      if (!profile) continue;

      checkAndFireAlerts({
        liveData: connection.lastData,
        profile,
        label: connection.label,
        previousAlerts: firedAlerts.current,
        onAlertFired: (key) => {
          firedAlerts.current.add(key);
        },
        preferences: {
          dailyDrawdown: alertsDailyDrawdown,
          maxDrawdown: alertsMaxDrawdown,
          marginLevel: alertsMarginLevel,
          vibration: alertsVibration,
        },
      });
    }
  }, [
    connections,
    profiles,
    notificationsEnabled,
    showLiveFeatures,
    alertsDailyDrawdown,
    alertsMaxDrawdown,
    alertsMarginLevel,
    alertsVibration,
  ]);

  useEffect(() => {
    let lastDate = new Date().toDateString();

    const intervalId = setInterval(() => {
      const today = new Date().toDateString();
      if (today !== lastDate) {
        firedAlerts.current.clear();
        lastDate = today;
      }
    }, 60_000);

    return () => clearInterval(intervalId);
  }, []);
}
