import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { ActivityType } from '../../core/types';
import {
  formatRowProgress,
  formatRowTimeRange,
  type DayOverviewRow,
} from '../../core/engine/dayOverview';

interface DayOverviewListProps {
  rows: readonly DayOverviewRow[];
  activityTypes: readonly ActivityType[];
  /** Hides the per-row Start while a timer runs. */
  canStart: boolean;
  onStart: (row: DayOverviewRow) => void;
  /** A short note under a row's name, e.g. "Not tracked" on a past row (#54). */
  rowNote?: (row: DayOverviewRow) => string;
}

/**
 * Day Overview rows (#55, design p73–p74): time range · goal name · tracked/estimated hours.
 * Past rows are greyed out and the current row stands out.
 */
export function DayOverviewList({ rows, activityTypes, canStart, onStart, rowNote }: DayOverviewListProps) {
  const { colors } = useTheme();
  const nextIndex = rows.findIndex((row) => row.state === 'upcoming');

  return (
    <View style={styles.list} testID="day-overview">
      {rows.map((row, index) => {
        const activity = activityTypes.find((candidate) => candidate.id === row.activityTypeId);
        const isPast = row.state === 'past';
        const isCurrent = row.state === 'current';
        const isNext = index === nextIndex;
        const name = row.goalName ?? activity?.name ?? 'Unknown';
        const progress = formatRowProgress(row);
        const timeRange = formatRowTimeRange(row);
        const note = rowNote?.(row) ?? '';
        return (
          <View
            key={`${row.blockId ?? row.blockStart}-${row.startMinutes}`}
            style={[
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
              isPast ? styles.rowPast : undefined,
              isCurrent
                ? [styles.rowCurrent, { borderColor: colors.primary, backgroundColor: colors.primary + '0D' }]
                : undefined,
            ]}
            accessibilityLabel={`${timeRange}, ${name}${progress ? `, ${progress}` : ''}, ${row.state}${note ? `, ${note}` : ''}`}
          >
            <View style={[styles.typeBadge, { backgroundColor: (activity?.color ?? '#666') + '26' }]}>
              <Text style={styles.typeIcon}>{activity?.icon ?? '•'}</Text>
            </View>
            <View style={styles.content}>
              <View style={styles.timeRow}>
                <Text style={[styles.time, { color: isPast ? colors.textMuted : colors.textSecondary }]}>
                  {timeRange}
                </Text>
                {isCurrent && (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.badgeText, { color: colors.onPrimary }]}>NOW</Text>
                  </View>
                )}
                {isNext && (
                  <View style={[styles.badge, { backgroundColor: colors.success + '20' }]}>
                    <Text style={[styles.badgeText, { color: colors.success }]}>NEXT</Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.name,
                  isCurrent ? styles.nameCurrent : undefined,
                  { color: isPast ? colors.textMuted : colors.text },
                  row.goalName ? undefined : styles.nameType,
                ]}
              >
                {name}
                {progress ? (
                  <Text style={[styles.progress, { color: isPast ? colors.textMuted : colors.info }]}>
                    {`  ${progress}`}
                  </Text>
                ) : null}
              </Text>
              {note ? (
                <Text style={[styles.note, { color: colors.textSecondary }]} testID="row-untracked-note">
                  {note}
                </Text>
              ) : null}
            </View>
            {canStart && !isPast && (
              <TouchableOpacity
                style={[styles.startButton, { backgroundColor: colors.primary }]}
                onPress={() => onStart(row)}
                accessibilityRole="button"
                accessibilityLabel={`Start ${name} from ${timeRange}`}
              >
                <Text style={[styles.startButtonText, { color: colors.onPrimary }]}>Start</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    gap: spacing.md,
  },
  rowPast: {
    opacity: 0.5,
  },
  rowCurrent: {
    borderWidth: 2,
    paddingVertical: spacing.md,
  },
  typeBadge: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIcon: {
    fontSize: 15,
  },
  content: {
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  time: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  badge: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  nameCurrent: {
    fontSize: 20,
    fontWeight: '700',
  },
  nameType: {
    fontWeight: '400',
  },
  progress: {
    fontSize: 14,
    fontWeight: '500',
  },
  note: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  startButton: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
