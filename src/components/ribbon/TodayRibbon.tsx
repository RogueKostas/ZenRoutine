import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { useActiveRoutine, useActivityTypes } from '../../store';
import type { DayOfWeek } from '../../core/types';
import { getDayName } from '../../core/utils/time';
import { DayRibbon } from './DayRibbon';
import { useNow } from './useNow';

/**
 * Read-only ribbon for today's blocks in the active routine, with the live now marker (#56).
 * Renders nothing until a routine is active.
 */
export function TodayRibbon() {
  const { colors } = useTheme();
  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
  const now = useNow();
  if (!activeRoutine) return null;

  // Stored DayOfWeek is 0 = Sunday, the same numbering as Date#getDay.
  const day = now.getDay() as DayOfWeek;
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="today-ribbon"
    >
      <DayRibbon
        blocks={activeRoutine.blocks}
        activityTypes={activityTypes}
        day={day}
        now={now}
        accessibilityLabel={`Today's routine, ${getDayName(day)}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
});
