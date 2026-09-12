import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { QuarantinedTrackingEntry } from '../../store/persistence';
import type { ThemeColors } from '../../theme';

/**
 * One hydration's worth of records the store could not read. The store hands out a fresh array for
 * every hydration that quarantines something, and one reference-stable empty array otherwise — it
 * has to, because getQuarantinedTrackingEntries() feeds useSyncExternalStore. That makes the array
 * reference usable as the identity of the quarantine event itself.
 */
export type QuarantineReport = readonly QuarantinedTrackingEntry[];

/**
 * Whether the notice should be on screen.
 *
 * Dismissal is scoped to the report it was dismissed for, not to the lifetime of the component.
 * A later hydration that sets different records aside produces a different report, so it is
 * announced even though an earlier notice was already dismissed in the same mounted session.
 */
export function isQuarantineNoticeVisible(
  report: QuarantineReport,
  dismissedReport: QuarantineReport | null
): boolean {
  return report.length > 0 && report !== dismissedReport;
}

/** The user-facing sentence. Counts records, not hydrations — the user has no idea what those are. */
export function quarantineNoticeMessage(count: number): string {
  return count === 1
    ? 'We couldn’t read 1 tracking entry, so it was set aside. Everything else loaded.'
    : `We couldn’t read ${count} tracking entries, so they were set aside. Everything else loaded.`;
}

interface QuarantineNoticeProps {
  count: number;
  colors: Pick<ThemeColors, 'surface' | 'text' | 'primary'>;
  onDismiss: () => void;
}

export function QuarantineNotice({ count, colors, onDismiss }: QuarantineNoticeProps) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: colors.surface }]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{quarantineNoticeMessage(count)}</Text>
      <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.button}>
        <Text style={[styles.buttonText, { color: colors.primary }]}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
