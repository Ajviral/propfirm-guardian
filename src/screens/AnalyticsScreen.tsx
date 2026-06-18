import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { INSTRUMENTS } from '../constants/calculatorInstruments';
import { useFirmProfileStore } from '../store/useFirmProfileStore';
import { useJournalStore } from '../store/useJournalStore';
import type { FirmProfile, RootStackParamList, TradeEntry } from '../types';
import { formatCurrency, formatPercent, formatTimestamp } from '../utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

const SESSION_KEYS = ['ASIAN', 'LONDON', 'NEW_YORK', 'OFF_SESSION'] as const;
type SessionKey = (typeof SESSION_KEYS)[number];

export interface AnalyticsData {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  averageWin: number;
  averageLoss: number;
  averageRR: number;
  bestTrade: TradeEntry | null;
  worstTrade: TradeEntry | null;
  longestWinStreak: number;
  longestLossStreak: number;
  currentStreak: number;
  currentStreakType: 'WIN' | 'LOSS' | 'NONE';
  winRateByInstrument: Record<string, number>;
  winRateBySession: Record<string, number>;
  winRateBySetupTag: Record<string, number>;
  dailyPnL: { date: string; pnl: number }[];
  challengeSurvivalScore: number;
}

/**
 * Group win-rate by an arbitrary key, returning percentages with sample size baked in
 * (callers can re-derive counts from the same trades when needed).
 */
function winRateByKey<T extends string>(
  trades: TradeEntry[],
  picker: (t: TradeEntry) => T | undefined,
): { rate: Record<string, number>; counts: Record<string, { wins: number; total: number }> } {
  const counts: Record<string, { wins: number; total: number }> = {};
  for (const t of trades) {
    const key = picker(t);
    if (!key) continue;
    if (!counts[key]) counts[key] = { wins: 0, total: 0 };
    if (t.outcome === 'WIN' || t.outcome === 'LOSS' || t.outcome === 'BREAKEVEN') {
      counts[key].total += 1;
      if (t.outcome === 'WIN') counts[key].wins += 1;
    }
  }
  const rate: Record<string, number> = {};
  for (const key of Object.keys(counts)) {
    const c = counts[key];
    rate[key] = c.total > 0 ? (c.wins / c.total) * 100 : 0;
  }
  return { rate, counts };
}

export function calculateAnalytics(
  trades: TradeEntry[],
  profile: FirmProfile,
): AnalyticsData {
  const closedTrades = trades.filter(
    (t) => t.outcome === 'WIN' || t.outcome === 'LOSS' || t.outcome === 'BREAKEVEN',
  );
  const wins = closedTrades.filter((t) => t.outcome === 'WIN');
  const losses = closedTrades.filter((t) => t.outcome === 'LOSS');

  const totalTrades = trades.length;
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const totalPnL = trades.reduce((acc, t) => acc + (t.profitLoss ?? 0), 0);

  const averageWin =
    wins.length > 0 ? wins.reduce((a, t) => a + (t.profitLoss ?? 0), 0) / wins.length : 0;
  const averageLoss =
    losses.length > 0 ? losses.reduce((a, t) => a + (t.profitLoss ?? 0), 0) / losses.length : 0;

  // Average R:R uses planned reward / planned risk (TP & stop both required).
  let rrSum = 0;
  let rrCount = 0;
  for (const t of trades) {
    if (t.takeProfitPrice && t.entryPrice && t.stopLossPrice) {
      const risk = Math.abs(t.entryPrice - t.stopLossPrice);
      const reward = Math.abs(t.takeProfitPrice - t.entryPrice);
      if (risk > 0) {
        rrSum += reward / risk;
        rrCount += 1;
      }
    }
  }
  const averageRR = rrCount > 0 ? rrSum / rrCount : 0;

  // Best / worst by realised P&L.
  let bestTrade: TradeEntry | null = null;
  let worstTrade: TradeEntry | null = null;
  for (const t of trades) {
    const pnl = t.profitLoss ?? 0;
    if (bestTrade === null || pnl > (bestTrade.profitLoss ?? 0)) bestTrade = t;
    if (worstTrade === null || pnl < (worstTrade.profitLoss ?? 0)) worstTrade = t;
  }

  // Streaks operate on the chronological close order (oldest → newest); BREAKEVEN/OPEN reset.
  const closedChrono = [...closedTrades].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : 1,
  );
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let runWin = 0;
  let runLoss = 0;
  for (const t of closedChrono) {
    if (t.outcome === 'WIN') {
      runWin += 1;
      runLoss = 0;
    } else if (t.outcome === 'LOSS') {
      runLoss += 1;
      runWin = 0;
    } else {
      runWin = 0;
      runLoss = 0;
    }
    if (runWin > longestWinStreak) longestWinStreak = runWin;
    if (runLoss > longestLossStreak) longestLossStreak = runLoss;
  }

  let currentStreak = 0;
  let currentStreakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  if (closedChrono.length > 0) {
    const lastOutcome = closedChrono[closedChrono.length - 1].outcome;
    if (lastOutcome === 'WIN') currentStreakType = 'WIN';
    else if (lastOutcome === 'LOSS') currentStreakType = 'LOSS';
    if (currentStreakType !== 'NONE') {
      for (let i = closedChrono.length - 1; i >= 0; i -= 1) {
        if (closedChrono[i].outcome === currentStreakType) currentStreak += 1;
        else break;
      }
    }
  }

  const { rate: winRateByInstrument } = winRateByKey(trades, (t) => t.instrument as string);
  const { rate: winRateBySession } = winRateByKey(trades, (t) => t.session);
  const { rate: winRateBySetupTag } = winRateByKey(
    trades,
    (t) => (t.setupTag ? (t.setupTag as string) : undefined),
  );

  // Daily P&L grouping by ISO calendar date (UTC slice from the timestamp).
  const dailyMap = new Map<string, number>();
  for (const t of trades) {
    const date = t.timestamp.slice(0, 10);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + (t.profitLoss ?? 0));
  }
  const dailyPnL = Array.from(dailyMap.entries())
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Survival score: deduct on drawdown vs max loss + loss streak; bonus for current win streak.
  let score = 100;
  const maxLossDollars = profile.accountSize * (profile.maxLossLimitPercent / 100);
  const drawdown = Math.max(0, profile.accountSize - profile.currentEquity);
  if (maxLossDollars > 0) {
    const drawdownRatio = Math.min(1, drawdown / maxLossDollars);
    score -= drawdownRatio * 60; // up to -60 for full max-loss exposure
  }
  const lossPenaltyStreak =
    currentStreakType === 'LOSS' ? currentStreak : Math.min(longestLossStreak, 3);
  score -= Math.min(30, lossPenaltyStreak * 5); // up to -30
  if (currentStreakType === 'WIN') {
    score += Math.min(10, currentStreak * 2); // up to +10
  }
  const challengeSurvivalScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    totalTrades,
    winRate,
    totalPnL,
    averageWin,
    averageLoss,
    averageRR,
    bestTrade,
    worstTrade,
    longestWinStreak,
    longestLossStreak,
    currentStreak,
    currentStreakType,
    winRateByInstrument,
    winRateBySession,
    winRateBySetupTag,
    dailyPnL,
    challengeSurvivalScore,
  };
}

function survivalColor(score: number): string {
  if (score >= 70) return '#00D4AA';
  if (score >= 40) return '#F6C90E';
  return '#EF4444';
}

export default function AnalyticsScreen({ route }: Props) {
  const profileId = route.params.profileId;
  const profile = useFirmProfileStore((s) =>
    s.profiles.find((p) => p.id === profileId) ?? null,
  );
  const trades = useJournalStore((s) => s.trades);

  const profileTrades = useMemo(
    () => trades.filter((t) => t.profileId === profileId),
    [trades, profileId],
  );

  // All hooks must run unconditionally — early-return UI is handled at the bottom.
  const data = useMemo(
    () => (profile ? calculateAnalytics(profileTrades, profile) : null),
    [profileTrades, profile],
  );

  const sortedAsc = useMemo(
    () => [...profileTrades].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1)),
    [profileTrades],
  );

  const closedTotals = useMemo(() => {
    const wins = profileTrades.filter((t) => t.outcome === 'WIN').length;
    const losses = profileTrades.filter((t) => t.outcome === 'LOSS').length;
    const breakeven = profileTrades.filter((t) => t.outcome === 'BREAKEVEN').length;
    const total = wins + losses + breakeven;
    return { wins, losses, breakeven, total };
  }, [profileTrades]);

  const instrumentRows = useMemo(() => {
    const rows: { key: string; rate: number; total: number }[] = [];
    for (const key of Object.keys(INSTRUMENTS)) {
      const tradesForKey = profileTrades.filter((t) => t.instrument === key);
      const closed = tradesForKey.filter(
        (t) => t.outcome === 'WIN' || t.outcome === 'LOSS' || t.outcome === 'BREAKEVEN',
      );
      const w = closed.filter((t) => t.outcome === 'WIN').length;
      rows.push({
        key,
        rate: closed.length > 0 ? (w / closed.length) * 100 : 0,
        total: tradesForKey.length,
      });
    }
    return rows;
  }, [profileTrades]);

  const sessionRows = useMemo(() => {
    const rows: { key: SessionKey; rate: number; total: number }[] = [];
    for (const key of SESSION_KEYS) {
      const tradesForKey = profileTrades.filter((t) => t.session === key);
      const closed = tradesForKey.filter(
        (t) => t.outcome === 'WIN' || t.outcome === 'LOSS' || t.outcome === 'BREAKEVEN',
      );
      const w = closed.filter((t) => t.outcome === 'WIN').length;
      rows.push({
        key,
        rate: closed.length > 0 ? (w / closed.length) * 100 : 0,
        total: tradesForKey.length,
      });
    }
    return rows;
  }, [profileTrades]);

  const setupRows = useMemo(() => {
    const counts: Record<string, { wins: number; total: number }> = {};
    for (const t of profileTrades) {
      if (!t.setupTag) continue;
      if (!counts[t.setupTag]) counts[t.setupTag] = { wins: 0, total: 0 };
      if (t.outcome === 'WIN' || t.outcome === 'LOSS' || t.outcome === 'BREAKEVEN') {
        counts[t.setupTag].total += 1;
        if (t.outcome === 'WIN') counts[t.setupTag].wins += 1;
      }
    }
    return Object.entries(counts)
      .filter(([, c]) => c.total >= 2) // at least 2 closed trades on a tag to be ranked
      .map(([tag, c]) => ({ tag, rate: (c.wins / c.total) * 100, total: c.total }))
      .sort((a, b) => b.rate - a.rate);
  }, [profileTrades]);

  const winLossSeg = useMemo(() => {
    const total = closedTotals.total || 1;
    return {
      win: (closedTotals.wins / total) * 100,
      loss: (closedTotals.losses / total) * 100,
      be: (closedTotals.breakeven / total) * 100,
    };
  }, [closedTotals]);

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Profile not found</Text>
          <Text style={styles.emptySub}>This profile may have been deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (profileTrades.length < 3 || !data) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Log at least 3 trades to see your analytics</Text>
          <Text style={styles.emptySub}>Your performance insights will appear here</Text>
          <Text style={styles.emptyMeta}>
            {profile.firmName} · {profile.challengeName} · {profileTrades.length} logged
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const firstTs = sortedAsc[0].timestamp;
  const lastTs = sortedAsc[sortedAsc.length - 1].timestamp;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* §1 Header */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Profile</Text>
          <Text style={styles.headerTitle}>{profile.firmName}</Text>
          <Text style={styles.headerSub}>{profile.challengeName}</Text>
          <Text style={styles.helper}>
            {formatTimestamp(firstTs)} — {formatTimestamp(lastTs)}
          </Text>
          <Text style={styles.helper}>{data.totalTrades} trades</Text>
        </View>

        {/* §2 Survival score */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Challenge Survival Score</Text>
          <View style={styles.survivalRow}>
            <SurvivalRing score={data.challengeSurvivalScore} />
            <View style={styles.survivalText}>
              <Text style={styles.survivalCaption}>
                Composite of drawdown vs max-loss limit, current loss streak, and recent win streak.
              </Text>
              <View style={styles.survivalGauge}>
                <View
                  style={[
                    styles.survivalGaugeFill,
                    {
                      width: `${data.challengeSurvivalScore}%`,
                      backgroundColor: survivalColor(data.challengeSurvivalScore),
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        {/* §3 Stat grid */}
        <View style={styles.statGrid}>
          <StatCard label="Win Rate" value={formatPercent(data.winRate, 1)} />
          <StatCard
            label="Total P&L"
            value={formatCurrency(data.totalPnL)}
            color={data.totalPnL >= 0 ? '#00D4AA' : '#EF4444'}
          />
          <StatCard
            label="Avg RR"
            value={data.averageRR > 0 ? `1 : ${data.averageRR.toFixed(2)}` : '—'}
          />
          <StatCard label="Total Trades" value={`${data.totalTrades}`} />
        </View>

        {/* §4 Win/Loss/BE breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Win / Loss Breakdown</Text>
          <View style={styles.breakdownBar}>
            <View
              style={[styles.breakdownSeg, { flex: winLossSeg.win || 0.0001, backgroundColor: '#00D4AA' }]}
            />
            <View
              style={[
                styles.breakdownSeg,
                { flex: winLossSeg.be || 0.0001, backgroundColor: '#F6C90E' },
              ]}
            />
            <View
              style={[
                styles.breakdownSeg,
                { flex: winLossSeg.loss || 0.0001, backgroundColor: '#EF4444' },
              ]}
            />
          </View>
          <View style={styles.breakdownLegend}>
            <Text style={styles.breakdownItem}>
              <Text style={[styles.dot, { color: '#00D4AA' }]}>●</Text> Wins {closedTotals.wins}
            </Text>
            <Text style={styles.breakdownItem}>
              <Text style={[styles.dot, { color: '#F6C90E' }]}>●</Text> BE {closedTotals.breakeven}
            </Text>
            <Text style={styles.breakdownItem}>
              <Text style={[styles.dot, { color: '#EF4444' }]}>●</Text> Losses {closedTotals.losses}
            </Text>
          </View>
        </View>

        {/* §5 By instrument */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Performance by Instrument</Text>
          {instrumentRows.map((r) => (
            <RateRow key={r.key} title={r.key} rate={r.rate} count={r.total} />
          ))}
        </View>

        {/* §6 By session */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Performance by Session</Text>
          {sessionRows.map((r) => (
            <RateRow key={r.key} title={r.key.replace('_', ' ')} rate={r.rate} count={r.total} />
          ))}
        </View>

        {/* §7 By setup tag */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Performance by Setup Tag</Text>
          {setupRows.length === 0 ? (
            <Text style={styles.helper}>
              Log two or more closed trades on the same setup tag to see rankings.
            </Text>
          ) : (
            setupRows.map((r) => (
              <RateRow key={r.tag} title={r.tag} rate={r.rate} count={r.total} />
            ))
          )}
        </View>

        {/* §8 Streak tracker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Streaks</Text>
          <View style={styles.streakBig}>
            <Text style={styles.streakBigLabel}>Current streak</Text>
            <Text
              style={[
                styles.streakBigValue,
                {
                  color:
                    data.currentStreakType === 'WIN'
                      ? '#00D4AA'
                      : data.currentStreakType === 'LOSS'
                        ? '#EF4444'
                        : '#A0AEC0',
                },
              ]}
            >
              {data.currentStreakType === 'NONE'
                ? '—'
                : `${data.currentStreak} ${data.currentStreakType}${
                    data.currentStreak === 1 ? '' : 's'
                  }`}
            </Text>
          </View>
          <View style={styles.streakRow}>
            <View style={styles.streakChip}>
              <Text style={styles.helper}>Best win streak</Text>
              <Text style={[styles.streakChipValue, { color: '#00D4AA' }]}>
                {data.longestWinStreak}
              </Text>
            </View>
            <View style={styles.streakChip}>
              <Text style={styles.helper}>Worst loss streak</Text>
              <Text style={[styles.streakChipValue, { color: '#EF4444' }]}>
                {data.longestLossStreak}
              </Text>
            </View>
          </View>
        </View>

        {/* §9 Daily P&L bar chart */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Daily P&amp;L</Text>
          <DailyPnLChart data={data.dailyPnL} />
        </View>

        {/* §10 Best & worst trade */}
        <View style={styles.bestWorstRow}>
          <TradeMiniCard label="Best Trade" trade={data.bestTrade} positive />
          <TradeMiniCard label="Worst Trade" trade={data.worstTrade} positive={false} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Subcomponents ---------------------------------------------------------

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function RateRow({ title, rate, count }: { title: string; rate: number; count: number }) {
  const fillPct = Math.max(0, Math.min(100, rate));
  const color = rate >= 50 ? '#00D4AA' : rate >= 40 ? '#F6C90E' : '#EF4444';
  return (
    <View style={styles.rateRow}>
      <View style={styles.rateRowHead}>
        <Text style={styles.rateTitle}>{title}</Text>
        <Text style={styles.rateMeta}>
          {count > 0 ? `${formatPercent(rate, 1)} · ${count} trades` : 'No trades'}
        </Text>
      </View>
      <View style={styles.rateTrack}>
        <View style={[styles.rateFill, { width: `${fillPct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/**
 * Score "ring" without external libs: thick colored circular border + score in middle.
 * Plus a thin linear gauge behind it to communicate exact 0–100 progress.
 */
function SurvivalRing({ score }: { score: number }) {
  const color = survivalColor(score);
  return (
    <View style={styles.ringWrap}>
      <View
        style={[
          styles.ringOuter,
          { borderColor: color },
        ]}
      >
        <Text style={[styles.ringScore, { color }]}>{score}</Text>
        <Text style={styles.ringScoreCaption}>/ 100</Text>
      </View>
    </View>
  );
}

function TradeMiniCard({
  label,
  trade,
  positive,
}: {
  label: string;
  trade: TradeEntry | null;
  positive: boolean;
}) {
  const accent = positive ? '#00D4AA' : '#EF4444';
  return (
    <View style={[styles.miniCard, { borderLeftColor: accent }]}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {trade ? (
        <>
          <Text style={styles.miniInstrument}>
            {trade.instrument} · {trade.direction}
          </Text>
          <Text style={[styles.miniValue, { color: accent }]}>
            {formatCurrency(trade.profitLoss ?? 0)}
          </Text>
          <Text style={styles.helper}>
            Entry {trade.entryPrice} · Stop {trade.stopLossPrice}
          </Text>
          <Text style={styles.helper}>{formatTimestamp(trade.timestamp)}</Text>
        </>
      ) : (
        <Text style={styles.helper}>No trades yet</Text>
      )}
    </View>
  );
}

/**
 * Simple bar chart of daily P&L using only Views — green above the zero line, red below.
 * Heights are scaled against the max absolute daily value.
 */
function DailyPnLChart({ data }: { data: { date: string; pnl: number }[] }) {
  if (data.length === 0) {
    return <Text style={styles.helper}>No daily data yet.</Text>;
  }

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.pnl)));
  const totalPnL = data.reduce((a, d) => a + d.pnl, 0);
  const chartH = 140;
  const halfH = chartH / 2;

  return (
    <View>
      <View style={styles.chartZeroLineWrap}>
        <View style={styles.chartZeroLine} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScroll}>
          {data.map((d) => {
            const ratio = Math.abs(d.pnl) / maxAbs;
            const h = Math.max(2, ratio * (halfH - 4));
            const isPos = d.pnl >= 0;
            return (
              <View key={d.date} style={styles.barCol}>
                <View style={styles.barHalf}>
                  {isPos ? (
                    <View
                      style={[
                        styles.bar,
                        { height: h, backgroundColor: '#00D4AA', alignSelf: 'flex-end' },
                      ]}
                    />
                  ) : (
                    <View style={styles.barSpacerTop} />
                  )}
                </View>
                <View style={styles.barHalf}>
                  {!isPos ? (
                    <View
                      style={[
                        styles.bar,
                        { height: h, backgroundColor: '#EF4444', alignSelf: 'flex-start' },
                      ]}
                    />
                  ) : (
                    <View style={styles.barSpacerBottom} />
                  )}
                </View>
                <Text style={styles.barLabel} numberOfLines={1}>
                  {d.date.slice(5)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.chartFooter}>
        <Text style={styles.helper}>Max |PnL|: {formatCurrency(maxAbs)}</Text>
        <Text style={[styles.helper, { color: totalPnL >= 0 ? '#00D4AA' : '#EF4444' }]}>
          Net: {formatCurrency(totalPnL)}
        </Text>
      </View>
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
  sectionLabel: {
    color: '#00D4AA',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  helper: {
    color: '#A0AEC0',
    fontSize: 12,
    lineHeight: 18,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 20,
  },
  headerSub: {
    color: '#A0AEC0',
    fontSize: 14,
    marginBottom: 8,
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
    marginBottom: 8,
  },
  emptyMeta: {
    color: '#4A5568',
    fontSize: 12,
    marginTop: 12,
  },

  // Survival score
  survivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  survivalText: {
    flex: 1,
  },
  survivalCaption: {
    color: '#A0AEC0',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  survivalGauge: {
    height: 8,
    backgroundColor: '#2D3748',
    borderRadius: 4,
    overflow: 'hidden',
  },
  survivalGaugeFill: {
    height: '100%',
    borderRadius: 4,
  },
  ringWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1117',
  },
  ringScore: {
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 40,
  },
  ringScoreCaption: {
    color: '#A0AEC0',
    fontSize: 11,
    marginTop: 2,
  },

  // Stat grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#1A202C',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2D3748',
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
    fontSize: 18,
  },

  // Win/Loss bar
  breakdownBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#2D3748',
    marginVertical: 8,
  },
  breakdownSeg: {
    height: '100%',
  },
  breakdownLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  breakdownItem: {
    color: '#A0AEC0',
    fontSize: 12,
  },
  dot: {
    fontSize: 12,
  },

  // Performance rows
  rateRow: {
    marginBottom: 10,
  },
  rateRowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rateTitle: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  rateMeta: {
    color: '#A0AEC0',
    fontSize: 12,
  },
  rateTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2D3748',
    overflow: 'hidden',
  },
  rateFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Streaks
  streakBig: {
    alignItems: 'center',
    marginBottom: 12,
  },
  streakBigLabel: {
    color: '#A0AEC0',
    fontSize: 12,
    marginBottom: 4,
  },
  streakBigValue: {
    fontWeight: '800',
    fontSize: 28,
  },
  streakRow: {
    flexDirection: 'row',
    gap: 10,
  },
  streakChip: {
    flex: 1,
    backgroundColor: '#1A202C',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  streakChipValue: {
    fontWeight: '800',
    fontSize: 22,
    marginTop: 4,
  },

  // Chart
  chartZeroLineWrap: {
    position: 'relative',
    paddingVertical: 8,
  },
  chartZeroLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#4A5568',
  },
  chartScroll: {
    paddingVertical: 8,
    gap: 6,
  },
  barCol: {
    width: 32,
    alignItems: 'center',
  },
  barHalf: {
    width: 24,
    height: 64,
    justifyContent: 'flex-end',
  },
  barSpacerTop: {
    flex: 1,
  },
  barSpacerBottom: {
    flex: 1,
  },
  bar: {
    width: 16,
    borderRadius: 4,
  },
  barLabel: {
    color: '#4A5568',
    fontSize: 9,
    marginTop: 4,
  },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  // Best/worst
  bestWorstRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  miniCard: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#30363D',
    borderLeftWidth: 4,
  },
  miniInstrument: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: 4,
  },
  miniValue: {
    fontWeight: '800',
    fontSize: 20,
    marginVertical: 6,
  },
});
