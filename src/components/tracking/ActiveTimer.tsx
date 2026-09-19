import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useTheme } from '../../theme';
import type { ThemeColors } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { useCurrentTracking, useActivityTypes, useAppStore, useGoals } from '../../store';
import {
  formatElapsed,
  getTrackedSeconds,
  isTrackingEntryPaused,
  type TrackedTimeEntry,
} from '../../core/utils/time';

// Elapsed seconds are held in state so every tick changes it and re-renders; each tick
// recomputes from the start time rather than counting, so throttled background tabs catch up.
// Paused time is left out (#54), so the count stands still while the entry is paused.
function useElapsedSeconds(entry: TrackedTimeEntry | null | undefined): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!entry) {
      setElapsedSeconds(0);
      return;
    }

    const update = () => setElapsedSeconds(getTrackedSeconds(entry, Date.now()));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [entry]);

  return elapsedSeconds;
}

interface ActiveTimerProps {
  onPress?: () => void;
  compact?: boolean;
  onStopped?: (entryId: string) => void;
  /** Shows an "Open timer" button that opens the Current Activity view (#53). */
  onOpen?: () => void;
}

export function ActiveTimer({ onPress, compact = false, onStopped, onOpen }: ActiveTimerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const goals = useGoals();
  const { stopTracking } = useAppStore();
  const elapsedSeconds = useElapsedSeconds(activeTracking);
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const paused = activeTracking ? isTrackingEntryPaused(activeTracking) : false;

  // Pulse animation for the recording indicator
  useEffect(() => {
    if (!activeTracking || paused) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [activeTracking, paused, pulseAnim]);

  const handleStop = useCallback(() => {
    if (activeTracking) {
      stopTracking(activeTracking.id);
      onStopped?.(activeTracking.id);
    }
  }, [activeTracking, onStopped, stopTracking]);

  if (!activeTracking) {
    return null;
  }

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);
  const timeDisplay = formatElapsed(elapsedSeconds);

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactContainer} onPress={onPress}>
        <Animated.View style={[styles.recordingDotSmall, { opacity: pulseAnim }]} />
        <Text style={styles.compactActivity} numberOfLines={1}>
          {activity?.icon} {activity?.name || 'Tracking'}
        </Text>
        <Text style={styles.compactTime}>{timeDisplay}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[styles.container, { borderLeftColor: activity?.color || colors.primary }]}
      accessibilityLabel={`${paused ? 'Paused' : 'Tracking'} ${activity?.name || 'activity'}, ${timeDisplay} tracked`}
    >
      <View style={styles.header}>
        <View style={styles.recordingIndicator}>
          <Animated.View
            style={[styles.recordingDot, paused ? styles.pausedDot : null, { opacity: paused ? 1 : pulseAnim }]}
          />
          <Text style={[styles.recordingText, paused ? styles.pausedText : null]}>
            {paused ? 'PAUSED' : 'TRACKING'}
          </Text>
        </View>
        <Text style={styles.startTime}>
          Started {new Date(activeTracking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.activityInfo}>
          <Text style={styles.activityIcon}>{activity?.icon || '📌'}</Text>
          <View style={styles.activityDetails}>
            <Text style={styles.activityName}>{activity?.name || 'Unknown Activity'}</Text>
            {activeTracking.goalId && (
              <Text style={styles.goalLinked}>
                {goals.find((goal) => goal.id === activeTracking.goalId)?.name ?? 'Goal progress tracking'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.timerSection}>
          <Text style={styles.timerDisplay}>{timeDisplay}</Text>
          <Text style={styles.timerLabel}>elapsed</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {onOpen && (
          <TouchableOpacity
            style={styles.openButton}
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel="Open the Current Activity timer"
            testID="open-current-activity"
          >
            <Text style={styles.openText}>Open timer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.stopButton}
          onPress={handleStop}
          accessibilityRole="button"
          accessibilityLabel={`Stop tracking ${activity?.name || 'activity'}`}
        >
          <View style={styles.stopIcon} />
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Mini version for status bar or floating display
export function ActiveTimerMini({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const elapsedSeconds = useElapsedSeconds(activeTracking);

  if (!activeTracking) return null;

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);

  return (
    <TouchableOpacity style={styles.miniContainer} onPress={onPress}>
      <View style={styles.miniDot} />
      <Text style={styles.miniIcon}>{activity?.icon}</Text>
      <Text style={styles.miniTime}>{formatElapsed(elapsedSeconds)}</Text>
    </TouchableOpacity>
  );
}

// Large timer display for dedicated tracking screen
export function ActiveTimerLarge() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const { stopTracking } = useAppStore();
  const elapsedSeconds = useElapsedSeconds(activeTracking);

  if (!activeTracking) return null;

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);
  const elapsed = {
    hours: Math.floor(elapsedSeconds / 3600),
    minutes: Math.floor((elapsedSeconds % 3600) / 60),
    seconds: elapsedSeconds % 60,
  };

  return (
    <View style={styles.largeContainer}>
      <View style={styles.largeHeader}>
        <View style={styles.largeDot} />
        <Text style={styles.largeLabel}>Currently Tracking</Text>
      </View>

      <Text style={styles.largeIcon}>{activity?.icon || '📌'}</Text>
      <Text style={styles.largeName}>{activity?.name || 'Activity'}</Text>

      <View style={styles.largeTimerRow}>
        <View style={styles.largeTimeUnit}>
          <Text style={styles.largeTimeValue}>
            {elapsed.hours.toString().padStart(2, '0')}
          </Text>
          <Text style={styles.largeTimeLabel}>hours</Text>
        </View>
        <Text style={styles.largeTimeSeparator}>:</Text>
        <View style={styles.largeTimeUnit}>
          <Text style={styles.largeTimeValue}>
            {elapsed.minutes.toString().padStart(2, '0')}
          </Text>
          <Text style={styles.largeTimeLabel}>min</Text>
        </View>
        <Text style={styles.largeTimeSeparator}>:</Text>
        <View style={styles.largeTimeUnit}>
          <Text style={styles.largeTimeValue}>
            {elapsed.seconds.toString().padStart(2, '0')}
          </Text>
          <Text style={styles.largeTimeLabel}>sec</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.largeStopButton}
        onPress={() => stopTracking(activeTracking.id)}
      >
        <View style={styles.largeStopIcon} />
        <Text style={styles.largeStopText}>Stop Tracking</Text>
      </TouchableOpacity>
    </View>
  );
}

// Built per theme: the static light palette made these ignore dark mode.
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  // Main ActiveTimer styles
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    marginRight: spacing.xs,
  },
  recordingText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.error,
    letterSpacing: 1,
  },
  startTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  mainContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  activityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activityIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  activityDetails: {
    flex: 1,
  },
  activityName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  goalLinked: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },
  timerSection: {
    alignItems: 'flex-end',
  },
  timerDisplay: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  timerLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  pausedDot: {
    backgroundColor: colors.textMuted,
    borderRadius: 1,
  },
  pausedText: {
    color: colors.textMuted,
  },
  openButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 44,
  },
  openText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.error + '15',
    borderRadius: borderRadius.md,
    minHeight: 44,
  },
  stopIcon: {
    width: 12,
    height: 12,
    backgroundColor: colors.error,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  stopText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
  },

  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recordingDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
    marginRight: spacing.sm,
  },
  compactActivity: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginRight: spacing.sm,
  },
  compactTime: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },

  // Mini styles
  miniContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '15',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
    marginRight: spacing.xs,
  },
  miniIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  miniTime: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
  },

  // Large styles
  largeContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  largeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  largeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
    marginRight: spacing.sm,
  },
  largeLabel: {
    fontSize: 14,
    color: colors.error,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  largeIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  largeName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xl,
  },
  largeTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  largeTimeUnit: {
    alignItems: 'center',
    minWidth: 70,
  },
  largeTimeValue: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.text,
  },
  largeTimeLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  largeTimeSeparator: {
    fontSize: 48,
    fontWeight: '300',
    color: colors.textSecondary,
    marginHorizontal: spacing.xs,
  },
  largeStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    minWidth: 200,
  },
  largeStopIcon: {
    width: 16,
    height: 16,
    backgroundColor: colors.onError,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  largeStopText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onError,
  },
});
