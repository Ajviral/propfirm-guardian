import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RECURRING_NEWS_EVENTS, type RecurringNewsEvent } from '../constants/newsEvents';
import { useNewsStore } from '../store/useNewsStore';
import type { ManualNewsEvent } from '../types';
import { generateUniqueId } from '../utils';

// --- Helpers ----------------------------------------------------------------

type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

function impactColor(impact: ImpactLevel): string {
  switch (impact) {
    case 'HIGH':
      return '#EF4444';
    case 'MEDIUM':
      return '#F97316';
    case 'LOW':
      return '#4A5568';
  }
}

/**
 * Given a recurring event definition, find the next occurrence from `today`.
 * Returns a Date (best-effort; this is a client-side heuristic since we don't
 * have an actual external calendar API wired).
 */
function getNextOccurrence(event: RecurringNewsEvent, today: Date): Date {
  const year = today.getFullYear();
  const month = today.getMonth();

  if (event.dayOfMonth != null && event.weekOfMonth == null) {
    let candidate = new Date(year, month, event.dayOfMonth);
    if (candidate <= today) {
      candidate = new Date(year, month + 1, event.dayOfMonth);
    }
    return candidate;
  }

  if (event.weekOfMonth != null && event.dayOfWeek != null) {
    const find = (m: number): Date => {
      const firstOfMonth = new Date(year, m, 1);
      const firstDow = firstOfMonth.getDay();
      let dayOffset = event.dayOfWeek! - firstDow;
      if (dayOffset < 0) dayOffset += 7;
      const day = 1 + dayOffset + (event.weekOfMonth! - 1) * 7;
      return new Date(year, m, day);
    };

    let candidate = find(month);
    if (candidate <= today) {
      candidate = find(month + 1);
    }
    return candidate;
  }

  if (event.dayOfWeek != null) {
    const d = new Date(today);
    const currentDow = d.getDay();
    let diff = event.dayOfWeek - currentDow;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  return today;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Now';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// --- Swipeable Row ----------------------------------------------------------

function SwipeableRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(g.dx);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -100) {
          Animated.timing(translateX, {
            toValue: -300,
            duration: 200,
            useNativeDriver: true,
          }).start(() => onDelete());
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <View style={swipeStyles.container}>
      <View style={swipeStyles.deleteBackground}>
        <Text style={swipeStyles.deleteText}>Delete</Text>
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: { overflow: 'hidden' },
  deleteBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 24,
  },
  deleteText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});

// --- Main Screen Component --------------------------------------------------

export default function NewsCalendarScreen() {
  const {
    manualNewsEvents,
    newsBlackoutActive,
    notify10MinBefore,
    notify30MinBefore,
    addManualEvent,
    removeManualEvent,
    toggleNewsBlackout,
    setNotify10Min,
    setNotify30Min,
  } = useNewsStore();

  const [modalVisible, setModalVisible] = useState(false);

  // --- Upcoming events computation ---
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const events = RECURRING_NEWS_EVENTS.map((event) => {
      const nextDate = getNextOccurrence(event, now);
      const msUntil = nextDate.getTime() - now.getTime();
      return { event, nextDate, msUntil };
    })
      .filter((e) => e.msUntil >= 0 && e.msUntil <= sevenDaysMs)
      .sort((a, b) => a.msUntil - b.msUntil);

    return events;
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.screenTitle}>News Calendar</Text>
        <Text style={styles.screenSubtitle}>
          Protect your challenge from high-impact news events
        </Text>

        {/* Section 1: News Blackout Toggle */}
        <View style={styles.section}>
          <View style={styles.blackoutRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.blackoutLabel}>News Blackout Mode</Text>
              <Text style={styles.blackoutSubtext}>
                Enable during high-impact news to prevent accidental trading
              </Text>
            </View>
            <Switch
              value={newsBlackoutActive}
              onValueChange={toggleNewsBlackout}
              trackColor={{
                false: '#2D3748',
                true: newsBlackoutActive ? '#EF4444' : '#00D4AA',
              }}
              thumbColor="#FFFFFF"
            />
          </View>
          {newsBlackoutActive && (
            <View style={styles.blackoutBanner}>
              <Text style={styles.blackoutBannerText}>
                TRADING RESTRICTED — News Blackout Active
              </Text>
            </View>
          )}
        </View>

        {/* Section 2: Upcoming Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming High-Impact Events</Text>
          {upcomingEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No high-impact events in the next 7 days
              </Text>
            </View>
          ) : (
            upcomingEvents.map(({ event, nextDate, msUntil }) => (
              <UpcomingEventCard
                key={event.id}
                event={event}
                nextDate={nextDate}
                msUntil={msUntil}
              />
            ))
          )}
        </View>

        {/* Section 4: Manual Events List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manual Events</Text>
          {manualNewsEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No manual events added</Text>
            </View>
          ) : (
            manualNewsEvents.map((ev) => (
              <SwipeableRow key={ev.id} onDelete={() => removeManualEvent(ev.id)}>
                <ManualEventCard event={ev} />
              </SwipeableRow>
            ))
          )}
        </View>

        {/* Section 5: Notification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Settings</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>
                Notify 10 minutes before HIGH impact events
              </Text>
              <Switch
                value={notify10MinBefore}
                onValueChange={setNotify10Min}
                trackColor={{ false: '#2D3748', true: '#00D4AA' }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>
                Notify 30 minutes before HIGH impact events
              </Text>
              <Switch
                value={notify30MinBefore}
                onValueChange={setNotify30Min}
                trackColor={{ false: '#2D3748', true: '#00D4AA' }}
                thumbColor="#FFFFFF"
              />
            </View>
            <View style={styles.divider} />
            <Text style={styles.settingsNote}>
              Actual push notifications require expo-notifications setup in a
              follow-up update
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Section 3: Floating Action Button */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Add manual event"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* Add Manual Event Modal */}
      <AddEventModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={(event) => {
          addManualEvent(event);
          setModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

// --- Sub-components ---------------------------------------------------------

function UpcomingEventCard({
  event,
  nextDate,
  msUntil,
}: {
  event: RecurringNewsEvent;
  nextDate: Date;
  msUntil: number;
}) {
  const isWithin24h = msUntil < 24 * 60 * 60 * 1000;
  const dayStr = nextDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardTop}>
        <Text style={styles.eventName}>{event.name}</Text>
        {isWithin24h && <Text style={styles.warningIcon}>⚠️</Text>}
      </View>
      <View style={styles.eventBadgeRow}>
        <View style={styles.currencyBadge}>
          <Text style={styles.currencyBadgeText}>{event.currency}</Text>
        </View>
        <View style={[styles.impactBadge, { backgroundColor: impactColor(event.impact) }]}>
          <Text style={styles.impactBadgeText}>{event.impact}</Text>
        </View>
      </View>
      <View style={styles.eventCardBottom}>
        <Text style={styles.eventTime}>
          {dayStr} · {event.typicalTime}
        </Text>
        <Text style={[styles.eventCountdown, isWithin24h && styles.countdownUrgent]}>
          {formatCountdown(msUntil)}
        </Text>
      </View>
    </View>
  );
}

function ManualEventCard({ event }: { event: ManualNewsEvent }) {
  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardTop}>
        <Text style={styles.eventName}>{event.name}</Text>
      </View>
      <View style={styles.eventBadgeRow}>
        <View style={[styles.impactBadge, { backgroundColor: impactColor(event.impact) }]}>
          <Text style={styles.impactBadgeText}>{event.impact}</Text>
        </View>
      </View>
      <Text style={styles.eventTime}>
        {event.date} · {event.time}
      </Text>
      {event.notes ? (
        <Text style={styles.eventNotes} numberOfLines={2}>
          {event.notes}
        </Text>
      ) : null}
    </View>
  );
}

function AddEventModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (event: ManualNewsEvent) => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [impact, setImpact] = useState<ImpactLevel>('HIGH');
  const [notes, setNotes] = useState('');

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Event name is required');
      return;
    }
    if (!date.trim()) {
      Alert.alert('Validation', 'Date is required');
      return;
    }
    onSave({
      id: generateUniqueId(),
      name: name.trim(),
      date: date.trim(),
      time: time.trim() || '08:30 ET',
      impact,
      notes: notes.trim() || undefined,
    });
    setName('');
    setDate('');
    setTime('');
    setImpact('HIGH');
    setNotes('');
  }, [name, date, time, impact, notes, onSave]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <Text style={modalStyles.title}>Add Manual Event</Text>

          <Text style={modalStyles.label}>Event Name *</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="e.g. ECB Rate Decision"
            placeholderTextColor="#4A5568"
            value={name}
            onChangeText={setName}
          />

          <Text style={modalStyles.label}>Date *</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#4A5568"
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={modalStyles.label}>Time</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="HH:MM ET"
            placeholderTextColor="#4A5568"
            value={time}
            onChangeText={setTime}
          />

          <Text style={modalStyles.label}>Impact Level</Text>
          <View style={modalStyles.impactRow}>
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
              <Pressable
                key={level}
                onPress={() => setImpact(level)}
                style={[
                  modalStyles.impactChip,
                  { backgroundColor: impact === level ? impactColor(level) : '#2D3748' },
                ]}
              >
                <Text
                  style={[
                    modalStyles.impactChipText,
                    { color: impact === level ? '#FFFFFF' : '#A0AEC0' },
                  ]}
                >
                  {level}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={modalStyles.label}>Notes (optional)</Text>
          <TextInput
            style={[modalStyles.input, modalStyles.textarea]}
            placeholder="Additional context..."
            placeholderTextColor="#4A5568"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />

          <View style={modalStyles.buttonRow}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={modalStyles.saveBtn} onPress={handleSave}>
              <Text style={modalStyles.saveBtnText}>Save Event</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Styles -----------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D1117',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#A0AEC0',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00D4AA',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  // Blackout
  blackoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  blackoutLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  blackoutSubtext: {
    fontSize: 12,
    color: '#A0AEC0',
    lineHeight: 16,
  },
  blackoutBanner: {
    marginTop: 10,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  blackoutBannerText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // Event cards
  eventCard: {
    backgroundColor: '#161B22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363D',
    padding: 14,
    marginBottom: 10,
  },
  eventCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  eventName: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    flex: 1,
  },
  warningIcon: {
    fontSize: 16,
    color: '#F6C90E',
    marginLeft: 8,
  },
  eventBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  currencyBadge: {
    backgroundColor: '#F6C90E',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currencyBadgeText: {
    color: '#0D1117',
    fontSize: 11,
    fontWeight: '800',
  },
  impactBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  impactBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  eventCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventTime: {
    color: '#718096',
    fontSize: 12,
  },
  eventCountdown: {
    color: '#A0AEC0',
    fontSize: 12,
    fontWeight: '600',
  },
  countdownUrgent: {
    color: '#F6C90E',
    fontWeight: '800',
  },
  eventNotes: {
    color: '#A0AEC0',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // Empty state
  emptyCard: {
    backgroundColor: '#161B22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363D',
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#4A5568',
    fontSize: 14,
  },

  // Settings
  settingsCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  settingsLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 8,
  },
  settingsNote: {
    color: '#4A5568',
    fontSize: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2D3748',
    marginHorizontal: 14,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00D4AA',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  fabPressed: {
    opacity: 0.8,
  },
  fabText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0D1117',
    marginTop: -2,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: '#161B22',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#30363D',
    padding: 20,
    maxHeight: '85%',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0AEC0',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#0D1117',
    borderWidth: 1,
    borderColor: '#30363D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
  },
  textarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  impactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  impactChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  impactChipText: {
    fontWeight: '700',
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2D3748',
  },
  cancelBtnText: {
    color: '#A0AEC0',
    fontWeight: '700',
    fontSize: 14,
  },
  saveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#00D4AA',
  },
  saveBtnText: {
    color: '#0D1117',
    fontWeight: '800',
    fontSize: 14,
  },
});
