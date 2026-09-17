import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { formatHomeClock } from '../../core/engine/dayOverview';

/** One line in place of the greeting (#56): "Thursday 17 September · 17:12". */
export function HomeClock({ now }: { now: Date }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.clock, { color: colors.text }]}
      testID="home-clock"
    >
      {formatHomeClock(now)}
    </Text>
  );
}

const styles = StyleSheet.create({
  clock: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
});
