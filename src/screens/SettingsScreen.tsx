import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import * as Application from 'expo-application';

import { APP_CONFIG } from '../constants';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import { useJournalStore } from '../store/useJournalStore';
import { useLiquidityStore } from '../store/useLiquidityStore';
import {
  DEFAULT_SETTINGS,
  useSettingsStore,
  type SettingsState,
} from '../store/useSettingsStore';
import { useTrialStore } from '../store/useTrialStore';
import TrialCountdownDisplay from '../components/TrialCountdownDisplay';
import type { RootStackParamList } from '../types';
import {
  purchaseAnnualPro,
  purchaseMonthlyPro,
  restorePurchases,
} from '../services/revenueCat';
import {
  DISCLAIMER_ACCEPTED_AT_KEY,
  DISCLAIMER_ACCEPTED_KEY,
} from './DisclaimerScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/**
 * AsyncStorage keys the app writes to. These match the `name:` field on each
 * Zustand `persist` config plus the disclaimer flags. Used by Reset all data.
 */
const KNOWN_STORAGE_KEYS = [
  'firm-profile-store',
  'journal-store',
  'liquidity-store',
  'settings-store',
  DISCLAIMER_ACCEPTED_KEY,
  DISCLAIMER_ACCEPTED_AT_KEY,
] as const;

type PurchaseAction = 'monthly' | 'annual' | 'restore' | null;

export default function SettingsScreen({ navigation }: Props) {
  const settings = useSettingsStore();
  const isPro = useSettingsStore((s) => s.isPro);
  const trialStatus = useTrialStore((s) => s.status);
  const { updateSetting } = settings;
  const [purchaseLoading, setPurchaseLoading] = useState<PurchaseAction>(null);

  // Local string buffers for numeric inputs (we keep raw text so backspace etc. feels normal).
  const [riskBuf, setRiskBuf] = useState(String(settings.defaultRiskPercentage));

  const commitNum = (raw: string, fallback: number): number => {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const onResetAllData = () => {
    Alert.alert(
      'Reset all data?',
      'This will permanently delete every profile, journal entry, liquidity level, and saved setting on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Are you absolutely sure?',
              'This cannot be undone. The app will return to its initial state.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset everything',
                  style: 'destructive',
                  onPress: () => {
                    // Wipe persisted blobs first. AsyncStorage is async; the in-memory
                    // resets below run immediately so the UI updates without waiting.
                    AsyncStorage.multiRemove([...KNOWN_STORAGE_KEYS]).catch(() => {
                      // best-effort cleanup; per-key failures are non-fatal
                    });

                    // Also reset in-memory state so the UI doesn't keep showing stale data.
                    useFirmProfileStore.setState({ profiles: [], activeProfileId: null });
                    useJournalStore.setState({ trades: [] });
                    useLiquidityStore.setState({ levels: [] });
                    useSettingsStore.setState(DEFAULT_SETTINGS);

                    setRiskBuf(String(DEFAULT_SETTINGS.defaultRiskPercentage));

                    Alert.alert(
                      'Data cleared',
                      'All locally stored data has been removed. Restart the app for the cleanest state.',
                    );
                  },
                },
              ],
            ),
        },
      ],
    );
  };

  const placeholderAlert = (title: string, message: string) =>
    Alert.alert(title, message, [{ text: 'OK' }]);

  const onContactSupport = () => {
    Linking.openURL('mailto:grandmasterlabs01@gmail.com?subject=PropFirm Guardian Support').catch(
      () =>
        Alert.alert(
          'Unable to open email app',
          'Please email grandmasterlabs01@gmail.com',
        ),
    );
  };

  const onRateApp = () => {
    const pkg = 'com.giftobey.propfirmguardian';
    Linking.openURL(`market://details?id=${pkg}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`),
    );
  };

  const onOpenTerms = () => {
    Linking.openURL('https://ajviral.github.io/propfirm-guardian/terms.html').catch(() =>
      Alert.alert(
        'Unable to open link',
        'Please visit https://ajviral.github.io/propfirm-guardian/terms.html',
      ),
    );
  };

  const onOpenPrivacy = () => {
    Linking.openURL('https://ajviral.github.io/propfirm-guardian/privacy.html').catch(() =>
      Alert.alert(
        'Unable to open link',
        'Please visit https://ajviral.github.io/propfirm-guardian/privacy.html',
      ),
    );
  };

  const handleRestore = async () => {
    setPurchaseLoading('restore');
    const result = await restorePurchases();
    setPurchaseLoading(null);
    if (result.success) {
      Alert.alert('Restored', 'Your Pro subscription has been restored.');
      return;
    }
    Alert.alert('Restore failed', result.error ?? 'No active subscription found.');
  };

  const handleMonthly = async () => {
    setPurchaseLoading('monthly');
    const result = await purchaseMonthlyPro();
    setPurchaseLoading(null);
    if (result.success) return;
    if (result.error !== 'cancelled') {
      Alert.alert('Purchase failed', result.error ?? 'Unable to complete purchase.');
    }
  };

  const handleAnnual = async () => {
    setPurchaseLoading('annual');
    const result = await purchaseAnnualPro();
    setPurchaseLoading(null);
    if (result.success) return;
    if (result.error !== 'cancelled') {
      Alert.alert('Purchase failed', result.error ?? 'Unable to complete purchase.');
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* §1 App Preferences */}
          <Section title="App Preferences">
            <Row
              label="Currency Symbol"
              right={
                <TextInput
                  style={styles.inlineInput}
                  value={settings.currencySymbol}
                  onChangeText={(t) =>
                    updateSetting('currencySymbol', t.length > 0 ? t.slice(0, 3) : '$')
                  }
                  maxLength={3}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              }
            />
            <Divider />
            <Row
              label="Default Risk %"
              right={
                <TextInput
                  style={styles.inlineInputNumeric}
                  value={riskBuf}
                  onChangeText={setRiskBuf}
                  keyboardType="decimal-pad"
                  onBlur={() => {
                    const next = commitNum(riskBuf, settings.defaultRiskPercentage);
                    updateSetting('defaultRiskPercentage', next);
                    setRiskBuf(String(next));
                  }}
                />
              }
              caption="This pre-fills the calculator risk field"
            />
          </Section>

          {/* §2 Notifications */}
          <Section title="Notifications">
            <Pressable
              style={styles.actionRow}
              onPress={() => navigation.navigate('AlertSettings')}
            >
              <Text style={styles.actionRowLabel}>Alert Settings</Text>
              <Text style={styles.actionRowChevron}>›</Text>
            </Pressable>
            <Divider />
            <Row
              label="Enable notifications"
              right={
                <Switch
                  value={settings.notificationsEnabled}
                  onValueChange={(v) => updateSetting('notificationsEnabled', v)}
                  trackColor={{ false: '#2D3748', true: '#00D4AA' }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </Section>

          {/* §3 Security */}
          <Section title="Security">
            <Row
              label="Biometric Lock — Coming Soon"
              labelDisabled
              right={
                <Switch
                  value={false}
                  disabled
                  trackColor={{ false: '#2D3748', true: '#00D4AA' }}
                  thumbColor="#4A5568"
                />
              }
            />
            <Divider />
            <Row
              label="PIN Lock — Coming Soon"
              labelDisabled
              right={
                <Switch
                  value={false}
                  disabled
                  trackColor={{ false: '#2D3748', true: '#00D4AA' }}
                  thumbColor="#4A5568"
                />
              }
            />
          </Section>

          {/* §4 Data Management */}
          <Section title="Data Management">
            <Pressable
              style={styles.actionRow}
              onPress={() =>
                placeholderAlert('Export', 'Export feature coming in next update')
              }
            >
              <Text style={styles.actionRowLabel}>Export all data</Text>
              <Text style={styles.actionRowChevron}>›</Text>
            </Pressable>
            <Divider />
            <Row
              label="Cloud backup — Coming Soon"
              labelDisabled
              right={
                <Switch
                  value={false}
                  disabled
                  trackColor={{ false: '#2D3748', true: '#00D4AA' }}
                  thumbColor="#4A5568"
                />
              }
            />
            <Divider />
            <Pressable style={styles.destructiveBtn} onPress={onResetAllData}>
              <Text style={styles.destructiveBtnText}>Reset all data</Text>
            </Pressable>
          </Section>

          {/* §5 About */}
          <Section title="About">
            <Row
              label={`${APP_CONFIG.appName}`}
              caption={`Version ${Application.nativeApplicationVersion ?? '2.0.0'}`}
            />
            <Divider />
            <Pressable
              style={styles.actionRow}
              onPress={onOpenTerms}
            >
              <Text style={styles.actionRowLabel}>Terms of Service</Text>
              <Text style={styles.actionRowChevron}>›</Text>
            </Pressable>
            <Divider />
            <Pressable
              style={styles.actionRow}
              onPress={onOpenPrivacy}
            >
              <Text style={styles.actionRowLabel}>Privacy Policy</Text>
              <Text style={styles.actionRowChevron}>›</Text>
            </Pressable>
            <Divider />
            <Pressable
              style={styles.actionRow}
              onPress={onRateApp}
            >
              <Text style={styles.actionRowLabel}>Rate This App</Text>
              <Text style={styles.actionRowChevron}>›</Text>
            </Pressable>
            <Divider />
            <Pressable
              style={styles.actionRow}
              onPress={onContactSupport}
            >
              <Text style={styles.actionRowLabel}>Contact Support</Text>
              <Text style={styles.actionRowChevron}>›</Text>
            </Pressable>
          </Section>

          {/* §6 Subscription */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Subscription</Text>
            <View style={styles.sectionBody}>
              {isPro ? (
                <>
                  <View style={styles.proActiveBadge}>
                    <Text style={styles.proActiveText}>Pro Active ✓</Text>
                  </View>
                  <Text style={styles.subscriptionDesc}>
                    You have full access to all PropFirm Guardian features.
                  </Text>
                  <Pressable
                    style={styles.restoreLink}
                    onPress={() => void handleRestore()}
                    disabled={purchaseLoading !== null}
                  >
                    {purchaseLoading === 'restore' ? (
                      <ActivityIndicator color="#00D4AA" size="small" />
                    ) : (
                      <Text style={styles.restoreLinkText}>Restore purchases</Text>
                    )}
                  </Pressable>
                </>
              ) : trialStatus === 'active' || trialStatus === 'new' ? (
                <>
                  <Text style={styles.trialSectionLabel}>Free Trial:</Text>
                  <TrialCountdownDisplay color="#00D4AA" fontSize={24} variant="green" />
                  <Text style={styles.subscriptionDesc}>
                    Upgrade to Pro for live MT5 monitoring and push alerts. Save 35%+ with
                    the annual plan.
                  </Text>
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
                  </View>
                  <Pressable
                    style={styles.upgradeBtn}
                    onPress={() => void handleAnnual()}
                    disabled={purchaseLoading !== null}
                  >
                    {purchaseLoading === 'annual' ? (
                      <ActivityIndicator color="#0D1117" />
                    ) : (
                      <>
                        <Text style={styles.upgradeBtnText}>Annual — $99.99 first year</Text>
                        <Text style={styles.upgradeBtnSubText}>
                          Save 35%+ vs monthly, every year
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.upgradeBtn, styles.upgradeBtnSecondary]}
                    onPress={() => void handleMonthly()}
                    disabled={purchaseLoading !== null}
                  >
                    {purchaseLoading === 'monthly' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.upgradeBtnTextSecondary}>
                        Monthly — $9.99/mo for first 2 months
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.restoreLink}
                    onPress={() => void handleRestore()}
                    disabled={purchaseLoading !== null}
                  >
                    <Text style={styles.restoreLinkText}>Restore purchases</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.subscriptionHeading}>Upgrade to Pro</Text>
                  <Text style={styles.subscriptionDesc}>
                    {trialStatus === 'expired'
                      ? 'Your free trial has ended. Subscribe to restore live monitoring and alerts.'
                      : 'Get live MT5 account monitoring, real-time drawdown alerts, and push notifications.'}
                  </Text>
                  <Text style={styles.lockedItem}>• Live balance and equity tracking</Text>
                  <Text style={styles.lockedItem}>• Real-time drawdown alerts</Text>
                  <Text style={styles.lockedItem}>
                    • Push notifications at 50%, 75%, 90% of limits
                  </Text>
                  <Text style={styles.lockedItem}>• Margin level warnings</Text>
                  <Text style={styles.lockedItem}>• Unlimited firm profiles</Text>
                  <View style={styles.bestValueBadge}>
                    <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
                  </View>
                  <Pressable
                    style={styles.upgradeBtn}
                    onPress={() => void handleAnnual()}
                    disabled={purchaseLoading !== null}
                  >
                    {purchaseLoading === 'annual' ? (
                      <ActivityIndicator color="#0D1117" />
                    ) : (
                      <>
                        <Text style={styles.upgradeBtnText}>Annual — $99.99 first year</Text>
                        <Text style={styles.upgradeBtnSubText}>
                          Save 35%+ vs monthly, every year
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.upgradeBtn, styles.upgradeBtnSecondary]}
                    onPress={() => void handleMonthly()}
                    disabled={purchaseLoading !== null}
                  >
                    {purchaseLoading === 'monthly' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.upgradeBtnTextSecondary}>Monthly — $19.99/month</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.restoreLink}
                    onPress={() => void handleRestore()}
                    disabled={purchaseLoading !== null}
                  >
                    {purchaseLoading === 'restore' ? (
                      <ActivityIndicator color="#00D4AA" size="small" />
                    ) : (
                      <Text style={styles.restoreLinkText}>Restore purchases</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- Subcomponents --------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  caption,
  right,
  labelDisabled,
}: {
  label: string;
  caption?: string;
  right?: React.ReactNode;
  labelDisabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, labelDisabled && styles.disabledText]}>{label}</Text>
        {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  flex: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#00D4AA',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionBody: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
    marginRight: 8,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowCaption: {
    color: '#A0AEC0',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2D3748',
    marginHorizontal: 14,
  },
  inlineInput: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    minWidth: 64,
    textAlign: 'center',
  },
  inlineInputNumeric: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#FFFFFF',
    minWidth: 80,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  actionRowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionRowChevron: {
    color: '#A0AEC0',
    fontSize: 20,
  },
  destructiveBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2D3748',
  },
  destructiveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  disabledText: {
    color: '#4A5568',
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#F6C90E',
    marginBottom: 12,
  },
  planBadgeText: {
    color: '#F6C90E',
    fontWeight: '800',
    letterSpacing: 1,
    fontSize: 12,
  },
  lockedTitle: {
    color: '#A0AEC0',
    fontWeight: '700',
    marginBottom: 6,
    fontSize: 13,
  },
  lockedItem: {
    color: '#4A5568',
    fontSize: 13,
    marginBottom: 4,
  },
  upgradeBtn: {
    marginTop: 14,
    backgroundColor: '#00D4AA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  upgradeBtnSecondary: {
    marginTop: 12,
    backgroundColor: '#0F2A24',
    borderWidth: 2,
    borderColor: '#00D4AA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  upgradeBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  upgradeBtnTextSecondary: {
    color: '#00D4AA',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  bestValueBadge: {
    alignSelf: 'flex-start',
    marginTop: 14,
    marginBottom: 6,
    marginHorizontal: 14,
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
  subscriptionHeading: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 8,
  },
  subscriptionDesc: {
    color: '#A0AEC0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  proActiveBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#00D4AA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  proActiveText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 14,
  },
  trialSectionLabel: {
    color: '#00D4AA',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  restoreLink: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  restoreLinkText: {
    color: '#00D4AA',
    fontSize: 13,
    fontWeight: '600',
  },
});
