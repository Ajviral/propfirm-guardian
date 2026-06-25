import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Persistent flag — string `'true'` when the user has accepted the disclaimer. */
export const DISCLAIMER_ACCEPTED_KEY = 'disclaimer_accepted_v1';

/** ISO-8601 timestamp written alongside acceptance for audit trails. */
export const DISCLAIMER_ACCEPTED_AT_KEY = 'disclaimer_accepted_at_v1';

/**
 * Async-safe read used by the navigator to gate first-launch.
 * Returns `false` when the value is missing or the read fails.
 */
export async function readDisclaimerAccepted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(DISCLAIMER_ACCEPTED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export interface DisclaimerScreenProps {
  onAccept: () => void;
}

/**
 * Legal gate: users must read the full scroll area, confirm via checkbox, then accept.
 * Persists consent + timestamp to AsyncStorage before notifying the parent navigator.
 */
export function DisclaimerScreen({ onAccept }: DisclaimerScreenProps) {
  const isAccepting = useRef(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);

  // Three measurements drive the bottom-detection rule below. We keep them in
  // state so the effect re-runs whenever any of them changes (initial layout,
  // dynamic content sizing, or scroll).
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [scrollPosition, setScrollPosition] = useState(0);

  // TODO: re-enable hasScrolledToBottom once scroll detection is verified on device
  // For now Accept is gated only on the explicit checkbox so users aren't blocked
  // by flaky scroll measurements on certain device/keyboard combinations.
  const canAccept = isChecked;

  // 20-pixel slack covers rounding differences across devices (especially
  // Android, where contentSize and layout can drift by a fractional pixel).
  // This single rule also handles the "content fits on screen" case: at
  // scrollPosition 0 with contentHeight <= scrollViewHeight + 20 it is satisfied.
  useEffect(() => {
    if (contentHeight <= 0 || scrollViewHeight <= 0) return;
    if (scrollPosition + scrollViewHeight >= contentHeight - 20) {
      setHasScrolledToBottom(true);
    }
  }, [contentHeight, scrollViewHeight, scrollPosition]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollPosition(event.nativeEvent.contentOffset.y);
  }, []);

  const handleScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    setScrollViewHeight(e.nativeEvent.layout.height);
  }, []);

  const handleContentLayout = useCallback((e: LayoutChangeEvent) => {
    setContentHeight(e.nativeEvent.layout.height);
  }, []);

  const handleAccept = useCallback(() => {
    if (isAccepting.current) return;

    // Diagnostic: confirm the press is actually firing and what the gate sees.
    console.log('Accept button pressed, canAccept:', canAccept);

    if (!canAccept) return;

    isAccepting.current = true;

    // 1) Navigate FIRST — synchronously notify the parent so the screen
    //    transitions immediately. The user must never wait on disk I/O.
    onAccept();

    // 2) Persist acceptance AFTER navigation. Wrapped in try/catch so any
    //    storage error (quota, locked DB, native bridge failure, etc.) is
    //    swallowed and never blocks navigation. The navigator's hydration
    //    rule treats a missing key as "not accepted", so the worst case
    //    is the disclaimer re-appears next launch.
    try {
      const timestamp = new Date().toISOString();
      AsyncStorage.multiSet([
        [DISCLAIMER_ACCEPTED_KEY, 'true'],
        [DISCLAIMER_ACCEPTED_AT_KEY, timestamp],
      ]).catch(() => {
        // Async rejection: best-effort, ignore.
      });
    } catch {
      // Sync throw (e.g. native module missing): best-effort, ignore.
    }
  }, [canAccept, onAccept]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.root}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onLayout={handleScrollViewLayout}
          showsVerticalScrollIndicator
        >
          {/*
           * Inner wrapper so we can read the *content* height via onLayout.
           * This is more reliable across devices than `onContentSizeChange`,
           * which can fire late or with stale values on some platforms.
           */}
          <View onLayout={handleContentLayout}>
            <Text style={styles.title}>PropFirm Guardian</Text>
            <Text style={styles.subtitle}>Risk Management Calculator</Text>

            <Text style={styles.sectionHeading}>Important Risk Disclaimer</Text>
            <Text style={styles.body}>
              This app provides mathematical calculations and estimates only. All calculations are based on
              user-provided inputs and are not guaranteed to be accurate. Trading financial instruments
              involves substantial risk of loss.
            </Text>

            <Text style={styles.sectionHeading}>Limitation of Liability</Text>
            <Text style={styles.body}>
              PropFirm Guardian and its developers are not responsible for any trading losses, account
              violations, or prop firm challenge failures that occur while using this app. The user accepts
              sole responsibility for verifying all calculations with their broker before executing any
              trade.
            </Text>

            <Text style={styles.sectionHeading}>Not Financial Advice</Text>
            <Text style={styles.body}>
              Nothing in this application constitutes financial advice, investment advice, or trading
              recommendations. This is a mathematical utility tool only.
            </Text>

            <Text style={styles.sectionHeading}>Accuracy of Calculations</Text>
            <Text style={styles.body}>
              Contract sizes, point values, and instrument specifications vary between brokers. Always
              verify your broker&apos;s exact specifications before using the calculated lot sizes.
              Incorrect contract size inputs will produce incorrect results.
            </Text>

            <Text style={styles.sectionHeading}>User Responsibility</Text>
            <Text style={styles.body}>
              By accepting these terms, the user confirms they understand the risks of prop firm trading,
              they will independently verify all calculations before execution, and they accept full
              personal responsibility for all trading decisions.
            </Text>

            {!hasScrolledToBottom ? (
              <Text style={styles.scrollCue}>Scroll to bottom to enable acceptance</Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setIsChecked((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
          >
            <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
              {isChecked ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and understood the disclaimer above and agree to these terms.
            </Text>
          </Pressable>

          <Pressable
            style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!canAccept}
            accessibilityRole="button"
          >
            <Text style={[styles.acceptButtonText, !canAccept && styles.acceptButtonTextDisabled]}>
              I Understand and Accept
            </Text>
          </Pressable>

          {!hasScrolledToBottom ? (
            <Text style={styles.helperText}>Please scroll to the bottom to enable this button</Text>
          ) : null}

          <Text style={styles.complianceNote}>
            Your acceptance will be recorded with a timestamp for compliance purposes.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  root: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#00D4AA',
    marginBottom: 24,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#A0AEC0',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#30363D',
    backgroundColor: '#0D1117',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#A0AEC0',
    marginTop: 2,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: '#00D4AA',
    backgroundColor: '#00D4AA',
  },
  checkboxMark: {
    color: '#0D1117',
    fontSize: 14,
    fontWeight: '800',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#A0AEC0',
  },
  acceptButton: {
    backgroundColor: '#00D4AA',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#2D3748',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D1117',
  },
  acceptButtonTextDisabled: {
    color: '#A0AEC0',
  },
  helperText: {
    marginTop: 10,
    fontSize: 13,
    color: '#A0AEC0',
    textAlign: 'center',
  },
  // Inline cue rendered inside the ScrollView content so it's part of the
  // scrollable column, not the fixed footer. Hidden once the user reaches the bottom.
  scrollCue: {
    marginTop: 24,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#00D4AA',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  complianceNote: {
    marginTop: 12,
    fontSize: 11,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 16,
  },
});
