import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { BreakdownPie } from './BreakdownPie';
import {
  formatWeeklyHours,
  pieSlices,
  rankedBars,
  type BreakdownDatum,
} from './pieLayout';

interface RoutineBreakdownProps {
  data: readonly BreakdownDatum[];
  title?: string;
}

/**
 * The planned-week pie with a legend (p42). Tapping the pie shows the ranked bars (p43) in place;
 * tapping again hides them.
 */
export function RoutineBreakdown({ data, title = 'Your week' }: RoutineBreakdownProps) {
  const { colors } = useTheme();
  const [showBars, setShowBars] = useState(false);
  const slices = useMemo(() => pieSlices(data), [data]);
  const bars = useMemo(() => rankedBars(data), [data]);
  const totalMinutes = slices.reduce((sum, slice) => sum + slice.minutes, 0);

  if (slices.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Plan some activities and the week's breakdown appears here.
        </Text>
      </View>
    );
  }

  const summary = slices
    .map((slice) => `${slice.name} ${formatWeeklyHours(slice.minutes)}, ${slice.percent}%`)
    .join('; ');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {formatWeeklyHours(totalMinutes)} planned · tap the pie for the breakdown
      </Text>

      <View style={styles.body}>
        <View style={styles.pieColumn}>
          <BreakdownPie
            data={data}
            size={150}
            onPress={() => setShowBars((shown) => !shown)}
            expanded={showBars}
            accessibilityLabel={`Planned week by activity type: ${summary}`}
            accessibilityHint={showBars ? 'Hides the ranked breakdown' : 'Shows the ranked breakdown'}
          />
        </View>

        <View style={styles.detailColumn}>
          {showBars ? (
            <View testID="routine-breakdown-bars">
              <Text style={[styles.detailTitle, { color: colors.text }]}>Routine Breakdown</Text>
              {bars.map((bar) => (
                <View key={bar.id} style={styles.barRow}>
                  <Text style={[styles.barName, { color: colors.textSecondary }]} numberOfLines={1}>
                    {bar.name}
                  </Text>
                  <View style={styles.barLine}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${bar.widthFraction * 100}%`, backgroundColor: bar.color },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barValue, { color: colors.text }]}>
                      {formatWeeklyHours(bar.minutes)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View accessibilityRole="list" testID="routine-breakdown-legend">
              {slices.map((slice) => (
                <View key={slice.id} style={styles.legendRow}>
                  <View style={[styles.swatch, { backgroundColor: slice.color }]} />
                  <Text style={[styles.legendName, { color: colors.text }]} numberOfLines={1}>
                    {slice.name}
                  </Text>
                  <Text style={[styles.legendValue, { color: colors.textSecondary }]}>
                    {formatWeeklyHours(slice.minutes)}
                  </Text>
                  <Text style={[styles.legendPercent, { color: colors.textSecondary }]}>
                    {slice.percent}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  body: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  pieColumn: {
    flexGrow: 1,
    alignItems: 'center',
    minWidth: 160,
  },
  detailColumn: {
    flexGrow: 2,
    flexBasis: 220,
    minWidth: 0,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 26,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: spacing.sm,
  },
  legendName: {
    flex: 1,
    fontSize: 14,
  },
  legendValue: {
    fontSize: 13,
    minWidth: 56,
    textAlign: 'right',
  },
  legendPercent: {
    fontSize: 13,
    minWidth: 40,
    textAlign: 'right',
  },
  barRow: {
    marginTop: spacing.xs,
  },
  barName: {
    fontSize: 12,
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barTrack: {
    flex: 1,
    height: 12,
  },
  barFill: {
    height: 12,
    borderRadius: 6,
    minWidth: 6,
  },
  barValue: {
    fontSize: 12,
    marginLeft: spacing.sm,
    minWidth: 48,
  },
});
