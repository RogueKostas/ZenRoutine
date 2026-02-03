import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { useCurrentTracking, useActivityTypes, useAppStore } from '../../store';
import { formatDuration } from '../../core/utils/time';

interface ActiveTimerProps {
  onPress?: () => void;
  compact?: boolean;
}

export function ActiveTimer({ onPress, compact = false }: ActiveTimerProps) {
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const { stopTracking } = useAppStore();
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Calculate elapsed time
  useEffect(() => {
    if (!activeTracking) {
      setElapsedMinutes(0);
      return;
    }

    const calculateElapsed = () => {
      const startTime = new Date(activeTracking.startTime).getTime();
      const now = Date.now();
      const diffMinutes = Math.floor((now - startTime) / 60000);
      setElapsedMinutes(diffMinutes);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [activeTracking]);

  // Pulse animation for the recording indicator
  useEffect(() => {
    if (!activeTracking) return;

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
  }, [activeTracking, pulseAnim]);

  const handleStop = useCallback(() => {
    if (activeTracking) {
      stopTracking(activeTracking.id);
    }
  }, [activeTracking, stopTracking]);

  if (!activeTracking) {
    return null;
  }

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  const seconds = Math.floor((Date.now() - new Date(activeTracking.startTime).getTime()) / 1000) % 60;

  const timeDisplay = hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;

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
    <TouchableOpacity
      style={[styles.container, { borderLeftColor: activity?.color || colors.primary }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.recordingIndicator}>
          <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} />
          <Text style={styles.recordingText}>TRACKING</Text>
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
              <Text style={styles.goalLinked}>Goal progress tracking</Text>
            )}
          </View>
        </View>

        <View style={styles.timerSection}>
          <Text style={styles.timerDisplay}>{timeDisplay}</Text>
          <Text style={styles.timerLabel}>{formatDuration(elapsedMinutes)} elapsed</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
          <View style={styles.stopIcon} />
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// Mini version for status bar or floating display
export function ActiveTimerMini({ onPress }: { onPress?: () => void }) {
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!activeTracking) return;

    const updateTime = () => {
      const startTime = new Date(activeTracking.startTime).getTime();
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setSeconds(elapsed);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [activeTracking]);

  if (!activeTracking) return null;

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <TouchableOpacity style={styles.miniContainer} onPress={onPress}>
      <View style={styles.miniDot} />
      <Text style={styles.miniIcon}>{activity?.icon}</Text>
      <Text style={styles.miniTime}>
        {mins}:{secs.toString().padStart(2, '0')}
      </Text>
    </TouchableOpacity>
  );
}

// Large timer display for dedicated tracking screen
export function ActiveTimerLarge() {
  const activeTracking = useCurrentTracking();
  const activityTypes = useActivityTypes();
  const { stopTracking } = useAppStore();
  const [elapsed, setElapsed] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!activeTracking) return;

    const updateTime = () => {
      const startTime = new Date(activeTracking.startTime).getTime();
      const diff = Date.now() - startTime;
      const totalSeconds = Math.floor(diff / 1000);
      setElapsed({
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [activeTracking]);

  if (!activeTracking) return null;

  const activity = activityTypes.find((a) => a.id === activeTracking.activityTypeId);

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

const styles = StyleSheet.create({
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
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.error + '15',
    borderRadius: borderRadius.md,
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
    backgroundColor: '#fff',
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  largeStopText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
