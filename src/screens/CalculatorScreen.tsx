import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import {
  calculateUniversalLotSize,
  INSTRUMENT_SYMBOL_LIST,
  resolveInstrumentSpec,
} from '../constants/instrumentSpecs';
import { useTrialGate } from '../hooks/useTrialGate';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import { useLiveConnectionStore } from '../store/useLiveConnectionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import type { RootStackParamList } from '../types';
import { formatCurrency, formatLotSize } from '../utils';
import { LIVE_SERVER_HTTPS } from '../utils/tokenUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'Calculator'>;
type Direction = 'BUY' | 'SELL';

function parsePositive(raw: string): number | null {
  const n = Number.parseFloat(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export default function CalculatorScreen({ navigation, route }: Props) {
  const setActiveProfile = useFirmProfileStore((s) => s.setActiveProfile);
  const activeProfile = useFirmProfileStore((s) =>
    s.activeProfileId ? (s.profiles.find((p) => p.id === s.activeProfileId) ?? null) : null,
  );
  const defaultRisk = useSettingsStore((s) => s.defaultRiskPercentage);
  const connections = useLiveConnectionStore((s) => s.connections);
  const { isPro } = useTrialGate();

  const [symbol, setSymbol] = useState('XAUUSD');
  const [contractSize, setContractSize] = useState('');
  const [pipValue, setPipValue] = useState('');
  const [pipDecimalPlaces, setPipDecimalPlaces] = useState('2');
  const [accountSize, setAccountSize] = useState('');
  const [riskPercent, setRiskPercent] = useState(String(defaultRisk));
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLossPrice, setStopLossPrice] = useState('');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [liveFetched, setLiveFetched] = useState(false);
  const [fetchingSpecs, setFetchingSpecs] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const hasLiveConnection = useMemo(
    () => connections.some((c) => c.status === 'connected'),
    [connections],
  );

  const showProFetch = isPro && hasLiveConnection;
  const showUpgradeBanner = !isPro;

  const matchingSymbols = useMemo(() => {
    const q = symbol.trim().toUpperCase();
    if (!q) return INSTRUMENT_SYMBOL_LIST.slice(0, 5);
    return INSTRUMENT_SYMBOL_LIST.filter((s) => s.includes(q)).slice(0, 5);
  }, [symbol]);

  useFocusEffect(
    useCallback(() => {
      const id = route.params?.profileId;
      if (id) setActiveProfile(id);
    }, [route.params?.profileId, setActiveProfile]),
  );

  useEffect(() => {
    if (activeProfile) {
      setAccountSize(String(activeProfile.accountSize));
    }
  }, [activeProfile?.id, activeProfile?.accountSize]);

  const applyKnownSpec = useCallback((sym: string) => {
    const spec = resolveInstrumentSpec(sym);
    if (!spec) {
      setLiveFetched(false);
      return;
    }
    setContractSize(String(spec.contractSize));
    setPipValue(String(spec.pipValue));
    setPipDecimalPlaces(String(spec.pipDecimalPlaces));
    setLiveFetched(false);
  }, []);

  useEffect(() => {
    applyKnownSpec('XAUUSD');
  }, [applyKnownSpec]);

  const onSymbolChange = (text: string) => {
    setSymbol(text);
    setFetchError(null);
    applyKnownSpec(text);
    setDropdownOpen(true);
  };

  const onSelectSymbol = (sym: string) => {
    setSymbol(sym);
    applyKnownSpec(sym);
    setDropdownOpen(false);
  };

  const onFetchFromMt5 = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;

    const connected = connections.find((c) => c.status === 'connected');
    if (!connected) {
      setFetchError('No active MT5 connection.');
      return;
    }

    setFetchingSpecs(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `${LIVE_SERVER_HTTPS}/api/symbol-specs/${connected.token}/${encodeURIComponent(sym)}`,
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          contractSize: number;
          pipValue: number;
          pipDecimalPlaces: number;
        };
        error?: string;
      };

      if (!res.ok || !json.data) {
        setFetchError(json.error ?? 'Could not fetch symbol specs.');
        setLiveFetched(false);
        return;
      }

      setContractSize(String(json.data.contractSize));
      setPipValue(String(json.data.pipValue));
      setPipDecimalPlaces(String(json.data.pipDecimalPlaces));
      setLiveFetched(true);
    } catch {
      setFetchError('Network error fetching specs.');
      setLiveFetched(false);
    } finally {
      setFetchingSpecs(false);
    }
  };

  const result = useMemo(() => {
    const account = parsePositive(accountSize);
    const risk = parsePositive(riskPercent);
    const entry = parsePositive(entryPrice);
    const stop = parsePositive(stopLossPrice);
    const pipVal = parsePositive(pipValue);
    const decimals = Number.parseInt(pipDecimalPlaces, 10);

    if (
      account == null ||
      risk == null ||
      entry == null ||
      stop == null ||
      pipVal == null ||
      !Number.isFinite(decimals)
    ) {
      return null;
    }

    return calculateUniversalLotSize({
      accountSize: account,
      riskPercentage: risk,
      entryPrice: entry,
      stopLossPrice: stop,
      pipValue: pipVal,
      pipDecimalPlaces: decimals,
    });
  }, [accountSize, riskPercent, entryPrice, stopLossPrice, pipValue, pipDecimalPlaces]);

  const lotWarnings = useMemo(() => {
    if (!result) return [];
    const warnings: string[] = [];
    if (result.lotSize < 0.01) warnings.push('Lot size is below the 0.01 minimum.');
    if (result.lotSize > 100) warnings.push('Lot size exceeds 100 — unusually large, verify inputs.');
    return warnings;
  }, [result]);

  const canCalculate =
    parsePositive(accountSize) != null &&
    parsePositive(riskPercent) != null &&
    parsePositive(entryPrice) != null &&
    parsePositive(stopLossPrice) != null &&
    parsePositive(pipValue) != null &&
    parsePositive(pipDecimalPlaces) != null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Instrument Selection</Text>
          <Text style={styles.inputLabel}>Symbol</Text>
          <View style={styles.symbolRow}>
            <TextInput
              style={[styles.input, styles.symbolInput]}
              value={symbol}
              onChangeText={onSymbolChange}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Type symbol e.g. EURUSD"
              placeholderTextColor="#718096"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {showProFetch ? (
              <Pressable
                style={[styles.fetchBtn, fetchingSpecs && styles.fetchBtnDisabled]}
                onPress={() => void onFetchFromMt5()}
                disabled={fetchingSpecs}
              >
                {fetchingSpecs ? (
                  <ActivityIndicator color="#0D1117" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Fetch from MT5</Text>
                )}
              </Pressable>
            ) : null}
          </View>
          {fetchError ? <Text style={styles.errorText}>{fetchError}</Text> : null}
          {dropdownOpen && matchingSymbols.length > 0 ? (
            <View style={styles.dropdown}>
              <ScrollView
                style={styles.dropdownScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {matchingSymbols.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.dropdownItem}
                    onPress={() => onSelectSymbol(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownItemText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>

        {symbol.trim().length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Instrument Specs</Text>
            <Field
              label="Contract Size"
              value={contractSize}
              onChangeText={(t) => {
                setContractSize(t);
                setLiveFetched(false);
              }}
              keyboardType="decimal-pad"
              live={liveFetched}
            />
            <Field
              label="Pip Value (per lot)"
              value={pipValue}
              onChangeText={(t) => {
                setPipValue(t);
                setLiveFetched(false);
              }}
              keyboardType="decimal-pad"
              live={liveFetched}
            />
            <Text style={styles.helper}>
              Find these values in MT5 under View → Symbols → [Your Symbol] → Properties
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Trade Parameters</Text>
          <Field
            label="Account Size ($)"
            value={accountSize}
            onChangeText={setAccountSize}
            keyboardType="decimal-pad"
          />
          <Field
            label="Risk Percentage (%)"
            value={riskPercent}
            onChangeText={setRiskPercent}
            keyboardType="decimal-pad"
            placeholder="1.0"
          />
          <Field
            label="Entry Price"
            value={entryPrice}
            onChangeText={setEntryPrice}
            keyboardType="decimal-pad"
          />
          <Field
            label="Stop Loss Price"
            value={stopLossPrice}
            onChangeText={setStopLossPrice}
            keyboardType="decimal-pad"
          />
          <Text style={styles.inputLabel}>Direction</Text>
          <View style={styles.dirRow}>
            {(['BUY', 'SELL'] as Direction[]).map((d) => {
              const on = direction === d;
              return (
                <Pressable
                  key={d}
                  style={[styles.dirBtn, on && styles.dirBtnOn]}
                  onPress={() => setDirection(d)}
                >
                  <Text style={[styles.dirBtnText, on && styles.dirBtnTextOn]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          {result ? (
            <Text style={styles.helper}>
              Pip distance: {result.pipDistance.toFixed(1)} pips ({direction})
            </Text>
          ) : null}
        </View>

        {canCalculate && result ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Result</Text>
            <Text style={styles.lotLabel}>Recommended Lot Size</Text>
            <Text style={styles.lotValue}>{formatLotSize(result.lotSize)}</Text>
            <Text style={styles.resultLine}>
              Risk Amount: {formatCurrency(result.riskAmount)}
            </Text>
            <Text style={styles.resultLine}>
              Pip Distance: {result.pipDistance.toFixed(1)} pips
            </Text>
            <Text style={styles.resultLine}>
              Potential Loss if SL Hit: {formatCurrency(result.potentialLoss)}
            </Text>
            {lotWarnings.map((w) => (
              <Text key={w} style={styles.warnText}>
                ⚠ {w}
              </Text>
            ))}
          </View>
        ) : null}

        {showUpgradeBanner ? (
          <View style={styles.upgradeBanner}>
            <Text style={styles.upgradeBannerText}>
              Using default instrument specs. Upgrade to Pro to fetch exact contract specifications
              for your symbol from your connected account.
            </Text>
            <Pressable
              style={styles.upgradeBannerBtn}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.upgradeBannerBtnText}>Upgrade to Pro</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  live,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'decimal-pad';
  placeholder?: string;
  live?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {live ? <Text style={styles.liveBadge}>Live ✓</Text> : null}
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor="#718096"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 12,
    fontSize: 15,
  },
  fieldWrap: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  inputLabel: {
    color: '#A0AEC0',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
  },
  symbolRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  symbolInput: {
    flex: 1,
  },
  fetchBtn: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 108,
    alignItems: 'center',
  },
  fetchBtnDisabled: {
    opacity: 0.7,
  },
  fetchBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 11,
  },
  dropdown: {
    marginTop: 8,
    backgroundColor: '#1A202C',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3748',
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2D3748',
  },
  dropdownItemText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  helper: {
    color: '#718096',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  dirRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  dirBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2D3748',
  },
  dirBtnOn: {
    backgroundColor: '#00D4AA',
  },
  dirBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dirBtnTextOn: {
    color: '#0D1117',
  },
  lotLabel: {
    color: '#A0AEC0',
    fontSize: 13,
  },
  lotValue: {
    color: '#00D4AA',
    fontSize: 40,
    fontWeight: '800',
    marginVertical: 8,
  },
  resultLine: {
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 6,
  },
  warnText: {
    color: '#F6C90E',
    fontSize: 12,
    marginTop: 6,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
  },
  liveBadge: {
    color: '#00D4AA',
    fontSize: 11,
    fontWeight: '800',
  },
  upgradeBanner: {
    backgroundColor: '#2A1F00',
    borderWidth: 1,
    borderColor: '#F6C90E',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  upgradeBannerText: {
    color: '#F6C90E',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  upgradeBannerBtn: {
    backgroundColor: '#F6C90E',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  upgradeBannerBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 15,
  },
});
