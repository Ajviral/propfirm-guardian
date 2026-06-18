import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';

import { initializePurchases, syncProStatus } from '../services/revenueCat';
import {
  requestNotificationPermissions,
  scheduleTrialWarningNotifications,
} from '../services/notifications';
import { checkTrialStatus, refreshTrialCountdown, createOfflineTrialFallback } from '../services/trialService';
import { useDrawdownMonitor } from '../hooks/useDrawdownMonitor';
import { useTrialStore } from '../store/useTrialStore';
import { ActivityIndicator, View } from 'react-native';
import { type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../types';

import { DisclaimerScreen, readDisclaimerAccepted } from './DisclaimerScreen';
import DashboardScreen from './DashboardScreen';
import CalculatorScreen from './CalculatorScreen';
import FirmProfileScreen from './FirmProfileScreen';
import JournalScreen from './JournalScreen';
import AnalyticsScreen from './AnalyticsScreen';
import LiquidityTrackerScreen from './LiquidityTrackerScreen';
import NewsCalendarScreen from './NewsCalendarScreen';
import LiveConnectionScreen from './LiveConnectionScreen';
import AlertSettingsScreen from './AlertSettingsScreen';
import SettingsScreen from './SettingsScreen';

export type { RootStackParamList };

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Dark shell matching app chrome; consumed by `NavigationContainer` in `App.tsx`. */
export const navigationTheme: Theme = {
  dark: true,
  colors: {
    primary: '#FFFFFF',
    background: '#0D1117',
    card: '#0D1117',
    text: '#FFFFFF',
    border: '#30363D',
    notification: '#FF453A',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '900' },
  },
};

/**
 * Root navigator. Two-phase render:
 *
 *   1. While `isReady === false` we show a plain centered spinner (NOT a Stack.Navigator).
 *      This is critical: a placeholder navigator with its own routes can cause React
 *      Navigation to hold the same nav instance across the gate flip, which previously
 *      kept focus on the wrong route after `setDisclaimerAccepted(true)` ran.
 *
 *   2. Once ready, render either the gate stack (key="gate") or the main stack
 *      (key="main"). The differing `key` props guarantee a clean unmount + remount,
 *      so `initialRouteName="Dashboard"` is honored when the user accepts.
 */
const AppNavigator = () => {
  const [isReady, setIsReady] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  useDrawdownMonitor();

  const trialLoading = useTrialStore((s) => s.isLoading);
  const trialStatus = useTrialStore((s) => s.status);

  useEffect(() => {
    initializePurchases();
    void syncProStatus();
  }, []);

  useEffect(() => {
    void requestNotificationPermissions();
  }, []);

  useEffect(() => {
    const checkDisclaimer = async () => {
      try {
        const accepted = await readDisclaimerAccepted();
        setDisclaimerAccepted(accepted);
      } catch {
        setDisclaimerAccepted(false);
      } finally {
        setIsReady(true);
      }
    };
    checkDisclaimer();
  }, []);

  /** Cold-start trial check — only runs after mount, never at module load. */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      while (!cancelled) {
        try {
          const result = await checkTrialStatus();
          if (cancelled) return;
          useTrialStore.getState().setTrialStatus(result);
          if (result.status === 'new' && result.expiresAt) {
            await scheduleTrialWarningNotifications(result.expiresAt);
          }
          return;
        } catch (err) {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : '';
          if (message.startsWith('Trial API error')) {
            useTrialStore.getState().setError(message);
            return;
          }
          console.warn('Trial check failed, using temporary access:', err);
          useTrialStore.getState().setTrialStatus(createOfflineTrialFallback());
          return;
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Periodic trial refresh while the app is open. */
  useEffect(() => {
    if (trialLoading || trialStatus === 'loading') return;

    const intervalId = setInterval(() => {
      void refreshTrialCountdown()
        .then((result) => {
          useTrialStore.getState().setTrialStatus(result);
          if (result.status === 'expired') {
            useTrialStore.getState().setContinuedWithFree(false);
          }
        })
        .catch(() => {
          useTrialStore.getState().setError('Trial refresh failed');
        });
    }, 60_000);

    return () => clearInterval(intervalId);
  }, [trialLoading, trialStatus]);

  if (!isReady || trialLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0D1117',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator color="#00D4AA" />
      </View>
    );
  }

  if (!disclaimerAccepted) {
    return (
      <Stack.Navigator key="gate" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Disclaimer">
          {() => <DisclaimerScreen onAccept={() => setDisclaimerAccepted(true)} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      key="main"
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D1117' },
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen name="Calculator" component={CalculatorScreen} />
      <Stack.Screen name="FirmProfile" component={FirmProfileScreen} />
      <Stack.Screen name="Journal" component={JournalScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="LiquidityTracker" component={LiquidityTrackerScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="AlertSettings" component={AlertSettingsScreen} />
      <Stack.Screen name="NewsCalendar" component={NewsCalendarScreen} />
      <Stack.Screen name="LiveConnection" component={LiveConnectionScreen} />
    </Stack.Navigator>
  );
};

export { AppNavigator };
