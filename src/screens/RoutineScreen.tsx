import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { useActiveRoutine, useActivityTypes, useAppStore, useWeekStartsOn } from '../store';
import {
  formatDuration,
  getDayName,
  getRoutineBlockDurationMinutes,
  orderedWeekDays,
} from '../core/utils/time';
import { BlockEditor, WeekStrip, firstFreeHour, newBlockTimesAt } from '../components/routine';
import {
  BlockTimeUpdate,
  DEFAULT_RIBBON_WINDOW,
  DayRibbon,
  RibbonWindow,
  RibbonZoomControls,
  useNow,
  zoomFocusMinutes,
} from '../components/ribbon';
import { RoutineBreakdown, plannedBreakdown } from '../components/breakdown';
import { useDialog } from '../components/common';
import type { TabScreenProps } from '../navigation/types';
import type { DayOfWeek, RoutineBlock } from '../core/types';

/** What the edit box is open for: an existing block, or a new one at given times. */
type EditorTarget =
  | { kind: 'edit'; block: RoutineBlock }
  | { kind: 'new'; start: number; end: number };

/**
 * The routine surface (DESIGN-2019 §4.2–4.3, pp. 10–43): the week strip, the selected day's
 * ribbon (the editor: tap a segment to edit it, tap empty time to add one), and the planned
 * breakdown pie. There is no list of block cards (§4.2 behaviour rules).
 */
export function RoutineScreen(_props: TabScreenProps<'Routine'>) {
  const { colors } = useTheme();
  const now = useNow();
  const today = now.getDay() as DayOfWeek;
  const weekStartsOn = useWeekStartsOn();
  const weekDays = useMemo(() => orderedWeekDays(weekStartsOn), [weekStartsOn]);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(today);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  // Zoom (p31–p33) and the last activity touched, which + / − zoom around.
  const [ribbonWindow, setRibbonWindow] = useState<RibbonWindow>(DEFAULT_RIBBON_WINDOW);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  // Why the last drag was refused, shown under the ribbon.
  const [dragError, setDragError] = useState<string | null>(null);

  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
  const { addRoutine, setActiveRoutine, copyDayBlocks, updateRoutineBlocks } = useAppStore();
  const dialog = useDialog();

  const blocks = activeRoutine?.blocks;
  const dayBlocks = useMemo(
    () => (blocks ?? []).filter((b) => b.dayOfWeek === selectedDay),
    [blocks, selectedDay]
  );
  const totalMinutes = dayBlocks.reduce(
    (sum, block) => sum + getRoutineBlockDurationMinutes(block),
    0
  );
  const breakdown = useMemo(
    () => plannedBreakdown(activeRoutine, activityTypes),
    [activeRoutine, activityTypes]
  );

  const handleSelectDay = useCallback((day: DayOfWeek) => {
    setSelectedDay(day);
    setCopyOpen(false);
    setDragError(null);
    setFocusBlockId(null);
  }, []);

  const routineId = activeRoutine?.id;
  const handleEdgeCommit = useCallback(
    (updates: BlockTimeUpdate[]) => {
      if (!routineId || updates.length === 0) return;
      setFocusBlockId(updates[updates.length - 1].id);
      // One write for both blocks of a shared boundary; a refusal leaves the ribbon as it was.
      const result = updateRoutineBlocks(routineId, updates);
      setDragError(result.ok ? null : `Couldn't move that edge: ${result.reason}`);
    },
    [routineId, updateRoutineBlocks]
  );
  const focusBlock = blocks?.find((block) => block.id === focusBlockId) ?? null;

  const handleAddBlock = useCallback(() => {
    const times = firstFreeHour(blocks ?? [], selectedDay);
    setEditor({ kind: 'new', start: times.start, end: times.end });
  }, [blocks, selectedDay]);

  const handleEmptyPress = useCallback(
    (minutes: number) => {
      const times = newBlockTimesAt(minutes, blocks ?? [], selectedDay);
      setEditor({ kind: 'new', start: times.start, end: times.end });
    },
    [blocks, selectedDay]
  );

  const handleEditBlock = useCallback((block: RoutineBlock) => {
    setFocusBlockId(block.id);
    setEditor({ kind: 'edit', block });
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditor(null);
  }, []);

  const handleCopyDay = useCallback(async (targetDay: DayOfWeek) => {
    if (!activeRoutine) return;

    const targetBlocks = activeRoutine.blocks.filter((b) => b.dayOfWeek === targetDay);

    if (targetBlocks.length > 0) {
      const confirmed = await dialog.confirm({
        title: 'Replace existing activities?',
        message: `${getDayName(targetDay)} already has ${targetBlocks.length} ${targetBlocks.length > 1 ? 'activities' : 'activity'}. Copying ${getDayName(selectedDay)} will replace them.`,
        confirmLabel: 'Replace',
        destructive: true,
      });
      if (!confirmed) return;
    }
    copyDayBlocks(activeRoutine.id, selectedDay, [targetDay]);
    setCopyOpen(false);
    void dialog.notify({ title: 'Copied', message: `${getDayName(selectedDay)} copied to ${getDayName(targetDay)}` });
  }, [activeRoutine, selectedDay, copyDayBlocks, dialog]);

  if (!activeRoutine) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Routine</Text>
        </View>
        <View style={styles.noRoutine}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No routine yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Create a routine to start organizing your week</Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              const id = addRoutine('My Week');
              setActiveRoutine(id);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create routine"
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Create Routine</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const selectedName = getDayName(selectedDay);
  const editingBlock = editor?.kind === 'edit' ? editor.block : undefined;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Routine</Text>
        <Text style={[styles.routineName, { color: colors.textSecondary }]} numberOfLines={1}>
          {activeRoutine.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          {/* Week strip (p10, p25, p42) */}
          <WeekStrip
            blocks={activeRoutine.blocks}
            activityTypes={activityTypes}
            weekStartsOn={weekStartsOn}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={handleSelectDay}
          />

          {/* The selected day: toolbar, ribbon editor, day name (p13–p41) */}
          <View
            style={[styles.dayPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={styles.toolbar}>
              <TouchableOpacity
                style={[styles.toolButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={handleAddBlock}
                accessibilityRole="button"
                accessibilityLabel={`Add activity to ${selectedName}`}
              >
                <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>+ Add activity</Text>
              </TouchableOpacity>
              {dayBlocks.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.toolButton,
                    {
                      borderColor: copyOpen ? colors.primary : colors.border,
                      backgroundColor: copyOpen ? colors.primary + '22' : 'transparent',
                    },
                  ]}
                  onPress={() => setCopyOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy ${selectedName} to another day`}
                  accessibilityState={{ expanded: copyOpen }}
                >
                  <Text style={[styles.toolButtonText, { color: colors.text }]}>
                    ⧉ Copy day {copyOpen ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Copy-day popover (p27–p29) */}
            {copyOpen && dayBlocks.length > 0 && (
              <View style={[styles.copyRow, { borderColor: colors.border }]}>
                <Text style={[styles.copyLabel, { color: colors.textSecondary }]}>
                  Copy {getDayName(selectedDay, true)} to
                </Text>
                <View style={styles.copyChips}>
                  {weekDays.filter((d) => d !== selectedDay).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.copyChip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                      onPress={() => handleCopyDay(day)}
                      accessibilityRole="button"
                      accessibilityLabel={`Copy ${selectedName} to ${getDayName(day)}`}
                    >
                      <Text style={[styles.copyChipText, { color: colors.text }]}>{getDayName(day, true)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.zoomControls}>
              <RibbonZoomControls
                window={ribbonWindow}
                onChange={setRibbonWindow}
                focusMinutes={zoomFocusMinutes(ribbonWindow, focusBlock)}
              />
            </View>

            <DayRibbon
              blocks={activeRoutine.blocks}
              activityTypes={activityTypes}
              day={selectedDay}
              window={ribbonWindow}
              onWindowChange={setRibbonWindow}
              height={22}
              onSegmentPress={handleEditBlock}
              onEmptyPress={handleEmptyPress}
              onEdgeCommit={handleEdgeCommit}
              style={styles.ribbon}
              accessibilityLabel={`${selectedName} ribbon`}
            />

            {dragError !== null && (
              <Text
                style={[styles.dragError, { color: colors.error }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {dragError}
              </Text>
            )}

            <Text style={[styles.dayTitle, { color: colors.text }]}>{selectedName}</Text>
            <Text style={[styles.dayStats, { color: colors.textSecondary }]}>
              {dayBlocks.length === 0
                ? 'Nothing planned yet. Tap the timeline to add an activity.'
                : `${dayBlocks.length} ${dayBlocks.length === 1 ? 'activity' : 'activities'} · ${formatDuration(totalMinutes)} planned · tap an activity to edit it, drag its yellow edges to resize, or tap empty time to add one`}
            </Text>
          </View>

          {/* Planned breakdown (p42–p43) */}
          <RoutineBreakdown data={breakdown} title="Your week" />
        </View>
      </ScrollView>

      <BlockEditor
        visible={editor !== null}
        routineId={activeRoutine.id}
        block={editingBlock}
        dayOfWeek={editingBlock?.dayOfWeek ?? selectedDay}
        existingBlocks={activeRoutine.blocks}
        initialStart={editor?.kind === 'new' ? editor.start : undefined}
        initialEnd={editor?.kind === 'new' ? editor.end : undefined}
        onClose={handleCloseEditor}
        onSave={handleCloseEditor}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  routineName: {
    flexShrink: 1,
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  column: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    gap: spacing.md,
  },
  dayPanel: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toolButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  toolButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  copyRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  copyLabel: {
    fontSize: 14,
  },
  copyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  copyChip: {
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyChipText: {
    fontSize: 14,
  },
  zoomControls: {
    marginTop: spacing.md,
  },
  ribbon: {
    marginTop: spacing.sm,
  },
  dragError: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  dayTitle: {
    fontSize: 26,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  dayStats: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  noRoutine: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  primaryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
