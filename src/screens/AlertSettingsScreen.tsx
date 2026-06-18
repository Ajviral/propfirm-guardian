import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { scheduleDrawdownAlert } from '../services/notifications';
import { useSettingsStore } from '../store/useSettingsStore';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AlertSettings'>;

export default function AlertSettingsScreen({ navigation }: Props) {
  const settings = useSettingsStore();
  const { updateSetting } = settings;

  const onSendTestAlert = () => {
    void scheduleDrawdownAlert({
      title: '🧪 Test Alert — PropFirm Guardian',
      body: 'Push notifications are working correctly.',
      vibrate: settings.alertsVibration,
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Alert Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Drawdown Alerts">
          <ToggleRow
            label="Daily Drawdown Alerts"
            caption="Alerts at 50%, 75%, and 90% of daily limit"
            value={settings.alertsDailyDrawdown}
            onValueChange={(v) => updateSetting('alertsDailyDrawdown', v)}
          />
          <Divider />
          <ToggleRow
            label="Max Drawdown Alerts"
            caption="Alerts at 50%, 75%, and 90% of max limit"
            value={settings.alertsMaxDrawdown}
            onValueChange={(v) => updateSetting('alertsMaxDrawdown', v)}
          />
        </Section>

        <Section title="Margin Alerts">
          <ToggleRow
            label="Margin Level Alerts"
            caption="Warnings at 500%, 200%, and 150% margin level"
            value={settings.alertsMarginLevel}
            onValueChange={(v) => updateSetting('alertsMarginLevel', v)}
          />
        </Section>

        <Section title="Notification Style">
          <ToggleRow
            label="Vibration"
            caption="Vibrate on critical alerts"
            value={settings.alertsVibration}
            onValueChange={(v) => updateSetting('alertsVibration', v)}
          />
        </Section>

        <Section title="Test Notifications">
          <Pressable
            style={({ pressed }) => [styles.testBtn, pressed && styles.testBtnPressed]}
            onPress={onSendTestAlert}
          >
            <Text style={styles.testBtnText}>Send Test Alert</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  caption,
  value,
  onValueChange,
}: {
  label: string;
  caption?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#2D3748', true: '#00D4AA' }}
        thumbColor="#FFFFFF"
      />
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2D3748',
    marginHorizontal: 14,
  },
  testBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#1A202C',
  },
  testBtnPressed: {
    opacity: 0.85,
  },
  testBtnText: {
    color: '#00D4AA',
    fontWeight: '700',
    fontSize: 15,
  },
});
