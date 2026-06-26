import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import ProGate, { type PurchaseAction } from '../components/ProGate';
import { useTrialGate } from '../hooks/useTrialGate';
import {
  purchaseAnnualPro,
  purchaseMonthlyPro,
  restorePurchases,
} from '../services/revenueCat';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileTools'>;

const TOOLS_PRO_BULLETS = [
  'Trade journal with full history',
  'Performance analytics and stats',
  'Liquidity level tracking',
  'Available across all your firm profiles',
];

const TOOL_ROWS = [
  {
    key: 'journal' as const,
    label: 'Trade Journal',
    description: 'Log trades, outcomes, and notes for this profile',
    route: 'Journal' as const,
  },
  {
    key: 'analytics' as const,
    label: 'Analytics',
    description: 'Win rate, P&L stats, and performance breakdowns',
    route: 'Analytics' as const,
  },
  {
    key: 'liquidity' as const,
    label: 'Liquidity Tracker',
    description: 'Track PDH/PDL, weekly highs/lows, and sweep status',
    route: 'LiquidityTracker' as const,
  },
];

export default function ProfileToolsScreen({ navigation, route }: Props) {
  const { profileId } = route.params;
  const profiles = useFirmProfileStore((s) => s.profiles);
  const { isProOrTrial } = useTrialGate();
  const [purchaseLoading, setPurchaseLoading] = useState<PurchaseAction>(null);

  const profile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId],
  );

  const profileLabel = profile
    ? `${profile.firmName} · ${profile.challengeName}`
    : '';

  const handleRestore = useCallback(async () => {
    setPurchaseLoading('restore');
    const result = await restorePurchases();
    setPurchaseLoading(null);
    if (result.success) return;
    Alert.alert('Restore failed', result.error ?? 'No active subscription found.');
  }, []);

  const handleMonthly = useCallback(async () => {
    setPurchaseLoading('monthly');
    const result = await purchaseMonthlyPro();
    setPurchaseLoading(null);
    if (result.success) return;
    if (result.error !== 'cancelled') {
      Alert.alert('Purchase failed', result.error ?? 'Unable to complete purchase.');
    }
  }, []);

  const handleAnnual = useCallback(async () => {
    setPurchaseLoading('annual');
    const result = await purchaseAnnualPro();
    setPurchaseLoading(null);
    if (result.success) return;
    if (result.error !== 'cancelled') {
      Alert.alert('Purchase failed', result.error ?? 'Unable to complete purchase.');
    }
  }, []);

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Trading Tools</Text>
        </View>
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isProOrTrial) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ProGate
          purchaseLoading={purchaseLoading}
          onAnnual={() => void handleAnnual()}
          onMonthly={() => void handleMonthly()}
          onRestore={() => void handleRestore()}
          icon="📊"
          title="Pro Trading Tools"
          description="Unlock the full trading toolkit for every profile — journal your trades, analyze your performance, and track key liquidity levels."
          bullets={TOOLS_PRO_BULLETS}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Trading Tools</Text>
        <Text style={styles.headerSubtitle}>{profileLabel}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionBody}>
          {TOOL_ROWS.map((tool, index) => (
            <React.Fragment key={tool.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => navigation.navigate(tool.route, { profileId })}
              >
                <View style={styles.actionRowText}>
                  <Text style={styles.actionRowLabel}>{tool.label}</Text>
                  <Text style={styles.actionRowCaption}>{tool.description}</Text>
                </View>
                <Text style={styles.actionRowChevron}>›</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 12,
    marginBottom: 4,
  },
  backBtnPressed: {
    opacity: 0.85,
  },
  backBtnText: {
    color: '#00D4AA',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#A0AEC0',
    fontSize: 14,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionBody: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  actionRowPressed: {
    opacity: 0.85,
  },
  actionRowText: {
    flex: 1,
    marginRight: 8,
  },
  actionRowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionRowCaption: {
    color: '#A0AEC0',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  actionRowChevron: {
    color: '#A0AEC0',
    fontSize: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2D3748',
    marginHorizontal: 14,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notFoundText: {
    color: '#A0AEC0',
    fontSize: 16,
  },
});
