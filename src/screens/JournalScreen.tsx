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

import { APP_CONFIG, SETUP_TAGS } from '../constants';
import { INSTRUMENTS } from '../constants/calculatorInstruments';
import { useTrialGate } from '../hooks/useTrialGate';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import { useJournalStore } from '../store/useJournalStore';
import type { RootStackParamList, TradeEntry } from '../types';
import {
  formatCurrency,
  formatPercent,
  formatTimestamp,
  generateUniqueId,
} from '../utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Journal'>;
type FilterTab = 'ALL' | 'WINS' | 'LOSSES' | 'OPEN';
type Direction = 'LONG' | 'SHORT';
type Outcome = NonNullable<TradeEntry['outcome']>;
type Session = TradeEntry['session'];
type InstrumentKey = keyof typeof INSTRUMENTS;

const INSTRUMENT_KEYS = Object.keys(INSTRUMENTS) as InstrumentKey[];
const SESSION_OPTIONS: Session[] = ['ASIAN', 'LONDON', 'NEW_YORK', 'OFF_SESSION'];
const OUTCOME_OPTIONS: Outcome[] = ['WIN', 'LOSS', 'BREAKEVEN', 'OPEN'];

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'WINS', label: 'Wins' },
  { key: 'LOSSES', label: 'Losses' },
  { key: 'OPEN', label: 'Open' },
];

function outcomeBadgeStyle(outcome: Outcome | undefined) {
  switch (outcome) {
    case 'WIN':
      return { bg: '#00D4AA', fg: '#0D1117' };
    case 'LOSS':
      return { bg: '#EF4444', fg: '#FFFFFF' };
    case 'BREAKEVEN':
      return { bg: '#F6C90E', fg: '#0D1117' };
    case 'OPEN':
    default:
      return { bg: '#4A5568', fg: '#FFFFFF' };
  }
}

function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export default function JournalScreen({ navigation, route }: Props) {
  const profileId = route.params.profileId;
  const profile = useFirmProfileStore((s) =>
    s.profiles.find((p) => p.id === profileId) ?? null,
  );

  const trades = useJournalStore((s) => s.trades);
  const addTrade = useJournalStore((s) => s.addTrade);
  const deleteTrade = useJournalStore((s) => s.deleteTrade);
  const { isProOrTrial } = useTrialGate();

  const profileTrades = useMemo(
    () =>
      trades
        .filter((t) => t.profileId === profileId)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    [trades, profileId],
  );

  const limitApplies = !isProOrTrial;
  const reachedLimit =
    limitApplies && profileTrades.length >= APP_CONFIG.freeTradingJournalLimit;

  const showJournalLimitAlert = () => {
    Alert.alert(
      'Free tier limit reached',
      `You can log up to ${APP_CONFIG.freeTradingJournalLimit} trades per profile on the free tier. Upgrade to log unlimited trades.`,
      [{ text: 'OK' }],
    );
  };

  const [filter, setFilter] = useState<FilterTab>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'WINS':
        return profileTrades.filter((t) => t.outcome === 'WIN');
      case 'LOSSES':
        return profileTrades.filter((t) => t.outcome === 'LOSS');
      case 'OPEN':
        return profileTrades.filter((t) => !t.outcome || t.outcome === 'OPEN');
      case 'ALL':
      default:
        return profileTrades;
    }
  }, [profileTrades, filter]);

  const stats = useMemo(() => {
    const closed = profileTrades.filter(
      (t) => t.outcome === 'WIN' || t.outcome === 'LOSS' || t.outcome === 'BREAKEVEN',
    );
    const wins = profileTrades.filter((t) => t.outcome === 'WIN').length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    const totalPnL = profileTrades.reduce((acc, t) => acc + (t.profitLoss ?? 0), 0);

    let rrSum = 0;
    let rrCount = 0;
    for (const t of profileTrades) {
      if (t.takeProfitPrice && t.entryPrice && t.stopLossPrice) {
        const risk = Math.abs(t.entryPrice - t.stopLossPrice);
        const reward = Math.abs(t.takeProfitPrice - t.entryPrice);
        if (risk > 0) {
          rrSum += reward / risk;
          rrCount += 1;
        }
      }
    }
    const avgRR = rrCount > 0 ? rrSum / rrCount : 0;
    return { winRate, totalPnL, avgRR, hasRR: rrCount > 0 };
  }, [profileTrades]);

  const openForm = () => {
    if (limitApplies && profileTrades.length >= APP_CONFIG.freeTradingJournalLimit) {
      showJournalLimitAlert();
      return;
    }
    setFormOpen(true);
  };

  // Auto-open the form when navigated in with calculator prefill.
  useEffect(() => {
    if (!route.params.calculatorPrefill) return;
    if (limitApplies && profileTrades.length >= APP_CONFIG.freeTradingJournalLimit) {
      showJournalLimitAlert();
      return;
    }
    setFormOpen(true);
  }, [route.params.calculatorPrefill, limitApplies, profileTrades.length]);

  const handleSave = useCallback(
    (newTrade: TradeEntry) => {
      if (limitApplies && profileTrades.length >= APP_CONFIG.freeTradingJournalLimit) {
        showJournalLimitAlert();
        return;
      }
      addTrade(newTrade);
      setFormOpen(false);
      navigation.setParams({ calculatorPrefill: undefined });
    },
    [addTrade, navigation, limitApplies, profileTrades.length],
  );

  const confirmDelete = (id: string) => {
    Alert.alert('Delete trade', 'Remove this trade from your journal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTrade(id);
          if (expandedId === id) setExpandedId(null);
        },
      },
    ]);
  };

  const headerTitle = profile ? profile.firmName : 'Journal';
  const headerSub = profile ? profile.challengeName : 'Profile not found';

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.headerCard}>
        <View>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.headerSub}>{headerSub}</Text>
        </View>
        <View style={styles.headerCount}>
          <Text style={styles.headerCountNum}>{profileTrades.length}</Text>
          <Text style={styles.headerCountLabel}>trades</Text>
        </View>
      </View>

      <View style={styles.filterBar}>
        {FILTER_TABS.map((tab) => {
          const on = filter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setFilter(tab.key)}
              style={[styles.filterTab, on && styles.filterTabOn]}
            >
              <Text style={[styles.filterTabText, on && styles.filterTabTextOn]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Win Rate" value={formatPercent(stats.winRate, 1)} />
        <Stat
          label="Total P&L"
          value={formatCurrency(stats.totalPnL)}
          color={stats.totalPnL >= 0 ? '#00D4AA' : '#EF4444'}
        />
        <Stat
          label="Avg RR"
          value={stats.hasRR ? `1 : ${stats.avgRR.toFixed(2)}` : '—'}
        />
      </View>

      {reachedLimit ? (
        <View style={styles.upgradeBanner}>
          <Text style={styles.upgradeBannerText}>
            Free tier limit reached ({APP_CONFIG.freeTradingJournalLimit} trades). Upgrade to log
            unlimited trades.
          </Text>
        </View>
      ) : null}

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {profileTrades.length === 0 ? 'No trades logged yet' : 'No trades match this filter'}
          </Text>
          <Text style={styles.emptySub}>
            {profileTrades.length === 0
              ? 'Tap the + button to log your first trade.'
              : 'Try another filter tab to see more entries.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((t) => (
            <TradeEntryCard
              key={t.id}
              trade={t}
              expanded={expandedId === t.id}
              onToggle={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
              onDelete={() => confirmDelete(t.id)}
            />
          ))}
        </ScrollView>
      )}

      <Pressable
        style={styles.fab}
        onPress={openForm}
        accessibilityLabel="Add trade"
        accessibilityRole="button"
      >
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>

      <Modal
        visible={formOpen}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setFormOpen(false)}
      >
        <AddTradeForm
          profileId={profileId}
          prefill={route.params.calculatorPrefill}
          onCancel={() => {
            setFormOpen(false);
            navigation.setParams({ calculatorPrefill: undefined });
          }}
          onSave={handleSave}
        />
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function TradeEntryCard({
  trade,
  expanded,
  onToggle,
  onDelete,
}: {
  trade: TradeEntry;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const badge = outcomeBadgeStyle(trade.outcome);
  const dirColor = trade.direction === 'LONG' ? '#00D4AA' : '#EF4444';
  const pnl = trade.profitLoss ?? 0;
  const pnlColor = pnl >= 0 ? '#00D4AA' : '#EF4444';

  return (
    <Pressable style={styles.card} onPress={onToggle}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardInstrument}>{trade.instrument}</Text>
        <Text style={[styles.cardDir, { color: dirColor }]}>{trade.direction}</Text>
        <View style={[styles.outcomeBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.outcomeBadgeText, { color: badge.fg }]}>
            {trade.outcome ?? 'OPEN'}
          </Text>
        </View>
      </View>

      <View style={styles.cardPriceRow}>
        <View style={styles.cardCol}>
          <Text style={styles.cardLabel}>Entry</Text>
          <Text style={styles.cardValue}>{trade.entryPrice}</Text>
        </View>
        <View style={styles.cardCol}>
          <Text style={styles.cardLabel}>Stop</Text>
          <Text style={styles.cardValue}>{trade.stopLossPrice}</Text>
        </View>
        <View style={styles.cardCol}>
          <Text style={styles.cardLabel}>Lots</Text>
          <Text style={styles.cardValue}>{trade.lotSize.toFixed(2)}</Text>
        </View>
        <View style={styles.cardCol}>
          <Text style={styles.cardLabel}>P&amp;L</Text>
          <Text style={[styles.cardValue, { color: pnlColor }]}>{formatCurrency(pnl)}</Text>
        </View>
      </View>

      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMetaText}>{trade.session.replace('_', ' ')}</Text>
        {trade.setupTag ? <Text style={styles.cardMetaText}>· {trade.setupTag}</Text> : null}
        <Text style={[styles.cardMetaText, styles.cardMetaTime]}>
          {formatTimestamp(trade.timestamp)}
        </Text>
      </View>

      {expanded ? (
        <View style={styles.expanded}>
          {trade.notes ? <Text style={styles.expandedText}>{trade.notes}</Text> : null}
          <View style={styles.screenshotPlaceholder}>
            <Text style={styles.screenshotText}>
              {trade.screenshotUri ? 'Screenshot saved' : 'Screenshot placeholder'}
            </Text>
          </View>
          <View style={styles.expandedRow}>
            <Text style={styles.cardMetaText}>
              Risk: {formatCurrency(trade.calculatedRisk)} ({formatPercent(trade.calculatedRiskPercent, 2)})
            </Text>
            <Pressable onPress={onDelete} style={styles.deleteLinkBtn}>
              <Text style={styles.deleteLinkText}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function AddTradeForm({
  profileId,
  prefill,
  onCancel,
  onSave,
}: {
  profileId: string;
  prefill: RootStackParamList['Journal']['calculatorPrefill'];
  onCancel: () => void;
  onSave: (t: TradeEntry) => void;
}) {
  const initialInstrument: InstrumentKey =
    prefill && (INSTRUMENT_KEYS as string[]).includes(prefill.instrument)
      ? (prefill.instrument as InstrumentKey)
      : 'XAUUSD';

  const [instrument, setInstrument] = useState<InstrumentKey>(initialInstrument);
  const [direction, setDirection] = useState<Direction>('LONG');
  const [entryPrice, setEntryPrice] = useState(prefill?.entryPrice ?? '');
  const [stopLossPrice, setStopLossPrice] = useState(prefill?.stopLossPrice ?? '');
  const [takeProfitPrice, setTakeProfitPrice] = useState(prefill?.takeProfitPrice ?? '');
  const [lotSize, setLotSize] = useState(prefill?.lotSize ?? '');
  const [session, setSession] = useState<Session>('NEW_YORK');
  const [outcome, setOutcome] = useState<Outcome>('OPEN');
  const [profitLoss, setProfitLoss] = useState('');
  const [setupTag, setSetupTag] = useState<string | undefined>(prefill?.setupTag);
  const [notes, setNotes] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);

  const calcRisk = prefill?.calculatedRisk ?? 0;
  const calcRiskPct = prefill?.calculatedRiskPercent ?? 0;

  const validation = useMemo(() => {
    const e: Record<string, string> = {};
    if (parseNum(entryPrice) === null || (parseNum(entryPrice) ?? 0) <= 0) {
      e.entryPrice = 'Enter a positive entry price.';
    }
    if (parseNum(stopLossPrice) === null || (parseNum(stopLossPrice) ?? 0) <= 0) {
      e.stopLossPrice = 'Enter a positive stop loss price.';
    }
    if (parseNum(lotSize) === null || (parseNum(lotSize) ?? 0) <= 0) {
      e.lotSize = 'Enter a positive lot size.';
    }
    if (takeProfitPrice.trim() !== '' && (parseNum(takeProfitPrice) ?? 0) <= 0) {
      e.takeProfitPrice = 'Take profit must be positive when set.';
    }
    return e;
  }, [entryPrice, stopLossPrice, lotSize, takeProfitPrice]);

  const isValid = Object.keys(validation).length === 0;

  const onSavePress = () => {
    if (!isValid) return;
    const tp = parseNum(takeProfitPrice);
    const pnl = parseNum(profitLoss);
    const trade: TradeEntry = {
      id: generateUniqueId(),
      profileId,
      instrument,
      direction,
      entryPrice: parseNum(entryPrice)!,
      stopLossPrice: parseNum(stopLossPrice)!,
      takeProfitPrice: tp ?? undefined,
      lotSize: parseNum(lotSize)!,
      session,
      outcome,
      profitLoss: pnl ?? 0,
      setupTag,
      notes: notes.trim() === '' ? undefined : notes.trim(),
      calculatedRisk: calcRisk,
      calculatedRiskPercent: calcRiskPct,
      timestamp: new Date().toISOString(),
    };
    onSave(trade);
  };

  return (
    <SafeAreaView style={styles.formScreen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.formHeader}>
          <Pressable onPress={onCancel}>
            <Text style={styles.formCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.formTitle}>New trade</Text>
          <Pressable onPress={onSavePress} disabled={!isValid}>
            <Text style={[styles.formSave, !isValid && styles.formSaveDisabled]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.formScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.formSection}>Instrument</Text>
          <View style={styles.chipRow}>
            {INSTRUMENT_KEYS.map((k) => {
              const sel = instrument === k;
              return (
                <Pressable
                  key={k}
                  style={[styles.chip, sel && styles.chipOn]}
                  onPress={() => setInstrument(k)}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextOn]}>{k}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.formSection}>Direction</Text>
          <View style={styles.chipRow}>
            {(['LONG', 'SHORT'] as Direction[]).map((d) => {
              const sel = direction === d;
              const accent = d === 'LONG' ? '#00D4AA' : '#EF4444';
              return (
                <Pressable
                  key={d}
                  style={[
                    styles.chip,
                    sel && { backgroundColor: accent },
                  ]}
                  onPress={() => setDirection(d)}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextOn]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>

          <FormField
            label="Entry Price"
            value={entryPrice}
            onChangeText={setEntryPrice}
            keyboardType="decimal-pad"
            error={validation.entryPrice}
          />
          <FormField
            label="Stop Loss Price"
            value={stopLossPrice}
            onChangeText={setStopLossPrice}
            keyboardType="decimal-pad"
            error={validation.stopLossPrice}
          />
          <FormField
            label="Take Profit Price (optional)"
            value={takeProfitPrice}
            onChangeText={setTakeProfitPrice}
            keyboardType="decimal-pad"
            error={validation.takeProfitPrice}
          />
          <FormField
            label="Lot Size"
            value={lotSize}
            onChangeText={setLotSize}
            keyboardType="decimal-pad"
            error={validation.lotSize}
          />

          <Text style={styles.formSection}>Session</Text>
          <View style={styles.chipRow}>
            {SESSION_OPTIONS.map((s) => {
              const sel = session === s;
              return (
                <Pressable
                  key={s}
                  style={[styles.chip, sel && styles.chipOn]}
                  onPress={() => setSession(s)}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextOn]}>
                    {s.replace('_', ' ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.formSection}>Outcome</Text>
          <View style={styles.chipRow}>
            {OUTCOME_OPTIONS.map((o) => {
              const sel = outcome === o;
              const badge = outcomeBadgeStyle(o);
              return (
                <Pressable
                  key={o}
                  style={[
                    styles.chip,
                    sel && { backgroundColor: badge.bg },
                  ]}
                  onPress={() => setOutcome(o)}
                >
                  <Text style={[styles.chipText, sel && { color: badge.fg }]}>{o}</Text>
                </Pressable>
              );
            })}
          </View>

          <FormField
            label="P&L (negative for loss)"
            value={profitLoss}
            onChangeText={setProfitLoss}
            keyboardType="default"
          />

          <Text style={styles.formSection}>Setup Tag</Text>
          <Pressable style={styles.dropdownBtn} onPress={() => setTagsOpen((v) => !v)}>
            <Text style={styles.dropdownText}>{setupTag ?? 'Select a setup tag'}</Text>
            <Text style={styles.dropdownChevron}>{tagsOpen ? '▴' : '▾'}</Text>
          </Pressable>
          {tagsOpen ? (
            <View style={styles.dropdownList}>
              {SETUP_TAGS.map((tag) => (
                <Pressable
                  key={tag}
                  style={styles.dropdownRow}
                  onPress={() => {
                    setSetupTag(tag);
                    setTagsOpen(false);
                  }}
                >
                  <Text style={styles.dropdownRowText}>{tag}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.formSection}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Why this setup? What went well or wrong?"
            placeholderTextColor="#718096"
          />

          <Pressable
            style={styles.screenshotBtn}
            onPress={() =>
              Alert.alert('Coming soon', 'Screenshot picking will be wired in a later update.')
            }
          >
            <Text style={styles.screenshotBtnText}>Add Screenshot</Text>
          </Pressable>

          {prefill ? (
            <View style={styles.prefillNote}>
              <Text style={styles.prefillNoteText}>
                Pre-filled from calculator · Risk {formatCurrency(calcRisk)} (
                {formatPercent(calcRiskPct, 2)})
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  keyboardType,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  error?: string;
}) {
  return (
    <View style={styles.formFieldWrap}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor="#718096"
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
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    color: '#A0AEC0',
    fontSize: 13,
    marginTop: 2,
  },
  headerCount: {
    alignItems: 'flex-end',
  },
  headerCountNum: {
    color: '#00D4AA',
    fontWeight: '800',
    fontSize: 18,
  },
  headerCountLabel: {
    color: '#A0AEC0',
    fontSize: 11,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 16,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterTabOn: {
    borderBottomColor: '#00D4AA',
  },
  filterTabText: {
    color: '#4A5568',
    fontWeight: '600',
    fontSize: 14,
  },
  filterTabTextOn: {
    color: '#00D4AA',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  stat: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  statLabel: {
    color: '#A0AEC0',
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  upgradeBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#1A202C',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F6C90E',
  },
  upgradeBannerText: {
    color: '#F6C90E',
    fontSize: 12,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    color: '#A0AEC0',
    fontSize: 14,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  card: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  cardInstrument: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  cardDir: {
    fontWeight: '700',
    fontSize: 13,
  },
  outcomeBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  outcomeBadgeText: {
    fontWeight: '800',
    fontSize: 11,
  },
  cardPriceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardCol: {
    flex: 1,
  },
  cardLabel: {
    color: '#A0AEC0',
    fontSize: 11,
    marginBottom: 2,
  },
  cardValue: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  cardMetaText: {
    color: '#A0AEC0',
    fontSize: 12,
  },
  cardMetaTime: {
    marginLeft: 'auto',
  },
  expanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#30363D',
  },
  expandedText: {
    color: '#A0AEC0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  screenshotPlaceholder: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    marginBottom: 10,
  },
  screenshotText: {
    color: '#4A5568',
    fontSize: 12,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteLinkBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  deleteLinkText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00D4AA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPlus: {
    color: '#0D1117',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 30,
  },

  // --- Add-trade form ---
  formScreen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30363D',
  },
  formTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  formCancel: {
    color: '#A0AEC0',
    fontSize: 15,
  },
  formSave: {
    color: '#00D4AA',
    fontWeight: '800',
    fontSize: 15,
  },
  formSaveDisabled: {
    opacity: 0.45,
  },
  formScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formSection: {
    color: '#00D4AA',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2D3748',
  },
  chipOn: {
    backgroundColor: '#00D4AA',
  },
  chipText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  chipTextOn: {
    color: '#0D1117',
  },
  formFieldWrap: {
    marginBottom: 12,
  },
  formLabel: {
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
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  dropdownText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  dropdownChevron: {
    color: '#A0AEC0',
    fontSize: 14,
  },
  dropdownList: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderRadius: 10,
    marginBottom: 8,
  },
  dropdownRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#30363D',
  },
  dropdownRowText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  screenshotBtn: {
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  screenshotBtnText: {
    color: '#A0AEC0',
    fontWeight: '600',
  },
  prefillNote: {
    marginTop: 16,
    backgroundColor: '#1A202C',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  prefillNoteText: {
    color: '#A0AEC0',
    fontSize: 12,
  },
});
