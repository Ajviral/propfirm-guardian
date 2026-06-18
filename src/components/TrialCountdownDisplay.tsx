import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTrialStore } from '../store/useTrialStore';
import { formatTrialCountdown } from '../utils/trialCountdown';

interface TrialCountdownDisplayProps {
  /** Main countdown color (default trial green). */
  color?: string;
  fontSize?: number;
  variant?: 'green' | 'amber';
}

export default function TrialCountdownDisplay({
  color = '#00D4AA',
  fontSize = 28,
  variant = 'green',
}: TrialCountdownDisplayProps) {
  const status = useTrialStore((s) => s.status);
  const daysRemaining = useTrialStore((s) => s.daysRemaining);
  const hoursRemaining = useTrialStore((s) => s.hoursRemaining);
  const minutesRemaining = useTrialStore((s) => s.minutesRemaining);
  const secondsRemaining = useTrialStore((s) => s.secondsRemaining);
  const decrementSecond = useTrialStore((s) => s.decrementSecond);

  useEffect(() => {
    if (status !== 'active' && status !== 'new') return;

    const intervalId = setInterval(() => {
      decrementSecond();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [status, decrementSecond]);

  const countdown = formatTrialCountdown(
    daysRemaining,
    hoursRemaining,
    minutesRemaining,
    secondsRemaining,
  );

  const labelColor = variant === 'amber' ? '#A0AEC0' : '#718096';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.countdown, { color, fontSize }]}>{countdown}</Text>
      <Text style={[styles.unitsLabel, { color: labelColor }]}>days : hrs : min : sec</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  countdown: {
    fontWeight: '700',
    fontFamily: 'monospace',
    fontVariant: ['tabular-nums'],
  },
  unitsLabel: {
    marginTop: 4,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'lowercase',
  },
});
