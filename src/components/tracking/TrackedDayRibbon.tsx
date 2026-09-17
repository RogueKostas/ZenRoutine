import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { useActiveRoutine, useActivityTypes, useTrackingEntries } from '../../store';
import type { DayOfWeek } from '../../core/types';
import { getDayName } from '../../core/utils/time';
import { getUntrackedOverlays } from '../../core/engine/trackingState';
import { DayRibbon } from '../ribbon/DayRibbon';
import { useNow } from '../ribbon/useNow';

interface TrackedDayRibbonProps {
  /** Defaults to a clock that ticks every 30 seconds. */
  now?: Date;
  /** The design's day name under the ribbon ("Tuesday", p73–p77). */
  showDayName?: boolean;
  testID?: string;
}

/**
 * Today's ribbon with the now marker and, over today's past and current blocks, grey spans for
 * scheduled time that was not tracked (#54, Wave C exit criterion 5). Renders nothing until a
 * routine is active.
 */
export function TrackedDayRibbon({ now: nowProp, showDayName = false, testID }: TrackedDayRibbonProps) {
  const { colors } = useTheme();
  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
  const trackingEntries = useTrackingEntries();
  const tick = useNow();
  const now = nowProp ?? tick;
  const blocks = activeRoutine?.blocks;
  const overlays = useMemo(
    () => (blocks ? getUntrackedOverlays(blocks, trackingEntries, now) : []),
    [blocks, trackingEntries, now]
  );
  if (!activeRoutine) return null;

  // Stored DayOfWeek is 0 = Sunday, the same numbering as Date#getDay.
  const day = now.getDay() as DayOfWeek;
  const untrackedMinutes = Math.round(
    overlays.reduce((total, overlay) => total + overlay.endMinutes - overlay.startMinutes, 0)
  );
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}
    >
      <DayRibbon
        blocks={activeRoutine.blocks}
        activityTypes={activityTypes}
        day={day}
        now={now}
        overlays={overlays}
        accessibilityLabel={`Today's routine, ${getDayName(day)}${
          untrackedMinutes > 0 ? `, ${untrackedMinutes} scheduled minutes not tracked, shown in grey` : ''
        }`}
      />
      {showDayName && (
        <Text style={[styles.dayName, { color: colors.text }]}>{getDayName(day)}</Text>
      )}
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
  dayName: {
    textAlign: 'center',
    fontSize: 18,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
});
