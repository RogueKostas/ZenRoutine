import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { ActivityType } from '../../core/types';
import {
  formatDayMinute,
  formatRowProgress,
  formatRowTimeRange,
  type DayOverviewRow,
  type ScheduleFocus,
} from '../../core/engine/dayOverview';

interface ScheduleFocusCardProps {
  focus: ScheduleFocus;
  activityTypes: readonly ActivityType[];
  onStart: (row: DayOverviewRow) => void;
}

/** Home's primary action (#56): the goal scheduled now, or what is next and when. */
export function ScheduleFocusCard({ focus, activityTypes, onStart }: ScheduleFocusCardProps) {
  const { colors } = useTheme();

  if (focus.kind === 'none') {
    return (
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID="schedule-focus"
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>NOTHING SCHEDULED</Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>
          Nothing else is scheduled today.
        </Text>
      </View>
    );
  }

  const { row } = focus;
  const isNow = focus.kind === 'now';
  const activity = activityTypes.find((candidate) => candidate.id === row.activityTypeId);
  const typeName = activity?.name ?? 'Activity';
  const title = row.goalName ?? typeName;
  const progress = formatRowProgress(row);
  const detail = [row.goalName ? typeName : null, formatRowTimeRange(row), progress]
    .filter(Boolean)
    .join(' · ');
  const label = isNow ? 'NOW' : `NEXT AT ${formatDayMinute(row.startMinutes)}`;
  const actionLabel = isNow ? 'Start' : 'Start early';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: isNow ? colors.primary : colors.border,
          borderLeftColor: activity?.color ?? colors.primary,
        },
        isNow ? styles.cardNow : undefined,
      ]}
      testID="schedule-focus"
    >
      <View style={styles.body}>
        <Text style={[styles.label, { color: isNow ? colors.primary : colors.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {activity?.icon ? `${activity.icon} ` : ''}{title}
        </Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
      <TouchableOpacity
        style={[
          styles.button,
          isNow
            ? { backgroundColor: colors.primary }
            : { borderColor: colors.primary, borderWidth: 1 },
        ]}
        onPress={() => onStart(row)}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel}: ${title}, ${formatRowTimeRange(row)}`}
      >
        <Text style={[styles.buttonText, { color: isNow ? '#fff' : colors.primary }]}>
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderLeftWidth: 6,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardNow: {
    borderWidth: 2,
    borderLeftWidth: 6,
  },
  body: {
    flex: 1,
    minWidth: 180,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  detail: {
    fontSize: 14,
    marginTop: 2,
  },
  button: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
