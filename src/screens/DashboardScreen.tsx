import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { APP_CONFIG } from '../constants';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import {
  useLiveConnectionStore,
  type LiveConnection,
} from '../store/useLiveConnectionStore';
import { useTrialGate } from '../hooks/useTrialGate';
import TrialBanner from '../components/TrialBanner';
import type { FirmProfile } from '../types';
import {
  calculateDrawdownFloor,
  calculateDailyLossLimit,
  calculateMaxLossLimit,
  calculatePercentageConsumed,
  formatCurrency,
  formatPercent,
  getAlertLevel,
} from '../utils';

import type { RootStackParamList } from '../types';

/** Maps aggregate alert band to the card / meter accent palette. */
function alertLevelToColor(level: ReturnType<typeof getAlertLevel>): string {
  switch (level) {
    case 'SAFE':
      return '#00D4AA';
    case 'CAUTION':
      return '#F6C90E';
    case 'WARNING':
      return '#F97316';
    case 'CRITICAL':
      return '#EF4444';
    default:
      return '#00D4AA';
  }
}

/**
 * Offline heuristics for challenge health using only persisted profile fields:
 * - Loss vs nominal account size drives daily / max utilization.
 * - Profit progress compares equity above starting size to the profit target.
 */
function computeProfileMetrics(profile: FirmProfile) {
  const dailyLimitDollars = calculateDailyLossLimit(
    profile.accountSize,
    profile.dailyLossLimitPercent,
  );
  const maxLimitDollars = calculateMaxLossLimit(profile.accountSize, profile.maxLossLimitPercent);

  const lossFromNominal = Math.max(0, profile.accountSize - profile.currentEquity);

  const dailyConsumedPct = calculatePercentageConsumed(lossFromNominal, dailyLimitDollars);
  const maxConsumedPct = calculatePercentageConsumed(lossFromNominal, maxLimitDollars);

  const targetProfitDollars = (profile.accountSize * profile.profitTargetPercent) / 100;
  const profitGain = Math.max(0, profile.currentEquity - profile.accountSize);
  const profitProgressPct =
    targetProfitDollars > 0
      ? Math.min(100, calculatePercentageConsumed(profitGain, targetProfitDollars))
      : 0;

  const peakForFloor = Math.max(
    profile.highestEquityPeak,
    profile.accountSize,
    profile.allTimeHighBalance,
  );
  const drawdownFloor = calculateDrawdownFloor(peakForFloor, profile.maxLossLimitPercent);

  const overallStressPct = Math.min(100, Math.max(dailyConsumedPct, maxConsumedPct));
  const alertLevel = getAlertLevel(overallStressPct);

  return {
    dailyConsumedPct,
    maxConsumedPct,
    profitProgressPct,
    drawdownFloor,
    alertLevel,
    accent: alertLevelToColor(alertLevel),
  };
}

function formatLastSeenHours(iso: string | null): string {
  if (!iso) return 'Unknown';
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60));
  if (hours < 1) return 'Less than 1 hour ago';
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

function LivePulseDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.liveDot, { backgroundColor: '#00D4AA', opacity }]}
    />
  );
}

function LiveStatusDot({ color }: { color: string }) {
  return <View style={[styles.liveDot, { backgroundColor: color }]} />;
}

function LiveStatusBar({ connection }: { connection: LiveConnection }) {
  if (connection.status === 'connected') {
    const balance = connection.lastData?.balance ?? 0;
    const equity = connection.lastData?.equity ?? 0;

    return (
      <View style={styles.liveStatusBar}>
        <View style={styles.liveStatusLeft}>
          <LivePulseDot />
          <Text style={styles.liveStatusConnectedLabel}>LIVE</Text>
        </View>
        <Text style={styles.liveStatusValues}>
          {formatCurrency(balance)} · {formatCurrency(equity)}
        </Text>
      </View>
    );
  }

  if (connection.status === 'pending') {
    return (
      <View style={styles.liveStatusBar}>
        <View style={styles.liveStatusLeft}>
          <LiveStatusDot color="#F6C90E" />
          <Text style={styles.liveStatusPendingLabel}>CONNECTING...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.liveStatusBar}>
      <View style={styles.liveStatusLeft}>
        <LiveStatusDot color="#EF4444" />
        <Text style={styles.liveStatusDisconnectedLabel}>DISCONNECTED</Text>
      </View>
      <Text style={styles.liveStatusLastSeen}>
        Last seen: {formatLastSeenHours(connection.lastSeen)}
      </Text>
    </View>
  );
}

export interface ProfileCardProps {
  profile: FirmProfile;
  onPress: () => void;
  onCalculatorPress: () => void;
  onToolsPress: () => void;
  showLiveStatus?: boolean;
}

function ProgressTrack({
  label,
  percent,
  fillColor,
}: {
  label: string;
  percent: number;
  fillColor: string;
}) {
  const widthPct = Math.min(100, Math.max(0, percent));
  return (
    <View style={styles.meterBlock}>
      <View style={styles.meterLabelRow}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterValue}>{formatPercent(Math.min(widthPct, 999), 1)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${widthPct}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

export function ProfileCard({
  profile,
  onPress,
  onCalculatorPress,
  onToolsPress,
  showLiveStatus = true,
}: ProfileCardProps) {
  const m = computeProfileMetrics(profile);
  const liveConnection = useLiveConnectionStore((s) =>
    showLiveStatus ? s.connections.find((c) => c.profileId === profile.id) : undefined,
  );

  return (
    <View style={[styles.card, { borderLeftColor: m.accent }]}>
      <Text style={styles.cardTitle}>{profile.firmName}</Text>
      <Text style={styles.cardSubtitle}>{profile.challengeName}</Text>

      <Text style={styles.accountSizeLabel}>Account size</Text>
      <Text style={styles.accountSizeValue}>{formatCurrency(profile.accountSize)}</Text>

      <ProgressTrack label="Daily loss limit used" percent={m.dailyConsumedPct} fillColor={m.accent} />
      <ProgressTrack label="Max loss limit used" percent={m.maxConsumedPct} fillColor={m.accent} />
      <ProgressTrack
        label="Profit target progress"
        percent={m.profitProgressPct}
        fillColor="#00D4AA"
      />

      <View style={styles.balanceRow}>
        <View style={styles.balanceCol}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>{formatCurrency(profile.currentBalance)}</Text>
        </View>
        <View style={styles.balanceCol}>
          <Text style={styles.balanceLabel}>Equity</Text>
          <Text style={styles.balanceValue}>{formatCurrency(profile.currentEquity)}</Text>
        </View>
      </View>

      <Text style={styles.floorLabel}>Drawdown floor (max loss from peak)</Text>
      <Text style={styles.floorValue}>{formatCurrency(m.drawdownFloor)}</Text>

      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={onCalculatorPress}
        >
          <Text style={styles.primaryBtnText}>Open Calculator</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          onPress={onPress}
        >
          <Text style={styles.secondaryBtnText}>View Details</Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.toolsBtn, pressed && styles.secondaryBtnPressed]}
        onPress={onToolsPress}
      >
        <Text style={styles.toolsBtnText}>Trading Tools</Text>
        <Text style={styles.toolsBtnChevron}>›</Text>
      </Pressable>

      {liveConnection ? <LiveStatusBar connection={liveConnection} /> : null}
    </View>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profiles = useFirmProfileStore((s) => s.profiles);
  const connections = useLiveConnectionStore((s) => s.connections);
  const { showLiveFeatures, status } = useTrialGate();

  const hasActiveLiveConnection =
    showLiveFeatures &&
    connections.some((c) => c.status === 'connected');

  const activeProfiles = useMemo(() => profiles, [profiles]);

  const aggregate = useMemo(() => {
    let totalCapital = 0;
    let safe = 0;
    let warnCrit = 0;

    for (const p of activeProfiles) {
      totalCapital += p.accountSize;
      const level = computeProfileMetrics(p).alertLevel;
      if (level === 'SAFE') safe += 1;
      if (level === 'WARNING' || level === 'CRITICAL') warnCrit += 1;
    }

    return { totalCapital, safe, warnCrit };
  }, [activeProfiles]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{APP_CONFIG.appName}</Text>
        <View style={styles.headerRight}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeProfiles.length}</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('LiveConnection')}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Open live connections"
          >
            <View style={styles.liveHeaderBtn}>
              {hasActiveLiveConnection ? (
                <View style={styles.headerLiveDot} accessibilityLabel="Live connection active" />
              ) : null}
              <Text style={styles.settingsBtnText}>Live</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('NewsCalendar')}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Open news calendar"
          >
            <Text style={styles.settingsBtnText}>News</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              navigation.navigate('FirmProfile', { profileId: undefined, isEditing: false })
            }
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add profile"
          >
            <Text style={styles.settingsBtnText}>Add</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [styles.settingsBtn, pressed && styles.settingsBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Text style={styles.settingsBtnText}>Settings</Text>
          </Pressable>
        </View>
      </View>

      {(status === 'active' || status === 'new') ? (
        <TrialBanner />
      ) : null}

      <View style={styles.summaryBar}>
        <Text style={styles.summaryLine}>
          Total challenge capital:{' '}
          <Text style={styles.summaryEmphasis}>{formatCurrency(aggregate.totalCapital)}</Text>
        </Text>
        <Text style={styles.summaryLine}>
          Safe profiles: <Text style={styles.summarySafe}>{aggregate.safe}</Text>
          {' · '}
          Warning/Critical: <Text style={styles.summaryRisk}>{aggregate.warnCrit}</Text>
        </Text>
      </View>

      {activeProfiles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon} accessibilityLabel="Shield icon">
            🛡️
          </Text>
          <Text style={styles.emptyTitle}>No Challenges Yet</Text>
          <Text style={styles.emptySub}>Add your first prop firm profile to get started</Text>
          <Pressable
            style={({ pressed }) => [styles.emptyCta, pressed && styles.primaryBtnPressed]}
            onPress={() =>
              navigation.navigate('FirmProfile', { profileId: undefined, isEditing: false })
            }
          >
            <Text style={styles.primaryBtnText}>Add Profile</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeProfiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              showLiveStatus={showLiveFeatures}
              onPress={() =>
                navigation.navigate('FirmProfile', { profileId: profile.id, isEditing: true })
              }
              onCalculatorPress={() =>
                navigation.navigate('Calculator', { profileId: profile.id })
              }
              onToolsPress={() =>
                navigation.navigate('ProfileTools', { profileId: profile.id })
              }
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'column',
    paddingHorizontal: 16,
  },
  headerTitle: {
    alignSelf: 'stretch',
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#30363D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  settingsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  settingsBtnPressed: {
    opacity: 0.85,
  },
  settingsBtnText: {
    color: '#A0AEC0',
    fontWeight: '600',
    fontSize: 14,
  },
  liveHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D4AA',
  },
  liveStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginHorizontal: -16,
    marginBottom: -16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E2530',
  },
  liveStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveStatusConnectedLabel: {
    color: '#00D4AA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveStatusPendingLabel: {
    color: '#F6C90E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveStatusDisconnectedLabel: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveStatusValues: {
    color: '#A0AEC0',
    fontSize: 11,
    fontWeight: '600',
  },
  liveStatusLastSeen: {
    color: '#718096',
    fontSize: 10,
  },
  summaryBar: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  summaryLine: {
    color: '#A0AEC0',
    fontSize: 14,
    marginBottom: 4,
  },
  summaryEmphasis: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summarySafe: {
    color: '#00D4AA',
    fontWeight: '700',
  },
  summaryRisk: {
    color: '#F97316',
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#A0AEC0',
    marginBottom: 12,
  },
  accountSizeLabel: {
    fontSize: 12,
    color: '#A0AEC0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountSizeValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  meterBlock: {
    marginBottom: 10,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  meterLabel: {
    fontSize: 13,
    color: '#A0AEC0',
  },
  meterValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2D3748',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  balanceCol: {
    flex: 1,
    backgroundColor: '#0D1117',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  balanceLabel: {
    fontSize: 12,
    color: '#A0AEC0',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  floorLabel: {
    fontSize: 12,
    color: '#A0AEC0',
    marginBottom: 2,
  },
  floorValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  toolsBtn: {
    marginTop: 10,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363D',
    backgroundColor: 'transparent',
  },
  toolsBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  toolsBtnChevron: {
    color: '#A0AEC0',
    fontSize: 18,
    marginTop: -1,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#00D4AA',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: '#0D1117',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
    backgroundColor: 'transparent',
  },
  secondaryBtnPressed: {
    opacity: 0.85,
  },
  secondaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 15,
    color: '#A0AEC0',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyCta: {
    backgroundColor: '#00D4AA',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
  },
});
