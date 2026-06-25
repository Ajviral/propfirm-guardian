import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import TrialCountdownDisplay from './TrialCountdownDisplay';
import {
  getAnnualSavings,
  getIntroPrice,
  getRegularPriceString,
  useOfferings,
} from '../hooks/useOfferings';
import { useTrialGate } from '../hooks/useTrialGate';
import {
  purchaseAnnualPro,
  purchaseMonthlyPro,
  restorePurchases,
} from '../services/revenueCat';
import { useTrialStore } from '../store/useTrialStore';
import type { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface TrialBannerProps {
  /** When true, renders the full-screen expiry overlay (e.g. Live Connection). */
  showExpiryOverlay?: boolean;
}

type PurchaseAction = 'monthly' | 'annual' | 'restore' | null;

export default function TrialBanner({ showExpiryOverlay = false }: TrialBannerProps) {
  const navigation = useNavigation<Nav>();
  const { status, daysRemaining, isExpired, isProOrTrial } = useTrialGate();
  const continuedWithFree = useTrialStore((s) => s.continuedWithFree);
  const setContinuedWithFree = useTrialStore((s) => s.setContinuedWithFree);
  const [purchaseLoading, setPurchaseLoading] = useState<PurchaseAction>(null);
  const { annualPackage, monthlyPackage, loading: pricesLoading, error: pricesError } =
    useOfferings();

  const pulse = useRef(new Animated.Value(1)).current;
  const isUrgent = daysRemaining <= 1;

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

  useEffect(() => {
    if (!isUrgent) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isUrgent, pulse]);

  const onUpgrade = () => navigation.navigate('Settings');

  const handleAnnual = async () => {
    setPurchaseLoading('annual');
    const result = await purchaseAnnualPro();
    setPurchaseLoading(null);
    if (result.success) return;
    if (result.error !== 'cancelled') {
      Alert.alert('Purchase failed', result.error ?? 'Unable to complete purchase.');
    }
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

  const onRestore = async () => {
    setPurchaseLoading('restore');
    const result = await restorePurchases();
    setPurchaseLoading(null);
    if (result.success) return;
    Alert.alert('Restore failed', result.error ?? 'No active subscription found.');
  };

  if (isProOrTrial && !isExpired && (status === 'active' || status === 'new')) {
    if (isUrgent) {
      return (
        <Animated.View
          style={[
            styles.bannerAmber,
            {
              borderColor: pulse.interpolate({
                inputRange: [0.4, 1],
                outputRange: ['#F6C90E', '#8B6914'],
              }),
            },
          ]}
        >
          <Text style={styles.bannerAmberTitle}>Free Trial:</Text>
          <TrialCountdownDisplay color="#F6C90E" fontSize={28} variant="amber" />
          <Text style={styles.bannerAmberSub}>
            Subscribe for live monitoring across MetaTrader 4, MetaTrader 5, and cTrader, plus
            push alerts. Save more with the annual plan.
          </Text>
          <View style={styles.bestValueBadge}>
            <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
          </View>
          <Pressable
            style={styles.bannerGreenBtn}
            onPress={() => void handleAnnual()}
            disabled={purchaseLoading !== null}
          >
            {purchaseLoading === 'annual' ? (
              <ActivityIndicator color="#0D1117" />
            ) : pricesLoading ? (
              <ActivityIndicator color="#0D1117" />
            ) : (
              <>
                <Text style={styles.bannerGreenBtnText}>{annualButtonLabel}</Text>
                <Text style={styles.upgradeBtnSubText}>{annualSubline}</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={styles.bannerMonthlyBtn}
            onPress={() => void handleMonthly()}
            disabled={purchaseLoading !== null}
          >
            {purchaseLoading === 'monthly' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : pricesLoading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.bannerMonthlyBtnText}>{monthlyButtonLabel}</Text>
            )}
          </Pressable>
        </Animated.View>
      );
    }

    return (
      <View style={styles.bannerGreen}>
        <Text style={styles.bannerGreenTitle}>Free Trial:</Text>
        <TrialCountdownDisplay color="#00D4AA" fontSize={28} variant="green" />
        <Text style={styles.bannerGreenSub}>
          Upgrade to Pro for live monitoring across MetaTrader 4, MetaTrader 5, and cTrader,
          plus push alerts.
        </Text>
        <Pressable style={styles.bannerGreenBtn} onPress={onUpgrade}>
          <Text style={styles.bannerGreenBtnText}>Upgrade Now</Text>
        </Pressable>
      </View>
    );
  }

  if (!showExpiryOverlay || !isExpired || continuedWithFree) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <Text style={styles.overlayIcon}>🔒</Text>
        <Text style={styles.overlayTitle}>Your Free Trial Has Ended</Text>
        <Text style={styles.overlayBody}>
          Subscribe to Pro to keep live monitoring, push notifications, and all premium
          features.
        </Text>
        <View style={styles.bestValueBadge}>
          <Text style={styles.bestValueBadgeText}>BEST VALUE</Text>
        </View>
        <Pressable
          style={styles.overlayPrimaryBtn}
          onPress={() => void handleAnnual()}
          disabled={purchaseLoading !== null}
        >
          {purchaseLoading === 'annual' ? (
            <ActivityIndicator color="#0D1117" />
          ) : pricesLoading ? (
            <ActivityIndicator color="#0D1117" />
          ) : (
            <>
              <Text style={styles.overlayPrimaryBtnText}>{annualButtonLabel}</Text>
              <Text style={styles.upgradeBtnSubText}>{annualSubline}</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={styles.overlaySecondaryBtn}
          onPress={() => void handleMonthly()}
          disabled={purchaseLoading !== null}
        >
          {purchaseLoading === 'monthly' ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : pricesLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.overlaySecondaryBtnText}>{monthlyButtonLabel}</Text>
          )}
        </Pressable>
        <Pressable
          style={styles.overlayLink}
          onPress={() => void onRestore()}
          disabled={purchaseLoading !== null}
        >
          {purchaseLoading === 'restore' ? (
            <ActivityIndicator color="#00D4AA" size="small" />
          ) : (
            <Text style={styles.overlayLinkText}>Restore purchases</Text>
          )}
        </Pressable>
        <Pressable style={styles.overlayLink} onPress={() => setContinuedWithFree(true)}>
          <Text style={styles.overlayLinkText}>Continue with free version</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bannerGreen: {
    backgroundColor: '#1A2A1A',
    borderWidth: 1,
    borderColor: '#00D4AA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  bannerGreenTitle: {
    color: '#00D4AA',
    fontWeight: '700',
    fontSize: 15,
    alignSelf: 'flex-start',
  },
  bannerGreenSub: {
    color: '#A0AEC0',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 10,
    textAlign: 'center',
  },
  bannerGreenBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#00D4AA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  bannerGreenBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  bannerMonthlyBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#0F2A24',
    borderWidth: 2,
    borderColor: '#00D4AA',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  bannerMonthlyBtnText: {
    color: '#00D4AA',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  bestValueBadge: {
    alignSelf: 'flex-start',
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
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.85,
  },
  bannerAmber: {
    backgroundColor: '#2A1A00',
    borderWidth: 2,
    borderColor: '#F6C90E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  bannerAmberTitle: {
    color: '#F6C90E',
    fontWeight: '700',
    fontSize: 15,
    alignSelf: 'flex-start',
  },
  bannerAmberSub: {
    color: '#A0AEC0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  bannerAmberBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#F6C90E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerAmberBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  bannerAmberLink: {
    paddingVertical: 6,
  },
  bannerAmberLinkText: {
    color: '#A0AEC0',
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  overlayIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  overlayTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  overlayBody: {
    color: '#A0AEC0',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  overlayPrimaryBtn: {
    backgroundColor: '#00D4AA',
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
  overlayPrimaryBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  overlaySecondaryBtn: {
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
  overlaySecondaryBtnText: {
    color: '#00D4AA',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  overlayLink: {
    paddingVertical: 10,
  },
  overlayLinkText: {
    color: '#00D4AA',
    fontSize: 14,
    fontWeight: '600',
  },
});
