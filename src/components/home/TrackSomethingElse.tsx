import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { QuickStart } from '../tracking';

/** The six-type grid, demoted below the schedule and collapsed by default (#56). */
export function TrackSomethingElse({ onTrackingStarted }: { onTrackingStarted?: (entryId: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Track something else"
      >
        <Text style={[styles.toggleText, { color: colors.primary }]}>
          {open ? '▾' : '▸'} Track something else
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.grid}>
          <QuickStart maxActivities={6} onTrackingStarted={onTrackingStarted} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  toggle: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    alignSelf: 'flex-start',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  grid: {
    paddingHorizontal: spacing.sm,
  },
});
