import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { borderRadius } from '../../theme/spacing';
import { DayRibbon } from '../ribbon/DayRibbon';
import type { ActivityType, DayOfWeek, RoutineBlock, WeekStartsOn } from '../../core/types';
import { weekStripCells } from './routineSurface';

interface WeekStripProps {
  blocks: readonly RoutineBlock[];
  activityTypes: readonly ActivityType[];
  weekStartsOn: WeekStartsOn;
  today: DayOfWeek;
  selectedDay: DayOfWeek;
  onSelectDay: (day: DayOfWeek) => void;
}

const CELL_HEIGHT = 44;

/**
 * `M T W T F S S` (p10, p25, p42): seven equal cells, each that day's ribbon squashed into thin
 * coloured columns. Tapping a cell selects the day ("Tap a day", p10).
 */
export function WeekStrip({
  blocks,
  activityTypes,
  weekStartsOn,
  today,
  selectedDay,
  onSelectDay,
}: WeekStripProps) {
  const { colors } = useTheme();
  const cells = useMemo(
    () => weekStripCells(blocks, weekStartsOn, today, selectedDay),
    [blocks, weekStartsOn, today, selectedDay]
  );

  return (
    <View style={styles.row}>
      {cells.map((cell) => (
        <Pressable
          key={cell.day}
          testID={`week-strip-${cell.day}`}
          onPress={() => onSelectDay(cell.day)}
          accessibilityRole="button"
          accessibilityLabel={cell.accessibilityLabel}
          accessibilityState={{ selected: cell.isSelected }}
          style={styles.cell}
        >
          <Text
            style={[
              styles.letter,
              { color: cell.isToday ? colors.primary : colors.textSecondary },
              cell.isSelected || cell.isToday ? styles.letterStrong : null,
            ]}
          >
            {cell.letter}
          </Text>
          <View
            style={[
              styles.box,
              {
                borderColor: cell.isSelected ? colors.primary : colors.border,
                borderWidth: cell.isSelected ? 2 : 1,
                backgroundColor: colors.backgroundSecondary,
              },
            ]}
          >
            <View aria-hidden style={styles.ribbon}>
              <DayRibbon
                blocks={blocks}
                activityTypes={activityTypes}
                day={cell.day}
                compact
                height={CELL_HEIGHT}
              />
            </View>
          </View>
          <View
            style={[
              styles.todayMark,
              { backgroundColor: cell.isToday ? colors.primary : 'transparent' },
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
  },
  letter: {
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 4,
  },
  letterStrong: {
    fontWeight: '700',
  },
  box: {
    height: CELL_HEIGHT + 4,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  ribbon: {
    paddingHorizontal: 1,
  },
  todayMark: {
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
});
