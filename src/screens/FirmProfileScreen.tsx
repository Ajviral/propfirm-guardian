import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DrawdownType } from '../calculators/RiskCalculator';
import { DRAWDOWN_DESCRIPTIONS } from '../constants';
import { FIRM_TEMPLATES, useFirmProfileStore } from '../store/useFirmProfileStore';
import type { FirmProfile, RootStackParamList } from '../types';
import { formatCurrency, generateUniqueId, calculateDailyLossLimit, calculateMaxLossLimit } from '../utils';

type FirmProfileNavProps = NativeStackScreenProps<RootStackParamList, 'FirmProfile'>;

type TemplateKey = keyof typeof FIRM_TEMPLATES;

const TEMPLATE_OPTIONS: { key: TemplateKey; label: string }[] = [
  { key: 'FUNDED_NEXT_STELLAR_1_STEP', label: 'FundedNext Stellar' },
  { key: 'FTMO', label: 'FTMO' },
  { key: 'GOAT_FUNDED_TRADER', label: 'Goat Funded Trader' },
  { key: 'FUNDING_PIPS', label: 'FundingPips' },
  { key: 'CUSTOM_FIRM', label: 'Custom' },
];

const DRAWDOWN_OPTIONS: { type: DrawdownType; label: string }[] = [
  { type: DrawdownType.BALANCE_BASED, label: 'Balance Based' },
  { type: DrawdownType.EQUITY_BASED, label: 'Equity Based' },
  { type: DrawdownType.EOD, label: 'End of Day' },
  { type: DrawdownType.STATIC, label: 'Static' },
  { type: DrawdownType.RELATIVE, label: 'Relative' },
];

const FUNDED_TIERS = FIRM_TEMPLATES.FUNDED_NEXT_STELLAR_1_STEP.accountSizeTiers;

function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function applyTemplateToForm(
  key: TemplateKey,
  setters: {
    setFirmName: (s: string) => void;
    setChallengeName: (s: string) => void;
    setAccountSize: (s: string) => void;
    setInitialStarting: (s: string) => void;
    setDailyLoss: (s: string) => void;
    setMaxLoss: (s: string) => void;
    setProfitTarget: (s: string) => void;
    setMinDays: (s: string) => void;
    setDrawdownType: (d: DrawdownType) => void;
  },
) {
  const t = FIRM_TEMPLATES[key];
  setters.setFirmName('firmName' in t ? t.firmName : '');
  setters.setChallengeName('challengeName' in t ? t.challengeName : '');
  setters.setDailyLoss(String(t.dailyLossLimitPercent));
  setters.setMaxLoss(String(t.maxLossLimitPercent));
  setters.setProfitTarget(String(t.profitTargetPercent));
  setters.setMinDays(String(t.minTradingDays));
  setters.setDrawdownType(t.drawdownType);

  if (key === 'FUNDED_NEXT_STELLAR_1_STEP' && 'accountSizeTiers' in t) {
    const sizeStr = String(t.accountSizeTiers[0]);
    setters.setAccountSize(sizeStr);
    setters.setInitialStarting(sizeStr);
  } else if ('accountSize' in t && typeof (t as { accountSize?: number }).accountSize === 'number') {
    const sz = (t as { accountSize: number }).accountSize;
    const sizeStr = sz > 0 ? String(sz) : '';
    setters.setAccountSize(sizeStr);
    setters.setInitialStarting(sizeStr);
  } else {
    setters.setAccountSize('');
    setters.setInitialStarting('');
  }
}

function resetFormToDefaults(setters: {
  setFirmName: (s: string) => void;
  setChallengeName: (s: string) => void;
  setPlatform: (s: string) => void;
  setAccountSize: (s: string) => void;
  setDailyLoss: (s: string) => void;
  setMaxLoss: (s: string) => void;
  setProfitTarget: (s: string) => void;
  setMinDays: (s: string) => void;
  setDrawdownType: (d: DrawdownType) => void;
  setCurrentBalance: (s: string) => void;
  setCurrentEquity: (s: string) => void;
  setHighestPeak: (s: string) => void;
  setEodSnapshot: (s: string) => void;
  setInitialStarting: (s: string) => void;
  setSelectedTemplate: (t: TemplateKey | null) => void;
  setTouched: (t: boolean) => void;
}) {
  setters.setFirmName('');
  setters.setChallengeName('');
  setters.setPlatform('');
  setters.setAccountSize('');
  setters.setDailyLoss('');
  setters.setMaxLoss('');
  setters.setProfitTarget('');
  setters.setMinDays('');
  setters.setDrawdownType(DrawdownType.BALANCE_BASED);
  setters.setCurrentBalance('');
  setters.setCurrentEquity('');
  setters.setHighestPeak('');
  setters.setEodSnapshot('');
  setters.setInitialStarting('');
  setters.setSelectedTemplate(null);
  setters.setTouched(false);
}

export default function FirmProfileScreen({ navigation, route }: FirmProfileNavProps) {
  const profiles = useFirmProfileStore((s) => s.profiles);
  const addProfile = useFirmProfileStore((s) => s.addProfile);
  const updateProfile = useFirmProfileStore((s) => s.updateProfile);
  const deleteProfile = useFirmProfileStore((s) => s.deleteProfile);

  const routeProfileId = route.params?.profileId;
  const isEditing = route.params?.isEditing === true && Boolean(routeProfileId);
  const profileId = isEditing ? routeProfileId : undefined;
  const existing = useMemo(
    () => (profileId ? profiles.find((p) => p.id === profileId) : undefined),
    [profileId, profiles],
  );

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null);
  const [tierModalOpen, setTierModalOpen] = useState(false);

  const [firmName, setFirmName] = useState('');
  const [challengeName, setChallengeName] = useState('');
  const [platform, setPlatform] = useState('');

  const [accountSize, setAccountSize] = useState('');

  const [dailyLoss, setDailyLoss] = useState('');
  const [maxLoss, setMaxLoss] = useState('');
  const [profitTarget, setProfitTarget] = useState('');
  const [minDays, setMinDays] = useState('');

  const [drawdownType, setDrawdownType] = useState<DrawdownType>(DrawdownType.BALANCE_BASED);

  const [currentBalance, setCurrentBalance] = useState('');
  const [currentEquity, setCurrentEquity] = useState('');
  const [highestPeak, setHighestPeak] = useState('');
  const [eodSnapshot, setEodSnapshot] = useState('');
  const [initialStarting, setInitialStarting] = useState('');

  const [touched, setTouched] = useState(false);

  const loadFromProfile = useCallback(
    (p: FirmProfile) => {
      setFirmName(p.firmName);
      setChallengeName(p.challengeName);
      setPlatform(p.platform);
      setAccountSize(String(p.accountSize));
      setDailyLoss(String(p.dailyLossLimitPercent));
      setMaxLoss(String(p.maxLossLimitPercent));
      setProfitTarget(String(p.profitTargetPercent));
      setMinDays(String(p.minTradingDays));
      setDrawdownType(p.drawdownType);
      setCurrentBalance(String(p.currentBalance));
      setCurrentEquity(String(p.currentEquity));
      setHighestPeak(String(p.highestEquityPeak));
      setEodSnapshot(String(p.eodSnapshotBalance));
      setInitialStarting(String(p.initialStartingBalance));
      setSelectedTemplate(null);
      setTouched(false);
    },
    [],
  );

  const resetForm = useCallback(() => {
    resetFormToDefaults({
      setFirmName,
      setChallengeName,
      setPlatform,
      setAccountSize,
      setDailyLoss,
      setMaxLoss,
      setProfitTarget,
      setMinDays,
      setDrawdownType,
      setCurrentBalance,
      setCurrentEquity,
      setHighestPeak,
      setEodSnapshot,
      setInitialStarting,
      setSelectedTemplate,
      setTouched,
    });
  }, []);

  useEffect(() => {
    if (route.params?.isEditing !== true && route.params?.profileId != null) {
      navigation.setParams({ profileId: undefined });
    }
  }, [navigation, route.params?.isEditing, route.params?.profileId]);

  useEffect(() => {
    if (!isEditing) {
      resetForm();
      return;
    }
    if (existing) {
      loadFromProfile(existing);
    }
  }, [isEditing, profileId, existing, loadFromProfile, resetForm]);

  const showFundedTiers = selectedTemplate === 'FUNDED_NEXT_STELLAR_1_STEP';

  const nAccount = parseNum(accountSize) ?? 0;
  const nDailyPct = parseNum(dailyLoss) ?? 0;
  const nMaxPct = parseNum(maxLoss) ?? 0;
  const nProfitPct = parseNum(profitTarget) ?? 0;

  const dailyDollar = nAccount > 0 && nDailyPct > 0 ? calculateDailyLossLimit(nAccount, nDailyPct) : 0;
  const maxDollar = nAccount > 0 && nMaxPct > 0 ? calculateMaxLossLimit(nAccount, nMaxPct) : 0;
  const profitDollar =
    nAccount > 0 && nProfitPct > 0 ? (nAccount * nProfitPct) / 100 : 0;

  const validation = useMemo(() => {
    const e: Record<string, string> = {};
    if (firmName.trim() === '') e.firmName = 'Firm name is required.';
    if (nAccount <= 0) e.accountSize = 'Account size must be greater than zero.';
    if (nDailyPct < 0.1 || nDailyPct > 20) e.dailyLoss = 'Daily loss must be between 0.1% and 20%.';
    if (nMaxPct <= nDailyPct) e.maxLoss = 'Max loss % must be greater than daily loss %.';
    if (nProfitPct <= 0) e.profitTarget = 'Profit target must be greater than 0%.';
    const nMin = parseNum(minDays) ?? 0;
    if (nMin < 1) e.minDays = 'Minimum trading days must be at least 1.';
    return e;
  }, [firmName, nAccount, nDailyPct, nMaxPct, nProfitPct, minDays]);

  const isValid = Object.keys(validation).length === 0;

  const selectTemplate = (key: TemplateKey) => {
    setSelectedTemplate(key);
    setTouched(true);
    applyTemplateToForm(key, {
      setFirmName,
      setChallengeName,
      setAccountSize,
      setInitialStarting,
      setDailyLoss,
      setMaxLoss,
      setProfitTarget,
      setMinDays,
      setDrawdownType,
    });
  };

  const onChangeAccountSize = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    setAccountSize(cleaned);
  };

  useEffect(() => {
    if (isEditing) return;
    if (accountSize.trim() !== '' && initialStarting.trim() === '') {
      setInitialStarting(accountSize);
    }
  }, [isEditing, accountSize, initialStarting]);

  const buildProfilePayload = (id: string, createdAt: string): FirmProfile => {
    const nAcc = parseNum(accountSize) ?? 0;
    const nBal = parseNum(currentBalance) ?? 0;
    const nEq = parseNum(currentEquity) ?? 0;
    const nPeak = parseNum(highestPeak) ?? 0;
    const nEod = parseNum(eodSnapshot) ?? 0;
    const nInit = parseNum(initialStarting) ?? nAcc;
    const ath = Math.max(nPeak, nEq, nBal, nAcc, nEod, nInit);

    return {
      id,
      firmName: firmName.trim(),
      challengeName: challengeName.trim(),
      accountSize: nAcc,
      dailyLossLimitPercent: parseNum(dailyLoss) ?? 0,
      maxLossLimitPercent: parseNum(maxLoss) ?? 0,
      drawdownType,
      profitTargetPercent: parseNum(profitTarget) ?? 0,
      minTradingDays: Math.max(1, Math.floor(parseNum(minDays) ?? 1)),
      currentBalance: nBal,
      currentEquity: nEq,
      highestEquityPeak: nPeak,
      eodSnapshotBalance: nEod,
      initialStartingBalance: nInit,
      allTimeHighBalance: ath,
      platform: platform.trim(),
      isActive: true,
      createdAt,
      updatedAt: new Date().toISOString(),
    };
  };

  const onSave = () => {
    setTouched(true);
    if (!isValid) return;

    if (isEditing && profileId) {
      const created = existing?.createdAt ?? new Date().toISOString();
      const payload = buildProfilePayload(profileId, created);
      updateProfile(profileId, {
        ...payload,
        id: profileId,
        createdAt: created,
      });
      Alert.alert('Profile saved', 'Your firm profile was updated successfully.', [
        { text: 'OK', onPress: () => navigation.navigate('Dashboard') },
      ]);
      return;
    }

    const id = generateUniqueId();
    const now = new Date().toISOString();
    const payload = buildProfilePayload(id, now);
    addProfile({ ...payload, createdAt: now, updatedAt: now });
    Alert.alert('Profile saved', 'Your firm profile was saved successfully.', [
      { text: 'OK', onPress: () => navigation.navigate('Dashboard') },
    ]);
  };

  const onDelete = () => {
    if (!profileId) return;
    Alert.alert('Delete profile', 'This will permanently remove this profile from the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteProfile(profileId);
          navigation.navigate('Dashboard');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>{isEditing ? 'Edit profile' : 'New profile'}</Text>

          <Text style={styles.sectionLabel}>Template</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateRow}
          >
            {TEMPLATE_OPTIONS.map((opt) => {
              const sel = selectedTemplate === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.templateChip, sel ? styles.templateChipOn : styles.templateChipOff]}
                  onPress={() => selectTemplate(opt.key)}
                >
                  <Text style={[styles.templateChipText, sel && styles.templateChipTextOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>Firm details</Text>
          <LabeledInput
            label="Firm Name"
            value={firmName}
            onChangeText={setFirmName}
            onFieldFocus={() => setTouched(true)}
            error={touched ? validation.firmName : undefined}
          />
          <LabeledInput
            label="Challenge Name"
            value={challengeName}
            onChangeText={setChallengeName}
            onFieldFocus={() => setTouched(true)}
          />
          <LabeledInput
            label="Platform"
            value={platform}
            onChangeText={setPlatform}
            onFieldFocus={() => setTouched(true)}
            placeholder="MT4, MT5, cTrader, etc."
          />

          <Text style={styles.sectionLabel}>Account configuration</Text>
          <LabeledInput
            label="Account Size"
            value={accountSize}
            onChangeText={onChangeAccountSize}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
            error={touched ? validation.accountSize : undefined}
          />
          {nAccount > 0 ? (
            <Text style={styles.computed}>Displayed: {formatCurrency(nAccount)}</Text>
          ) : null}

          {showFundedTiers ? (
            <>
              <Text style={styles.subLabel}>Account size tier</Text>
              <Pressable style={styles.tierSelectBtn} onPress={() => setTierModalOpen(true)}>
                <Text style={styles.tierSelectText}>
                  {formatCurrency(parseNum(accountSize) ?? 0)} — tap to change tier
                </Text>
              </Pressable>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Risk parameters</Text>
          <LabeledInput
            label="Daily Loss Limit %"
            value={dailyLoss}
            onChangeText={setDailyLoss}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
            error={touched ? validation.dailyLoss : undefined}
          />
          {nAccount > 0 ? (
            <Text style={styles.computed}>= {formatCurrency(dailyDollar)}</Text>
          ) : null}

          <LabeledInput
            label="Max Loss Limit %"
            value={maxLoss}
            onChangeText={setMaxLoss}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
            error={touched ? validation.maxLoss : undefined}
          />
          {nAccount > 0 ? <Text style={styles.computed}>= {formatCurrency(maxDollar)}</Text> : null}

          <LabeledInput
            label="Profit Target %"
            value={profitTarget}
            onChangeText={setProfitTarget}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
            error={touched ? validation.profitTarget : undefined}
          />
          {nAccount > 0 ? (
            <Text style={styles.computed}>= {formatCurrency(profitDollar)}</Text>
          ) : null}

          <LabeledInput
            label="Minimum Trading Days"
            value={minDays}
            onChangeText={setMinDays}
            onFieldFocus={() => setTouched(true)}
            keyboardType="number-pad"
            error={touched ? validation.minDays : undefined}
          />

          <Text style={styles.sectionLabel}>Drawdown type</Text>
          <View style={styles.ddGrid}>
            {DRAWDOWN_OPTIONS.map((opt) => {
              const on = drawdownType === opt.type;
              return (
                <Pressable
                  key={opt.type}
                  style={[styles.ddChip, on && styles.ddChipOn]}
                  onPress={() => {
                    setTouched(true);
                    setDrawdownType(opt.type);
                  }}
                >
                  <Text style={[styles.ddChipText, on && styles.ddChipTextOn]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.ddHint}>{DRAWDOWN_DESCRIPTIONS[drawdownType]}</Text>

          <Text style={styles.sectionLabel}>Current account state</Text>
          <LabeledInput
            label="Current Balance"
            value={currentBalance}
            onChangeText={setCurrentBalance}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
          />
          <LabeledInput
            label="Current Equity"
            value={currentEquity}
            onChangeText={setCurrentEquity}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
          />
          <LabeledInput
            label="Highest Equity Peak"
            value={highestPeak}
            onChangeText={setHighestPeak}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
          />
          <LabeledInput
            label="EOD Snapshot Balance"
            value={eodSnapshot}
            onChangeText={setEodSnapshot}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
          />
          <LabeledInput
            label="Initial Starting Balance"
            value={initialStarting}
            onChangeText={setInitialStarting}
            onFieldFocus={() => setTouched(true)}
            keyboardType="decimal-pad"
          />

          <Pressable
            style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={!isValid}
          >
            <Text style={styles.saveBtnText}>Save Profile</Text>
          </Pressable>

          {isEditing ? (
            <Pressable style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteBtnText}>Delete Profile</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent visible={tierModalOpen} animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setTierModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(ev) => ev.stopPropagation()}>
            <Text style={styles.modalTitle}>Select account size</Text>
            {FUNDED_TIERS.map((tier) => (
              <Pressable
                key={tier}
                style={styles.modalRow}
                onPress={() => {
                  setAccountSize(String(tier));
                  setInitialStarting(String(tier));
                  setTierModalOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>{formatCurrency(tier)}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  onFieldFocus,
  placeholder,
  keyboardType,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onFieldFocus?: () => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  error?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFieldFocus}
        placeholder={placeholder}
        placeholderTextColor="#718096"
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  flex: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#00D4AA',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 10,
    fontWeight: '700',
  },
  subLabel: {
    color: '#A0AEC0',
    fontSize: 13,
    marginBottom: 6,
  },
  templateRow: {
    gap: 8,
    paddingBottom: 8,
  },
  templateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
  },
  templateChipOn: {
    backgroundColor: '#00D4AA',
  },
  templateChipOff: {
    backgroundColor: '#2D3748',
  },
  templateChipText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  templateChipTextOn: {
    color: '#0D1117',
  },
  fieldBlock: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#A0AEC0',
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  computed: {
    color: '#A0AEC0',
    fontSize: 12,
    marginTop: -6,
    marginBottom: 10,
  },
  tierSelectBtn: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  tierSelectText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  ddGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  ddChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2D3748',
  },
  ddChipOn: {
    backgroundColor: '#00D4AA',
  },
  ddChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  ddChipTextOn: {
    color: '#0D1117',
  },
  ddHint: {
    color: '#A0AEC0',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  saveBtn: {
    backgroundColor: '#00D4AA',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 16,
  },
  deleteBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 12,
    fontSize: 16,
  },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30363D',
  },
  modalRowText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
