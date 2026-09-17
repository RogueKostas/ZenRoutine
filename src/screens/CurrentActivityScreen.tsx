import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import {
  useActiveRoutine,
  useActivityTypes,
  useAppStore,
  useCurrentTracking,
  useGoals,
  usePomodoroEnabled,
  useTrackingEntries,
} from '../store';
import { BreakdownPie } from '../components/breakdown/BreakdownPie';
import { useNow } from '../components/ribbon';
import { TrackedDayRibbon } from '../components/tracking/TrackedDayRibbon';
import { TomatoRow } from '../components/tracking/TomatoRow';
import {
  RING_THICKNESS,
  blockRingData,
  countdownPieData,
  currentActivityLayout,
  formatGoalProgress,
  timerView,
  trackingBadge,
} from '../components/tracking/currentActivityView';
import {
  findCurrentOccurrence,
  getBlockRing,
  getTodayOccurrences,
} from '../core/engine/trackingState';
import { PHASE_LABELS, phaseChangeNotice, type PomodoroPhase } from '../core/engine/pomodoro';
import {
  getDayOverview,
  getScheduleFocus,
  getScheduledStart,
  formatRowTimeRange,
} from '../core/engine/dayOverview';
import type { RootStackScreenProps } from '../navigation/types';

const UNTRACKED_GREY = '#A3A3A3';
const BREAK_GREEN = '#10B981';
const BANNER_MS = 15_000;

/**
 * Current Activity (#53, #54; design p75–p77): a Pomodoro timer for the running entry, linked to
 * the routine. The large pie counts down the current phase; the ring around it is the current
 * scheduled block, with its untracked time in grey (p77). Pause freezes the countdown. Activity
 * notes (p76) are Iteration 2: the notes button is shown disabled.
 */
export function CurrentActivityScreen({ navigation }: RootStackScreenProps<'CurrentActivity'>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const layout = currentActivityLayout(width);
  const now = useNow(1000);
  const minute = useNow(60_000);
  const entry = useCurrentTracking() ?? null;
  const activityTypes = useActivityTypes();
  const goals = useGoals();
  const routine = useActiveRoutine();
  const entries = useTrackingEntries();
  const pomodoroEnabled = usePomodoroEnabled();
  const pauseTracking = useAppStore((state) => state.pauseTracking);
  const resumeTracking = useAppStore((state) => state.resumeTracking);
  const stopTracking = useAppStore((state) => state.stopTracking);
  const startTracking = useAppStore((state) => state.startTracking);
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const nowMs = now.getTime();
  const badge = trackingBadge(entry);
  const timer = entry ? timerView(entry, nowMs, pomodoroEnabled) : null;

  // Nothing running: offer what is scheduled now (p76: "Hit this button to signal to the app that
  // you have started the current activity").
  const focusRow = useMemo(() => {
    if (entry) return null;
    const focus = getScheduleFocus(getDayOverview({ routine, goals, trackingEntries: entries, now: minute }));
    return focus.kind === 'now' ? focus.row : null;
  }, [entry, routine, goals, entries, minute]);

  const activityTypeId = entry?.activityTypeId ?? focusRow?.activityTypeId;
  const activity = activityTypes.find((candidate) => candidate.id === activityTypeId);
  const goalId = entry ? entry.goalId : focusRow?.goalId ?? undefined;
  const goal = goalId ? goals.find((candidate) => candidate.id === goalId) : undefined;
  const title = goal?.name ?? activity?.name ?? 'Nothing scheduled now';
  const progress = formatGoalProgress(goal, entry, nowMs);
  const typeColor = activity?.color ?? colors.primary;

  const occurrence = useMemo(
    () => findCurrentOccurrence(getTodayOccurrences(routine?.blocks ?? [], now), now, entry),
    [routine, now, entry]
  );
  const ring = occurrence ? getBlockRing(occurrence, entries, now) : [];

  // A gentle banner when the phase changes; no notifications (#53).
  const phase: PomodoroPhase | null = timer?.kind === 'pomodoro' ? timer.state.phase : null;
  const previousPhase = useRef<PomodoroPhase | null>(null);
  useEffect(() => {
    if (timer?.kind === 'pomodoro') {
      const notice = phaseChangeNotice(
        previousPhase.current ? { phase: previousPhase.current } : null,
        timer.state
      );
      if (notice) setBanner(notice);
    }
    previousPhase.current = phase;
    // Runs on phase changes only; `timer` is read for the phase just entered.
  }, [phase]);
  useEffect(() => {
    if (!banner) return;
    const timeout = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timeout);
  }, [banner]);

  const leave = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Tabs', { screen: 'Home' });
  };

  const handleStop = () => {
    if (!entry) return;
    stopTracking(entry.id);
    leave();
  };

  const handleStart = () => {
    if (!focusRow) return;
    const id = startTracking(getScheduledStart(focusRow));
    setStatus(id ? `Tracking ${title}.` : 'Unable to start tracking.');
  };

  const pieSize = layout.pieSize;
  const ringSize = pieSize + 2 * RING_THICKNESS;
  const paused = badge === 'PAUSED';
  const remainingColor = timer?.kind === 'pomodoro' && timer.state.phase !== 'focus' ? BREAK_GREEN : typeColor;

  const pie = (
    <View style={[styles.pieWrap, { width: ringSize, height: ringSize }]} testID="activity-timer">
      {ring.length > 0 ? (
        <BreakdownPie
          size={ringSize}
          data={blockRingData(ring, { tracked: typeColor, untracked: UNTRACKED_GREY, ahead: colors.backgroundSecondary })}
          accessibilityLabel="Scheduled block: tracked time in colour, time not tracked in grey"
        />
      ) : null}
      <View style={[styles.pieCentre, { top: RING_THICKNESS, left: RING_THICKNESS, opacity: paused ? 0.45 : 1 }]}>
        {timer?.kind === 'pomodoro' ? (
          <BreakdownPie
            size={pieSize}
            data={countdownPieData(timer, { elapsed: colors.surface, remaining: remainingColor })}
            accessibilityLabel={`${PHASE_LABELS[timer.state.phase]}, ${timer.countdown} left`}
          />
        ) : (
          <BreakdownPie
            size={pieSize}
            data={[{ id: 'whole', name: 'Session', color: entry ? typeColor : colors.backgroundSecondary, minutes: 1 }]}
            accessibilityLabel={timer ? `${timer.elapsed} tracked` : 'Not tracking'}
          />
        )}
      </View>
      <View pointerEvents="none" style={[styles.readoutWrap, { width: ringSize, height: ringSize }]}>
        <View style={[styles.readout, { backgroundColor: colors.surface, borderColor: colors.text }]}>
          <Text style={[styles.readoutTime, { color: colors.text }]} testID="activity-countdown">
            {timer ? (timer.kind === 'pomodoro' ? timer.countdown : timer.elapsed) : '--:--'}
          </Text>
          <Text style={[styles.readoutLabel, { color: colors.textSecondary }]}>
            {timer?.kind === 'pomodoro' ? PHASE_LABELS[timer.state.phase] : timer ? 'Tracked' : 'Idle'}
          </Text>
        </View>
      </View>
    </View>
  );

  const badgeColor = badge === 'LIVE' ? colors.error : colors.textMuted;
  const stateColumn = (
    <View style={[styles.column, layout.wide ? styles.columnWide : null]}>
      <View style={[styles.badge, { borderColor: badgeColor }]} testID="tracking-badge">
        <View style={[styles.badgeDot, { backgroundColor: badgeColor }, paused ? styles.badgeDotPaused : null]} />
        <Text style={[styles.badgeText, { color: badgeColor }]}>{badge}</Text>
      </View>
      <Text style={[styles.stateText, { color: colors.text }]}>
        {badge === 'LIVE' ? 'Tracking…' : 'Not tracking…'}
      </Text>

      {entry ? (
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: paused ? colors.primary : colors.surface, borderColor: colors.primary }]}
            onPress={() => (paused ? resumeTracking(entry.id) : pauseTracking(entry.id))}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume tracking' : 'Pause tracking'}
            testID="pause-resume"
          >
            <Text style={[styles.buttonText, { color: paused ? '#fff' : colors.primary }]}>
              {paused ? '▶ Resume' : '❚❚ Pause'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.error, borderColor: colors.error }]}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Stop tracking"
            testID="stop-tracking"
          >
            <Text style={[styles.buttonText, { color: '#fff' }]}>■ Stop</Text>
          </TouchableOpacity>
        </View>
      ) : focusRow ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.error, borderColor: colors.error }]}
          onPress={handleStart}
          accessibilityRole="button"
          accessibilityLabel={`Start tracking ${title}, scheduled ${formatRowTimeRange(focusRow)}`}
        >
          <Text style={[styles.buttonText, { color: '#fff' }]}>● Start tracking</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.notes} accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel="Notes, coming later">
        <Text style={[styles.notesIcon, { color: colors.textMuted }]}>🗒</Text>
        <Text style={[styles.notesText, { color: colors.textMuted }]}>Notes (coming later)</Text>
      </View>
    </View>
  );

  const goalColumn = (
    <View style={[styles.column, layout.wide ? styles.columnWide : null]}>
      {progress ? (
        <Text style={[styles.progress, { color: colors.text }]} testID="goal-progress" accessibilityLabel={`Tracked so far over total estimated: ${progress}`}>
          {progress}
        </Text>
      ) : null}
      {timer?.kind === 'pomodoro' ? (
        <>
          <TomatoRow fills={timer.fills} completed={timer.state.completedPomodoros} />
          <Text style={[styles.small, { color: colors.textSecondary }]}>
            {timer.state.completedPomodoros} {timer.state.completedPomodoros === 1 ? 'pomodoro' : 'pomodoros'} this session
          </Text>
        </>
      ) : entry ? (
        <Text style={[styles.small, { color: colors.textSecondary }]}>Pomodoro timer is off (Settings)</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={leave} accessibilityRole="button" accessibilityLabel="Back to Day Overview" style={styles.tab}>
          <Text style={[styles.tabText, { color: colors.textMuted }]}>‹ Day Overview</Text>
        </TouchableOpacity>
        <Text style={[styles.tabText, styles.tabActive, { color: colors.text }]} accessibilityRole="header">
          Current Activity
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{title}</Text>
          {activity ? (
            <View style={[styles.typeIcon, { borderColor: colors.text, backgroundColor: typeColor + '33' }]}>
              <Text style={styles.typeIconText}>{activity.icon ?? '•'}</Text>
            </View>
          ) : null}
        </View>

        {banner ? (
          <View
            style={[styles.banner, { backgroundColor: BREAK_GREEN + '1F', borderColor: BREAK_GREEN }]}
            accessibilityLiveRegion="polite"
            testID="phase-banner"
          >
            <Text style={[styles.bannerText, { color: colors.text }]}>{banner}</Text>
            <TouchableOpacity onPress={() => setBanner(null)} accessibilityRole="button" accessibilityLabel="Dismiss">
              <Text style={[styles.bannerClose, { color: colors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {layout.wide ? (
          <View style={styles.wideRow}>
            {stateColumn}
            {pie}
            {goalColumn}
          </View>
        ) : (
          <>
            <View style={styles.narrowPie}>{pie}</View>
            <View style={styles.narrowRow}>
              {stateColumn}
              {goalColumn}
            </View>
          </>
        )}

        <Text accessibilityLiveRegion="polite" style={styles.srStatus}>{status}</Text>
      </ScrollView>

      <TrackedDayRibbon now={now} showDayName testID="current-activity-ribbon" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 20,
  },
  tabActive: {
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'right',
  },
  typeIcon: {
    width: 40,
    height: 32,
    borderWidth: 2,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconText: {
    fontSize: 16,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  bannerClose: {
    fontSize: 22,
    paddingHorizontal: spacing.xs,
  },
  wideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  narrowPie: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  narrowRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  column: {
    flex: 1,
    gap: spacing.sm,
  },
  columnWide: {
    flex: 0,
    width: 220,
  },
  pieWrap: {
    position: 'relative',
  },
  pieCentre: {
    position: 'absolute',
  },
  readoutWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    minWidth: 108,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    alignItems: 'center',
  },
  readoutTime: {
    fontSize: 34,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readoutLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 2,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  badgeDotPaused: {
    borderRadius: 2,
    width: 10,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stateText: {
    fontSize: 22,
  },
  buttons: {
    gap: spacing.sm,
  },
  button: {
    minHeight: 44,
    borderWidth: 2,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  notes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    opacity: 0.7,
  },
  notesIcon: {
    fontSize: 22,
  },
  notesText: {
    fontSize: 12,
  },
  progress: {
    fontSize: 26,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  small: {
    fontSize: 12,
  },
  srStatus: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
