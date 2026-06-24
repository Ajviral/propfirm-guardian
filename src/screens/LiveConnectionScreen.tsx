import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLiveAccount } from '../hooks/useLiveAccount';
import { useTrialGate } from '../hooks/useTrialGate';
import TrialBanner from '../components/TrialBanner';
import {
  purchaseAnnualPro,
  purchaseMonthlyPro,
  registerConnectionToken,
  restorePurchases,
} from '../services/revenueCat';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import {
  useLiveConnectionStore,
  type LiveConnection,
  type LiveConnectionStatus,
} from '../store/useLiveConnectionStore';
import type { FirmProfile, VerdictType } from '../types';
import {
  calculateDailyLossLimit,
  calculateMaxLossLimit,
  calculatePercentageConsumed,
  formatCurrency,
  formatPercent,
  getAlertLevel,
} from '../utils';
import {
  formatTokenForDisplay,
  generateAccountToken,
  getEADownloadUrl,
  getSetupEmailBody,
  LIVE_SERVER_HTTPS,
} from '../utils/tokenUtils';

function statusColor(status: LiveConnectionStatus): string {
  switch (status) {
    case 'connected':
      return '#00D4AA';
    case 'pending':
      return '#F6C90E';
    case 'disconnected':
    case 'error':
    default:
      return '#EF4444';
  }
}

function formatSecondsAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} second${diffSec === 1 ? '' : 's'} ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

function computeLiveVerdict(profile: FirmProfile, equity: number): VerdictType {
  const dailyLimit = calculateDailyLossLimit(profile.accountSize, profile.dailyLossLimitPercent);
  const maxLimit = calculateMaxLossLimit(profile.accountSize, profile.maxLossLimitPercent);
  const loss = Math.max(0, profile.accountSize - equity);
  const stress = Math.max(
    calculatePercentageConsumed(loss, dailyLimit),
    calculatePercentageConsumed(loss, maxLimit),
  );
  const level = getAlertLevel(stress);
  if (level === 'SAFE') return 'PASS';
  if (level === 'CRITICAL') return 'FAIL';
  return 'CAUTION';
}

function verdictColor(v: VerdictType): string {
  if (v === 'PASS') return '#00D4AA';
  if (v === 'FAIL') return '#EF4444';
  return '#F6C90E';
}

// --- Pro upgrade gate -------------------------------------------------------

type PurchaseAction = 'monthly' | 'annual' | 'restore' | null;

function ProGate({
  purchaseLoading,
  onAnnual,
  onMonthly,
  onRestore,
}: {
  purchaseLoading: PurchaseAction;
  onAnnual: () => void;
  onMonthly: () => void;
  onRestore: () => void;
}) {
  return (
    <View style={styles.proGate}>
      <Text style={styles.proIcon}>🛡️</Text>
      <Text style={styles.proTitle}>Live Account Monitoring</Text>
      <Text style={styles.proBadge}>Pro Feature</Text>
      <Text style={styles.proDesc}>
        Connect your MT5 account for real-time drawdown alerts, live equity tracking, and
        instant notifications when your limits are approaching.
      </Text>
      <Text style={styles.proBullet}>• Real-time balance and equity from your MT5 terminal</Text>
      <Text style={styles.proBullet}>• Live drawdown vs daily and max loss limits</Text>
      <Text style={styles.proBullet}>• Open positions count and floating P&L</Text>
      <Text style={styles.proBullet}>• Instant PASS / CAUTION / FAIL verdict from live data</Text>
      <View style={styles.bestValueBadge}>
        <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
      </View>
      <Pressable
        style={styles.upgradeBtn}
        onPress={onAnnual}
        disabled={purchaseLoading !== null}
      >
        {purchaseLoading === 'annual' ? (
          <ActivityIndicator color="#0D1117" />
        ) : (
          <>
            <Text style={styles.upgradeBtnText}>Annual — $99.99 first year</Text>
            <Text style={styles.upgradeBtnSubText}>Save 35%+ vs monthly, every year</Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.upgradeBtn, styles.upgradeBtnSecondary]}
        onPress={onMonthly}
        disabled={purchaseLoading !== null}
      >
        {purchaseLoading === 'monthly' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.upgradeBtnTextSecondary}>Monthly — $19.99/month</Text>
        )}
      </Pressable>
      <Pressable style={styles.restoreLink} onPress={onRestore} disabled={purchaseLoading !== null}>
        {purchaseLoading === 'restore' ? (
          <ActivityIndicator color="#00D4AA" size="small" />
        ) : (
          <Text style={styles.restoreLinkText}>Restore purchases</Text>
        )}
      </Pressable>
    </View>
  );
}

// --- Connection card --------------------------------------------------------

function ConnectionCard({
  connection,
  profile,
  onDelete,
}: {
  connection: LiveConnection;
  profile: FirmProfile | undefined;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = statusColor(connection.status);
  const data = connection.lastData;

  const onLongPress = () => {
    Alert.alert('Remove connection?', `Delete "${connection.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Pressable
      style={styles.card}
      onPress={() => setExpanded((e) => !e)}
      onLongPress={onLongPress}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{connection.label}</Text>
          <Text style={styles.cardSub}>
            {data?.accountServer ?? profile?.firmName ?? 'Awaiting MT5 push'}
          </Text>
        </View>
      </View>
      <Text style={styles.lastSeen}>Last update: {formatSecondsAgo(connection.lastSeen)}</Text>
      {connection.status === 'connected' && data ? (
        <Text style={styles.cardMetrics}>
          Balance {formatCurrency(data.balance)} · Equity {formatCurrency(data.equity)}
        </Text>
      ) : null}
      {expanded && data ? (
        <View style={styles.cardExpanded}>
          <Text style={styles.cardDetail}>
            Floating P&L:{' '}
            <Text style={{ color: data.floatingPnL >= 0 ? '#00D4AA' : '#EF4444' }}>
              {formatCurrency(data.floatingPnL)}
            </Text>
          </Text>
          <Text style={styles.cardDetail}>Margin level: {formatPercent(data.marginLevel, 1)}</Text>
          <Text style={styles.cardDetail}>Open positions: {data.positions.length}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// --- Main screen ------------------------------------------------------------

export default function LiveConnectionScreen() {
  const { isProOrTrial } = useTrialGate();
  const profiles = useFirmProfileStore((s) => s.profiles);
  const connections = useLiveConnectionStore((s) => s.connections);
  const addConnection = useLiveConnectionStore((s) => s.addConnection);
  const removeConnection = useLiveConnectionStore((s) => s.removeConnection);

  const [label, setLabel] = useState('');
  const [profileId, setProfileId] = useState<string | null>(
    profiles.length > 0 ? profiles[0].id : null,
  );
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const [purchaseLoading, setPurchaseLoading] = useState<PurchaseAction>(null);

  const pulse = useRef(new Animated.Value(0.4)).current;

  const { liveData, status, lastSeen, checkConnection, isConnected } = useLiveAccount(setupToken);

  const linkedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) ?? null,
    [profiles, profileId],
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isConnected]);

  const onGenerateToken = useCallback(() => {
    if (!label.trim()) {
      Alert.alert('Label required', 'Enter a name for this connection.');
      return;
    }
    if (!profileId) {
      Alert.alert('Profile required', 'Link this connection to a firm profile.');
      return;
    }

    const token = generateAccountToken();
    addConnection({
      token,
      label: label.trim(),
      profileId,
      serverUrl: LIVE_SERVER_HTTPS,
      status: 'pending',
      lastSeen: null,
      lastData: null,
      createdAt: new Date().toISOString(),
    });
    setSetupToken(token);
    setCopied(false);
    void registerConnectionToken(token);
  }, [label, profileId, addConnection]);

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

  const onCopyToken = useCallback(async () => {
    if (!setupToken) return;
    await Clipboard.setStringAsync(setupToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [setupToken]);

  const onEmailGuide = useCallback(() => {
    if (!setupToken) return;
    const subject = encodeURIComponent('PropFirm Guardian — MT5 Setup');
    const body = encodeURIComponent(getSetupEmailBody(setupToken, label || 'MT5 Account'));
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
  }, [setupToken, label]);

  const onDownloadEA = useCallback(() => {
    Linking.openURL(getEADownloadUrl());
  }, []);

  const liveVerdict =
    linkedProfile && liveData ? computeLiveVerdict(linkedProfile, liveData.equity) : null;

  const dailyLimit =
    linkedProfile && liveData
      ? calculateDailyLossLimit(linkedProfile.accountSize, linkedProfile.dailyLossLimitPercent)
      : 0;
  const maxLimit =
    linkedProfile && liveData
      ? calculateMaxLossLimit(linkedProfile.accountSize, linkedProfile.maxLossLimitPercent)
      : 0;
  const lossFromNominal =
    linkedProfile && liveData ? Math.max(0, linkedProfile.accountSize - liveData.equity) : 0;
  const dailyConsumed = calculatePercentageConsumed(lossFromNominal, dailyLimit);
  const maxConsumed = calculatePercentageConsumed(lossFromNominal, maxLimit);

  if (!isProOrTrial) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <ProGate
          purchaseLoading={purchaseLoading}
          onAnnual={() => void handleAnnual()}
          onMonthly={() => void handleMonthly()}
          onRestore={() => void handleRestore()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <TrialBanner showExpiryOverlay />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.screenTitle}>Live Connections</Text>

        {/* Section 2 — Connected accounts */}
        {connections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No live connections yet</Text>
            <Text style={styles.emptySub}>Add your MT5 account below to get started</Text>
          </View>
        ) : (
          connections.map((c) => (
            <ConnectionCard
              key={c.token}
              connection={c}
              profile={profiles.find((p) => p.id === c.profileId)}
              onDelete={() => {
                if (setupToken === c.token) setSetupToken(null);
                removeConnection(c.token);
              }}
            />
          ))
        )}

        {/* Section 3 — Add new connection */}
        {!setupToken ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Connect MT5 Account</Text>
            <Text style={styles.inputLabel}>Connection label</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. FundedNext $100k Challenge"
              placeholderTextColor="#4A5568"
              value={label}
              onChangeText={setLabel}
            />
            <Text style={styles.inputLabel}>Link to profile</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {profiles.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.chip, profileId === p.id && styles.chipActive]}
                  onPress={() => setProfileId(p.id)}
                >
                  <Text style={[styles.chipText, profileId === p.id && styles.chipTextActive]}>
                    {p.firmName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {profiles.length === 0 ? (
              <Text style={styles.hint}>Create a firm profile on the Dashboard first.</Text>
            ) : null}
            <Pressable style={styles.primaryBtn} onPress={onGenerateToken}>
              <Text style={styles.primaryBtnText}>Generate Connection Token</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Section 4 — Token display */}
        {setupToken ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Your Connection Token</Text>
            <View style={styles.tokenBox}>
              <Text style={styles.tokenText} selectable>
                {formatTokenForDisplay(setupToken)}
              </Text>
            </View>
            <View style={styles.tokenActions}>
              <Pressable style={styles.secondaryBtn} onPress={onCopyToken}>
                <Text style={styles.secondaryBtnText}>{copied ? 'Copied!' : 'Copy Token'}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={onEmailGuide}>
                <Text style={styles.secondaryBtnText}>Email Setup Guide</Text>
              </Pressable>
            </View>
            <Pressable onPress={onDownloadEA}>
              <Text style={styles.link}>Download EA File</Text>
            </Pressable>

            <View style={styles.divider} />

            {!isConnected ? (
              <>
                <Text style={styles.sectionLabel}>Waiting for Connection...</Text>
                <Animated.View style={[styles.pulseDot, { opacity: pulse }]} />
                <Text style={styles.waitText}>
                  Open MT5 on your computer, attach the EA with your token, and live data will
                  appear here automatically.
                </Text>
                <Text style={styles.statusHint}>Status: {status}</Text>
                <Pressable style={styles.primaryBtn} onPress={() => void checkConnection()}>
                  <Text style={styles.primaryBtnText}>Check Connection</Text>
                </Pressable>
              </>
            ) : (
              /* Section 5 — Live data panel */
              <View>
                <Text style={styles.sectionLabel}>Live Data</Text>
                <View style={styles.liveRow}>
                  <View style={styles.liveStat}>
                    <Text style={styles.liveStatLabel}>Balance</Text>
                    <Text style={styles.liveStatValue}>
                      {formatCurrency(liveData?.balance ?? 0)}
                    </Text>
                  </View>
                  <View style={styles.liveStat}>
                    <Text style={styles.liveStatLabel}>Equity</Text>
                    <Text style={styles.liveStatValue}>
                      {formatCurrency(liveData?.equity ?? 0)}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.pnl,
                    { color: (liveData?.floatingPnL ?? 0) >= 0 ? '#00D4AA' : '#EF4444' },
                  ]}
                >
                  Floating P&L: {formatCurrency(liveData?.floatingPnL ?? 0)}
                </Text>
                <Text style={styles.liveDetail}>
                  Margin level: {formatPercent(liveData?.marginLevel ?? 0, 1)}
                </Text>
                {linkedProfile ? (
                  <>
                    <Text style={styles.liveDetail}>
                      Daily drawdown: {formatPercent(dailyConsumed, 1)} of{' '}
                      {formatPercent(linkedProfile.dailyLossLimitPercent, 1)} limit
                    </Text>
                    <Text style={styles.liveDetail}>
                      Max drawdown: {formatPercent(maxConsumed, 1)} of{' '}
                      {formatPercent(linkedProfile.maxLossLimitPercent, 1)} limit
                    </Text>
                  </>
                ) : null}
                {liveVerdict ? (
                  <View
                    style={[styles.verdictBadge, { borderColor: verdictColor(liveVerdict) }]}
                  >
                    <Text style={[styles.verdictText, { color: verdictColor(liveVerdict) }]}>
                      {liveVerdict}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.liveDetail}>
                  Open positions: {liveData?.positions.length ?? 0}
                </Text>
                <Text style={styles.lastSeen}>
                  Last update: {formatSecondsAgo(lastSeen)} ({tick > 0 ? 'live' : ''})
                </Text>
              </View>
            )}
          </View>
        ) : null}

        <Text style={styles.disclaimer}>
          Live data is provided for informational purposes only. Always verify with your broker
          before making trading decisions.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1117' },
  scroll: { padding: 16, paddingBottom: 32 },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00D4AA',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  cardHeaderText: { flex: 1 },
  cardTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  cardSub: { color: '#A0AEC0', fontSize: 12, marginTop: 2 },
  lastSeen: { color: '#718096', fontSize: 12, marginTop: 4 },
  cardMetrics: { color: '#A0AEC0', fontSize: 13, marginTop: 6 },
  cardExpanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#30363D' },
  cardDetail: { color: '#A0AEC0', fontSize: 13, marginBottom: 4 },
  emptyCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  emptyTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  emptySub: { color: '#A0AEC0', fontSize: 13, marginTop: 6, textAlign: 'center' },
  inputLabel: { color: '#A0AEC0', fontSize: 12, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#30363D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },
  chipRow: { marginVertical: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1A202C',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  chipActive: { borderColor: '#00D4AA', backgroundColor: '#0D1117' },
  chipText: { color: '#A0AEC0', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#00D4AA' },
  hint: { color: '#718096', fontSize: 12, marginBottom: 8 },
  primaryBtn: {
    backgroundColor: '#00D4AA',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#0D1117', fontWeight: '800', fontSize: 15 },
  tokenBox: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#00D4AA',
    borderRadius: 8,
    padding: 14,
  },
  tokenText: {
    color: '#00D4AA',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  tokenActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#2D3748',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  link: {
    color: '#00D4AA',
    fontWeight: '700',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#30363D',
    marginVertical: 16,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F6C90E',
    alignSelf: 'center',
    marginVertical: 12,
  },
  waitText: { color: '#A0AEC0', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  statusHint: { color: '#718096', fontSize: 12, textAlign: 'center', marginTop: 8 },
  liveRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  liveStat: { flex: 1 },
  liveStatLabel: { color: '#A0AEC0', fontSize: 12 },
  liveStatValue: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 4 },
  pnl: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  liveDetail: { color: '#A0AEC0', fontSize: 13, marginBottom: 6 },
  verdictBadge: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginVertical: 8,
  },
  verdictText: { fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  disclaimer: {
    color: '#4A5568',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  proGate: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proIcon: { fontSize: 48, marginBottom: 12 },
  proTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  proBadge: { color: '#F6C90E', fontWeight: '800', marginTop: 4, marginBottom: 16 },
  proDesc: { color: '#A0AEC0', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  proBullet: { color: '#A0AEC0', fontSize: 14, alignSelf: 'flex-start', marginBottom: 6 },
  upgradeBtn: {
    backgroundColor: '#00D4AA',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  upgradeBtnSecondary: {
    marginTop: 10,
    backgroundColor: '#2D3748',
  },
  upgradeBtnTextSecondary: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  bestValueBadge: {
    alignSelf: 'flex-start',
    marginTop: 16,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#0D1117',
    borderWidth: 1,
    borderColor: '#00D4AA',
  },
  bestValueBadgeText: {
    color: '#00D4AA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  upgradeBtnSubText: {
    color: '#0D1117',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.85,
  },
  restoreLink: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  restoreLinkText: {
    color: '#00D4AA',
    fontSize: 13,
    fontWeight: '600',
  },
});
