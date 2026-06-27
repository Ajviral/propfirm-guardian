import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { INSTRUMENTS } from '../constants/calculatorInstruments';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import { useLiquidityStore } from '../store/useLiquidityStore';
import type { LiquidityLevel, RootStackParamList } from '../types';
import { formatTimestamp, generateUniqueId } from '../utils';

type Props = NativeStackScreenProps<RootStackParamList, 'LiquidityTracker'>;
type LevelType = LiquidityLevel['type'];
type LevelStatus = LiquidityLevel['status'];
type InstrumentKey = keyof typeof INSTRUMENTS;
type FilterKey = 'ALL' | 'UNTAPPED' | 'SWEPT' | InstrumentKey;
type SessionOption = 'ASIAN' | 'LONDON' | 'NEW_YORK';

const INSTRUMENT_KEYS = Object.keys(INSTRUMENTS) as InstrumentKey[];
const SESSION_OPTIONS: SessionOption[] = ['ASIAN', 'LONDON', 'NEW_YORK'];
const STATUS_OPTIONS: LevelStatus[] = ['UNTAPPED', 'SWEPT', 'PARTIALLY_SWEPT'];

const LEVEL_TYPE_META: Record<LevelType, { color: string; label: string }> = {
  PDH: { color: '#00D4AA', label: 'Previous Daily High' },
  PDL: { color: '#EF4444', label: 'Previous Daily Low' },
  PWH: { color: '#4A90D9', label: 'Previous Weekly High' },
  PWL: { color: '#F97316', label: 'Previous Weekly Low' },
  PMH: { color: '#9B59B6', label: 'Previous Monthly High' },
  PML: { color: '#F6C90E', label: 'Previous Monthly Low' },
};

/** Status palette for level cards and the form selector. */
function statusStyle(status: LevelStatus): { bg: string; fg: string } {
  switch (status) {
    case 'UNTAPPED':
      return { bg: '#00D4AA', fg: '#0D1117' };
    case 'PARTIALLY_SWEPT':
      return { bg: '#F6C90E', fg: '#0D1117' };
    case 'SWEPT':
    default:
      return { bg: '#4A5568', fg: '#FFFFFF' };
  }
}

/** Group cards by macro horizon: monthly (M) > weekly (W) > daily (D). */
const GROUPS: { title: string; types: LevelType[] }[] = [
  { title: 'Monthly Levels', types: ['PMH', 'PML'] },
  { title: 'Weekly Levels', types: ['PWH', 'PWL'] },
  { title: 'Daily Levels', types: ['PDH', 'PDL'] },
];

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'UNTAPPED', label: 'Untapped' },
  { key: 'SWEPT', label: 'Swept' },
  ...INSTRUMENT_KEYS.map((k) => ({ key: k as FilterKey, label: k })),
];

function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export default function LiquidityTrackerScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const profileId = route.params.profileId;
  const profile = useFirmProfileStore((s) =>
    s.profiles.find((p) => p.id === profileId) ?? null,
  );

  const levels = useLiquidityStore((s) => s.levels);
  const addLevel = useLiquidityStore((s) => s.addLevel);
  const deleteLevel = useLiquidityStore((s) => s.deleteLevel);
  const updateLevel = useLiquidityStore((s) => s.updateLevel);
  const markAsSwept = useLiquidityStore((s) => s.markAsSwept);

  const profileLevels = useMemo(
    () =>
      levels
        .filter((l) => l.profileId === profileId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [levels, profileId],
  );

  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // `LiquidityLevel` has no `instrument` field, so we tag it inside `notes`
  // as `[INSTRUMENT] …` when saving and read it back here for the symbol filters.
  const display = useMemo(() => {
    if (filter === 'ALL') return profileLevels;
    if (filter === 'UNTAPPED') return profileLevels.filter((l) => l.status === 'UNTAPPED');
    if (filter === 'SWEPT') return profileLevels.filter((l) => l.status === 'SWEPT');
    return profileLevels.filter((l) => (l.notes ?? '').startsWith(`[${filter}]`));
  }, [profileLevels, filter]);

  const grouped = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      items: display.filter((l) => g.types.includes(l.type)),
    }));
  }, [display]);

  const onSave = (level: LiquidityLevel) => {
    addLevel(level);
    setFormOpen(false);
  };

  const onDelete = (id: string) => {
    Alert.alert('Delete level', 'Remove this liquidity level?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteLevel(id);
          if (expandedId === id) setExpandedId(null);
        },
      },
    ]);
  };

  const onToggleStatus = (level: LiquidityLevel) => {
    if (level.status === 'UNTAPPED') {
      markAsSwept(level.id);
    } else if (level.status === 'SWEPT') {
      updateLevel(level.id, { status: 'UNTAPPED' });
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{profile?.firmName ?? 'Liquidity'}</Text>
        <Text style={styles.headerSub}>
          {profile?.challengeName ?? 'Profile not found'} · {profileLevels.length} levels
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {FILTER_TABS.map((tab) => {
          const on = filter === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setFilter(tab.key)}
              style={[styles.filterChip, on && styles.filterChipOn]}
            >
              <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {profileLevels.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No liquidity levels tracked</Text>
          <Text style={styles.emptySub}>
            Add key price levels to monitor before your next trade
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map((g) => (
            <View key={g.title} style={styles.groupBlock}>
              <Text style={styles.groupHeader}>{g.title}</Text>
              {g.items.length === 0 ? (
                <Text style={styles.groupEmpty}>No levels in this filter.</Text>
              ) : (
                g.items.map((level) => (
                  <SwipeableRow key={level.id} onDelete={() => onDelete(level.id)}>
                    <LevelCard
                      level={level}
                      expanded={expandedId === level.id}
                      onToggle={() =>
                        setExpandedId((cur) => (cur === level.id ? null : level.id))
                      }
                      onToggleStatus={() => onToggleStatus(level)}
                    />
                  </SwipeableRow>
                ))
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable
        style={[styles.fab, { bottom: 24 + insets.bottom }]}
        onPress={() => setFormOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add liquidity level"
      >
        <Text style={styles.fabPlus}>+</Text>
      </Pressable>

      <Modal
        visible={formOpen}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setFormOpen(false)}
      >
        <AddLevelForm
          profileId={profileId}
          onCancel={() => setFormOpen(false)}
          onSave={onSave}
        />
      </Modal>
    </SafeAreaView>
  );
}

// --- Subcomponents --------------------------------------------------------

function LevelCard({
  level,
  expanded,
  onToggle,
  onToggleStatus,
}: {
  level: LiquidityLevel;
  expanded: boolean;
  onToggle: () => void;
  onToggleStatus: () => void;
}) {
  const meta = LEVEL_TYPE_META[level.type];
  const status = statusStyle(level.status);
  const notes = level.notes ?? '';
  const stripped = notes.replace(/^\[(XAUUSD|NAS100|US30)\]\s*/, '');
  const instrumentTag =
    notes.startsWith('[XAUUSD]')
      ? 'XAUUSD'
      : notes.startsWith('[NAS100]')
        ? 'NAS100'
        : notes.startsWith('[US30]')
          ? 'US30'
          : null;
  const preview = stripped.length > 50 ? `${stripped.slice(0, 50)}…` : stripped;

  return (
    <Pressable style={[styles.card, { borderLeftColor: meta.color }]} onPress={onToggle}>
      <View style={styles.cardTopRow}>
        <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.typeBadgeText}>{level.type}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusBadgeText, { color: status.fg }]}>
            {level.status === 'PARTIALLY_SWEPT' ? 'PARTIAL' : level.status}
          </Text>
        </View>
      </View>

      <Text style={styles.priceText}>{level.price}</Text>

      <View style={styles.metaRow}>
        {instrumentTag ? <Text style={styles.metaTag}>{instrumentTag}</Text> : null}
        <Text style={styles.metaTag}>{level.session.replace('_', ' ')}</Text>
        <Text style={[styles.metaTag, styles.metaTime]}>{formatTimestamp(level.createdAt)}</Text>
      </View>

      {preview ? (
        <Text style={styles.notesPreview} numberOfLines={expanded ? undefined : 1}>
          {expanded ? stripped : preview}
        </Text>
      ) : null}

      <View style={styles.cardActions}>
        {level.status === 'UNTAPPED' ? (
          <Pressable style={styles.markBtn} onPress={onToggleStatus}>
            <Text style={styles.markBtnText}>Mark Swept</Text>
          </Pressable>
        ) : null}
        {level.status === 'SWEPT' ? (
          <Pressable style={[styles.markBtn, styles.markBtnAlt]} onPress={onToggleStatus}>
            <Text style={[styles.markBtnText, styles.markBtnTextAlt]}>Mark Untapped</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Swipe-left to reveal a Delete affordance, with a small threshold so the underlying
 * ScrollView still wins on vertical drags. Tap-through still works because PanResponder
 * only takes over once horizontal movement exceeds the threshold.
 */
function SwipeableRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opened = useRef(false);

  const reset = (toValue: number) => {
    opened.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dy) < 12,
      onPanResponderMove: (_, g) => {
        const base = opened.current ? -88 : 0;
        const next = base + g.dx;
        translateX.setValue(Math.max(-120, Math.min(0, next)));
      },
      onPanResponderRelease: (_, g) => {
        const final = (opened.current ? -88 : 0) + g.dx;
        if (final < -50) reset(-88);
        else reset(0);
      },
      onPanResponderTerminate: () => reset(0),
    }),
  ).current;

  return (
    <View style={styles.swipeWrap}>
      <Pressable
        style={styles.swipeDeleteBg}
        onPress={() => {
          reset(0);
          onDelete();
        }}
      >
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </Pressable>
      <Animated.View
        style={[styles.swipeFront, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function AddLevelForm({
  profileId,
  onCancel,
  onSave,
}: {
  profileId: string;
  onCancel: () => void;
  onSave: (level: LiquidityLevel) => void;
}) {
  const [instrument, setInstrument] = useState<InstrumentKey>('XAUUSD');
  const [type, setType] = useState<LevelType>('PDH');
  const [price, setPrice] = useState('');
  const [session, setSession] = useState<SessionOption>('NEW_YORK');
  const [status, setStatus] = useState<LevelStatus>('UNTAPPED');
  const [notes, setNotes] = useState('');

  const priceNum = parseNum(price);
  const isValid = priceNum !== null && priceNum > 0;

  const handleSave = () => {
    if (!isValid || priceNum === null) return;
    // Persist the chosen instrument inside `notes` (the LiquidityLevel type doesn't
    // include `instrument` directly), prefixed so list filters can resolve it back.
    const trimmedNotes = notes.trim();
    const taggedNotes = `[${instrument}]${trimmedNotes ? ` ${trimmedNotes}` : ''}`;
    const level: LiquidityLevel = {
      id: generateUniqueId(),
      profileId,
      type,
      price: priceNum,
      session,
      status,
      notes: taggedNotes,
      createdAt: new Date().toISOString(),
    };
    onSave(level);
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
          <Text style={styles.formTitle}>New level</Text>
          <Pressable onPress={handleSave} disabled={!isValid}>
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

          <Text style={styles.formSection}>Level Type</Text>
          <View style={styles.typeGrid}>
            {(Object.keys(LEVEL_TYPE_META) as LevelType[]).map((k) => {
              const sel = type === k;
              const meta = LEVEL_TYPE_META[k];
              return (
                <Pressable
                  key={k}
                  style={[
                    styles.typeGridBtn,
                    { borderColor: meta.color },
                    sel && { backgroundColor: meta.color },
                  ]}
                  onPress={() => setType(k)}
                >
                  <Text style={[styles.typeGridCode, { color: sel ? '#0D1117' : meta.color }]}>
                    {k}
                  </Text>
                  <Text
                    style={[
                      styles.typeGridLabel,
                      { color: sel ? '#0D1117' : '#A0AEC0' },
                    ]}
                    numberOfLines={2}
                  >
                    {meta.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.formSection}>Price</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor="#718096"
          />
          {!isValid && price.trim() !== '' ? (
            <Text style={styles.errorText}>Enter a positive price.</Text>
          ) : null}

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

          <Text style={styles.formSection}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => {
              const sel = status === s;
              const sty = statusStyle(s);
              return (
                <Pressable
                  key={s}
                  style={[styles.chip, sel && { backgroundColor: sty.bg }]}
                  onPress={() => setStatus(s)}
                >
                  <Text style={[styles.chipText, sel && { color: sty.fg }]}>
                    {s.replace('_', ' ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.formSection}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Optional context, e.g. weekly liquidity sweep zone"
            placeholderTextColor="#718096"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  flex: { flex: 1 },
  headerCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
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
  filterScroll: {
    marginTop: 12,
    marginBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1A202C',
    borderWidth: 1,
    borderColor: '#2D3748',
    marginRight: 8,
  },
  filterChipOn: {
    backgroundColor: '#00D4AA',
    borderColor: '#00D4AA',
  },
  filterChipText: {
    color: '#A0AEC0',
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipTextOn: {
    color: '#0D1117',
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    paddingTop: 4,
  },
  groupBlock: {
    marginBottom: 12,
  },
  groupHeader: {
    color: '#A0AEC0',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    marginVertical: 8,
  },
  groupEmpty: {
    color: '#4A5568',
    fontSize: 12,
    marginBottom: 8,
  },

  // --- Swipeable wrapper
  swipeWrap: {
    position: 'relative',
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  swipeDeleteBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 88,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  swipeFront: {
    backgroundColor: '#161B22',
    borderRadius: 12,
  },

  // --- Card
  card: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#30363D',
    borderLeftWidth: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  priceText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  metaTag: {
    color: '#A0AEC0',
    fontSize: 12,
  },
  metaTime: {
    marginLeft: 'auto',
  },
  notesPreview: {
    color: '#A0AEC0',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  markBtn: {
    backgroundColor: '#00D4AA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  markBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 12,
  },
  markBtnAlt: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#4A5568',
  },
  markBtnTextAlt: {
    color: '#FFFFFF',
  },

  // --- FAB
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

  // --- Form
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  typeGridBtn: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#161B22',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 80,
    justifyContent: 'center',
  },
  typeGridCode: {
    fontWeight: '800',
    fontSize: 16,
  },
  typeGridLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
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
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 6,
  },
});
