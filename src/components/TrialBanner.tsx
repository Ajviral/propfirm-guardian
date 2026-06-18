import React, { useEffect, useMemo, useRef } from 'react';
import {
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
import { useTrialGate } from '../hooks/useTrialGate';
import {
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

export default function TrialBanner({ showExpiryOverlay = false }: TrialBannerProps) {
  const navigation = useNavigation<Nav>();
  const { status, daysRemaining, isExpired, isProOrTrial } = useTrialGate();
  const expiresAt = useTrialStore((s) => s.expiresAt);
  const continuedWithFree = useTrialStore((s) => s.continuedWithFree);
  const setContinuedWithFree = useTrialStore((s) => s.setContinuedWithFree);

  const pulse = useRef(new Animated.Value(1)).current;
  const isUrgent = daysRemaining <= 1;

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

  const withinDiscountWindow = useMemo(() => {
    if (!expiresAt) return false;
    const expiryMs = new Date(expiresAt).getTime();
    return Date.now() - expiryMs < 24 * 60 * 60 * 1000;
  }, [expiresAt, isExpired]);

  const onUpgrade = () => navigation.navigate('Settings');
  const onSubscribeDiscount = () => void purchaseMonthlyPro();
  const onRestore = () => void restorePurchases();

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
            Subscribe now for 50% off — $9.99 first month, then $19.99/month
          </Text>
          <Pressable
            style={styles.bannerAmberBtn}
            onPress={onSubscribeDiscount}
          >
            <Text style={styles.bannerAmberBtnText}>Subscribe Now — 50% Off</Text>
          </Pressable>
          <Pressable onPress={onUpgrade}>
            <Text style={styles.bannerAmberLink}>Full price $19.99/month</Text>
          </Pressable>
        </Animated.View>
      );
    }

    return (
      <View style={styles.bannerGreen}>
        <Text style={styles.bannerGreenTitle}>Free Trial:</Text>
        <TrialCountdownDisplay color="#00D4AA" fontSize={28} variant="green" />
        <Text style={styles.bannerGreenSub}>
          Upgrade to Pro — get 50% off your first month before your trial expires
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
        {withinDiscountWindow ? (
          <Pressable style={styles.overlayPrimaryBtn} onPress={onSubscribeDiscount}>
            <Text style={styles.overlayPrimaryBtnText}>Subscribe — $9.99 First Month</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.overlaySecondaryBtn, !withinDiscountWindow && styles.overlayPrimaryBtn]}
          onPress={onSubscribeDiscount}
        >
          <Text
            style={[
              styles.overlaySecondaryBtnText,
              !withinDiscountWindow && styles.overlayPrimaryBtnText,
            ]}
          >
            Full Price — $19.99/month
          </Text>
        </Pressable>
        <Pressable style={styles.overlayLink} onPress={onRestore}>
          <Text style={styles.overlayLinkText}>Restore purchases</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerGreenBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
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
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  overlayPrimaryBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  overlaySecondaryBtn: {
    borderWidth: 1,
    borderColor: '#30363D',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  overlaySecondaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
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
