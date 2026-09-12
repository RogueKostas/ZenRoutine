import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { QuarantinedTrackingEntry, RepairedTrackingEntry } from '../../store/persistence';
import type { ThemeColors } from '../../theme';

/**
 * One hydration's worth of records the store could not read. The store hands out a fresh array for
 * every hydration that quarantines something, and one reference-stable empty array otherwise — it
 * has to, because getQuarantinedTrackingEntries() feeds useSyncExternalStore. That makes the array
 * reference usable as the identity of the quarantine event itself.
 */
export type QuarantineReport = readonly QuarantinedTrackingEntry[];

/**
 * One hydration's worth of records the store kept but altered. Same reference-stability contract as
 * QuarantineReport, from getRepairedTrackingEntries(), and deliberately a separate report: these
 * entries are in the user's history right now, which is the opposite of being set aside.
 */
export type RepairReport = readonly RepairedTrackingEntry[];

/**
 * Whether a hydration notice should be on screen.
 *
 * Dismissal is scoped to the report it was dismissed for, not to the lifetime of the component.
 * A later hydration that produces a different report is announced even though an earlier notice
 * was already dismissed in the same mounted session.
 */
export function isHydrationNoticeVisible<T>(
  report: readonly T[],
  dismissedReport: readonly T[] | null
): boolean {
  return report.length > 0 && report !== dismissedReport;
}

/** The quarantine-specific name for {@link isHydrationNoticeVisible}. Identical behaviour. */
export const isQuarantineNoticeVisible = isHydrationNoticeVisible;

/** The user-facing sentence. Counts records, not hydrations — the user has no idea what those are. */
export function quarantineNoticeMessage(count: number): string {
  return count === 1
    ? 'We couldn’t read 1 tracking entry, so it was set aside. Everything else loaded.'
    : `We couldn’t read ${count} tracking entries, so they were set aside. Everything else loaded.`;
}

/**
 * The repair sentence, and it must not be the quarantine one. These entries loaded fine and are in
 * the user's history — what changed is their end time, which was guessed from the last activity on
 * record. Saying "we couldn't read it, so it was set aside" would be false twice over. It asks the
 * user to check, because the end time is a reconstruction and only they know the real one.
 */
export function repairNoticeMessage(count: number): string {
  return count === 1
    ? 'A timer from an older version was still running, so we ended it at the last activity we have a record of. Check that entry’s end time.'
    : `${count} timers from an older version were still running, so we ended them at the last activity we have a record of. Check those entries’ end times.`;
}

interface NoticeProps {
  count: number;
  colors: Pick<ThemeColors, 'surface' | 'text' | 'primary'>;
  onDismiss: () => void;
}

/**
 * Shared banner body. Called directly rather than rendered as a child element so that both notices
 * return the same element tree they always did, with the live-region View at the root.
 */
function renderNotice(
  message: string,
  colors: NoticeProps['colors'],
  onDismiss: () => void
) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: colors.surface }]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.button}>
        <Text style={[styles.buttonText, { color: colors.primary }]}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

export function QuarantineNotice({ count, colors, onDismiss }: NoticeProps) {
  return renderNotice(quarantineNoticeMessage(count), colors, onDismiss);
}

export function RepairNotice({ count, colors, onDismiss }: NoticeProps) {
  return renderNotice(repairNoticeMessage(count), colors, onDismiss);
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
