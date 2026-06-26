import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getAnnualSavings,
  getIntroPrice,
  getRegularPriceString,
  useOfferings,
} from '../hooks/useOfferings';

export type PurchaseAction = 'monthly' | 'annual' | 'restore' | null;

const DEFAULT_ICON = '🛡️';
const DEFAULT_TITLE = 'Live Account Monitoring';
const DEFAULT_DESCRIPTION =
  'Connect your trading account for real-time drawdown alerts, live equity tracking, and instant notifications when your limits are approaching. Supports MetaTrader 4, MetaTrader 5, and cTrader.';
const DEFAULT_BULLETS = [
  '• Real-time balance and equity from your trading terminal',
  '• Live drawdown vs daily and max loss limits',
  '• Open positions count and floating P&L',
  '• Instant PASS / CAUTION / FAIL verdict from live data',
];

export interface ProGateProps {
  purchaseLoading: PurchaseAction;
  onAnnual: () => void;
  onMonthly: () => void;
  onRestore: () => void;
  icon?: string;
  title?: string;
  description?: string;
  bullets?: string[];
}

export default function ProGate({
  purchaseLoading,
  onAnnual,
  onMonthly,
  onRestore,
  icon = DEFAULT_ICON,
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  bullets = DEFAULT_BULLETS,
}: ProGateProps) {
  const { annualPackage, monthlyPackage, loading: pricesLoading, error: pricesError } =
    useOfferings();

  const annualRegular = getRegularPriceString(annualPackage);
  const annualIntro = getIntroPrice(annualPackage);
  const monthlyRegular = getRegularPriceString(monthlyPackage);
  const monthlyIntro = getIntroPrice(monthlyPackage);
  const savings = getAnnualSavings(annualPackage, monthlyPackage);

  const annualLabel =
    annualIntro != null
      ? `Annual — ${annualIntro.priceString} first year`
      : annualRegular != null
        ? `Annual — ${annualRegular}/year`
        : null;

  const annualSubline =
    savings == null
      ? 'Best value, every year'
      : savings.basis === 'first-year'
        ? `Save ${savings.percent}% your first year`
        : `Save ${savings.percent}% every year`;

  const monthlyLabel =
    monthlyIntro != null
      ? `Monthly — ${monthlyIntro.priceString}/mo for first ${monthlyIntro.cycles} months`
      : monthlyRegular != null
        ? `Monthly — ${monthlyRegular}/month`
        : null;

  const annualButtonLabel =
    pricesError || annualLabel == null ? 'Annual plan' : annualLabel;
  const monthlyButtonLabel =
    pricesError || monthlyLabel == null ? 'Monthly plan' : monthlyLabel;

  return (
    <View style={styles.proGate}>
      <Text style={styles.proIcon}>{icon}</Text>
      <Text style={styles.proTitle}>{title}</Text>
      <Text style={styles.proBadge}>Pro Feature</Text>
      <Text style={styles.proDesc}>{description}</Text>
      {bullets.map((bullet) => (
        <Text key={bullet} style={styles.proBullet}>
          {bullet}
        </Text>
      ))}
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
        ) : pricesLoading ? (
          <ActivityIndicator color="#0D1117" />
        ) : (
          <>
            <Text style={styles.upgradeBtnText}>{annualButtonLabel}</Text>
            <Text style={styles.upgradeBtnSubText}>{annualSubline}</Text>
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
        ) : pricesLoading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.upgradeBtnTextSecondary}>{monthlyButtonLabel}</Text>
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

const styles = StyleSheet.create({
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
  upgradeBtnSecondary: {
    marginTop: 12,
    backgroundColor: '#0F2A24',
    borderWidth: 2,
    borderColor: '#00D4AA',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
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
