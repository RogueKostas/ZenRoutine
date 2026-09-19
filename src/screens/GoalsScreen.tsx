import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useActiveRoutine, useActivityTypes, useAppStore, useGoals } from '../store';
import { GOAL_FORECAST_EXPLAINER, predictAllGoals } from '../core/engine/prediction';
import {
  dropIndexForDrag,
  goalIdsWithLinkedTracking,
  goalRowHint,
  goalsInList,
  moveTargetForDrop,
  moveTargetForStep,
  newGoalFromAddRow,
  resolveGoalListFilter,
  rowShiftDuringDrag,
  showsTypeColumn,
  type GoalListFilter,
  type RowLayout,
} from '../core/engine/goalList';
import { toLocalDateKey } from '../core/utils/time';
import { GoalRow, Popover, PopoverItem, TypeIcon, measureAnchor, type Rect } from '../components/goals';
import { useDialog } from '../components/common/Dialog';
import type { TabScreenProps } from '../navigation/types';
import type { Goal } from '../core/types';

type Anchored = { goalId: string; anchor: Rect };
type DragState = { goalId: string; from: number; dy: number };

/**
 * The goals list (design §4.4): a ruled list with a filter box, an add line at the bottom, and
 * rows that are edited in place and dragged to reprioritise. Everything else is a small popover.
 */
export function GoalsScreen(_props: TabScreenProps<'Goals'>) {
  const { colors } = useTheme();
  const dialog = useDialog();
  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const activeRoutine = useActiveRoutine();
  const trackingEntries = useAppStore((state) => state.trackingEntries);
  const { addGoal, updateGoal, setGoalStatus, deleteGoal, moveGoal } = useAppStore();

  const [filterChoice, setFilterChoice] = useState<GoalListFilter>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [addText, setAddText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<Rect | null>(null);
  const [infoAnchor, setInfoAnchor] = useState<Rect | null>(null);
  const [typePicker, setTypePicker] = useState<Anchored | null>(null);
  const [menu, setMenu] = useState<Anchored | null>(null);
  const [notes, setNotes] = useState<(Anchored & { text: string }) | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const layouts = useRef(new Map<string, RowLayout>());
  const filterRef = useRef<View>(null);
  const infoRef = useRef<View>(null);
  const addInputRef = useRef<TextInput>(null);

  const filter = resolveGoalListFilter(filterChoice, activityTypes);
  const filterType = activityTypes.find((type) => type.id === filter);
  const rows = goalsInList(goals, filter, showArchived);
  const rowIds = rows.map((goal) => goal.id);
  const archivedCount = goalsInList(goals, filter, true).length - goalsInList(goals, filter).length;
  const lockedTypes = useMemo(() => goalIdsWithLinkedTracking(trackingEntries), [trackingEntries]);
  const forecastDays = useMemo(() => {
    const days = new Map<string, string | null>();
    if (!activeRoutine) return days;
    for (const prediction of predictAllGoals(goals, activeRoutine, trackingEntries)) {
      days.set(prediction.goalId, prediction.predictedCompletionDate);
    }
    return days;
  }, [goals, activeRoutine, trackingEntries]);
  const todayKey = toLocalDateKey();

  const rowLayouts = rows.map((goal) => layouts.current.get(goal.id) ?? { y: 0, height: 0 });
  const dropIndex = drag ? dropIndexForDrag(rowLayouts, drag.from, drag.dy) : -1;
  const draggedHeight = drag ? rowLayouts[drag.from]?.height ?? 0 : 0;

  const goalById = (goalId: string | undefined): Goal | undefined =>
    goals.find((goal) => goal.id === goalId);

  const submitNewGoal = () => {
    const result = newGoalFromAddRow(addText, filter);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    if (!addGoal(result.goal)) {
      setAddError('The goal could not be saved. Try again.');
      return;
    }
    setAddText('');
    setAddError(null);
    // Stay in the add line for the next one (p49: type, Enter, type again).
    requestAnimationFrame(() => addInputRef.current?.focus());
  };

  const finishDrag = (goalId: string, dy: number) => {
    const from = rowIds.indexOf(goalId);
    setDrag(null);
    if (from < 0) return;
    const target = moveTargetForDrop(rowIds, from, dropIndexForDrag(rowLayouts, from, dy));
    if (target) moveGoal(goalId, target);
  };

  const step = (goalId: string, direction: -1 | 1) => {
    const target = moveTargetForStep(rowIds, goalId, direction);
    if (target) moveGoal(goalId, target);
  };

  const confirmDelete = async (goal: Goal) => {
    const confirmed = await dialog.confirm({
      title: `Delete “${goal.name}”?`,
      message: 'Time already tracked stays in your history, no longer linked to a goal.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) deleteGoal(goal.id);
  };

  const menuGoal = goalById(menu?.goalId);
  const menuIndex = menuGoal ? rowIds.indexOf(menuGoal.id) : -1;
  const pickerGoal = goalById(typePicker?.goalId);
  const pickerLocked = pickerGoal ? lockedTypes.has(pickerGoal.id) : false;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <View ref={infoRef} collapsable={false} style={styles.headerSide}>
          <Pressable
            onPress={() => measureAnchor(infoRef.current, setInfoAnchor)}
            accessibilityRole="button"
            accessibilityLabel="How forecasts work"
            style={[styles.infoButton, { borderColor: colors.textSecondary }]}
          >
            <Text style={[styles.infoGlyph, { color: colors.textSecondary }]}>i</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Goals</Text>
        <View ref={filterRef} collapsable={false} style={[styles.headerSide, styles.headerRight]}>
          <Pressable
            onPress={() => measureAnchor(filterRef.current, setFilterAnchor)}
            accessibilityRole="button"
            accessibilityLabel={
              filterType ? `Showing ${filterType.name} goals. Change filter` : 'Showing all goals. Filter by activity type'
            }
            style={[styles.filterBox, { borderColor: colors.text }]}
          >
            {filterType ? (
              <TypeIcon type={filterType} size={28} />
            ) : (
              <Text style={[styles.filterAll, { color: colors.textSecondary }]}>All</Text>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        scrollEnabled={!drag}
        keyboardShouldPersistTaps="handled"
      >
        <View accessibilityRole="list">
          {rows.map((goal, index) => {
            const type = activityTypes.find((candidate) => candidate.id === goal.activityTypeId);
            return (
              <GoalRow
                key={goal.id}
                goal={goal}
                activityType={type}
                showType={showsTypeColumn(filter)}
                hint={goalRowHint(goal, forecastDays.get(goal.id), todayKey)}
                onToggleDone={() => setGoalStatus(goal.id, goal.status === 'completed' ? 'active' : 'completed')}
                onRename={(name) => updateGoal(goal.id, { name })}
                onSetEstimate={(draft) =>
                  updateGoal(goal.id, { estimatedMinutes: draft.kind === 'set' ? draft.minutes : null })
                }
                onOpenTypePicker={(anchor) => setTypePicker({ goalId: goal.id, anchor })}
                onOpenMenu={(anchor) => setMenu({ goalId: goal.id, anchor })}
                drag={{
                  onStart: () => setDrag({ goalId: goal.id, from: index, dy: 0 }),
                  onMove: (dy) => setDrag((current) => (current?.goalId === goal.id ? { ...current, dy } : current)),
                  onEnd: (dy) => finishDrag(goal.id, dy),
                  onCancel: () => setDrag(null),
                }}
                onLayout={(event) => {
                  const { y, height } = event.nativeEvent.layout;
                  layouts.current.set(goal.id, { y, height });
                }}
                isDragging={drag?.goalId === goal.id}
                offsetY={
                  !drag ? 0 : drag.goalId === goal.id ? drag.dy : rowShiftDuringDrag(index, drag.from, dropIndex, draggedHeight)
                }
              />
            );
          })}
        </View>

        {rows.length === 0 && (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            {filterType ? `No ${filterType.name} goals yet.` : 'No goals yet.'} Tap the line below to add one.
          </Text>
        )}

        <View style={[styles.addRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.addPlus, { color: colors.textMuted }]}>+</Text>
          <TextInput
            ref={addInputRef}
            value={addText}
            onChangeText={(text) => {
              setAddText(text);
              setAddError(null);
            }}
            onSubmitEditing={submitNewGoal}
            submitBehavior="submit"
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder={filterType ? `Add a ${filterType.name} goal…` : 'Add a goal…'}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={
              filterType ? `Add a goal. It will be a ${filterType.name} goal` : 'Add a goal. Press Enter to save'
            }
            style={[styles.addInput, { color: colors.text }]}
          />
        </View>
        {addError && (
          <Text accessibilityLiveRegion="polite" style={[styles.addError, { color: colors.error }]}>
            {addError}
          </Text>
        )}
        <View style={[styles.ruledLine, { borderBottomColor: colors.borderLight }]} />
        <View style={[styles.ruledLine, { borderBottomColor: colors.borderLight }]} />

        {(archivedCount > 0 || showArchived) && (
          <Pressable
            onPress={() => setShowArchived(!showArchived)}
            accessibilityRole="button"
            style={styles.archivedToggle}
          >
            <Text style={[styles.archivedText, { color: colors.textSecondary }]}>
              {showArchived ? 'Hide archived goals' : `Show ${archivedCount} archived`}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <Popover
        anchor={filterAnchor}
        onClose={() => setFilterAnchor(null)}
        width={64}
        accessibilityLabel="Filter by activity type"
      >
        <PopoverItem
          label="All"
          accessibilityLabel="All goals"
          selected={filter === null}
          icon={<Text style={[styles.filterAll, { color: colors.text }]}>All</Text>}
          hideLabel
          onPress={() => {
            setFilterChoice(null);
            setFilterAnchor(null);
          }}
        />
        {activityTypes.map((type) => (
          <PopoverItem
            key={type.id}
            label={type.name}
            accessibilityLabel={`Only ${type.name} goals`}
            selected={filter === type.id}
            icon={<TypeIcon type={type} size={30} />}
            hideLabel
            onPress={() => {
              setFilterChoice(type.id);
              setFilterAnchor(null);
            }}
          />
        ))}
      </Popover>

      <Popover
        anchor={typePicker?.anchor ?? null}
        onClose={() => setTypePicker(null)}
        width={230}
        accessibilityLabel="Activity type"
      >
        {pickerLocked && (
          <Text style={[styles.popoverNote, { color: colors.textSecondary }]}>
            Tracked time is linked to this goal, so its type can’t change.
          </Text>
        )}
        {pickerGoal &&
          [undefined, ...activityTypes].map((type) => (
            <PopoverItem
              key={type?.id ?? 'none'}
              label={type?.name ?? 'No type'}
              icon={<TypeIcon type={type} size={26} />}
              selected={pickerGoal.activityTypeId === type?.id}
              disabled={pickerLocked}
              onPress={() => {
                updateGoal(pickerGoal.id, { activityTypeId: type?.id ?? null });
                setTypePicker(null);
              }}
            />
          ))}
      </Popover>

      <Popover anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} width={210} accessibilityLabel="Goal actions">
        {menu && menuGoal && (
          <>
            <PopoverItem label="Move up" disabled={menuIndex <= 0} onPress={() => step(menuGoal.id, -1)} />
            <PopoverItem
              label="Move down"
              disabled={menuIndex < 0 || menuIndex >= rowIds.length - 1}
              onPress={() => step(menuGoal.id, 1)}
            />
            {menuGoal.status === 'active' && (
              <PopoverItem label="Pause" onPress={() => { setGoalStatus(menuGoal.id, 'paused'); setMenu(null); }} />
            )}
            {menuGoal.status === 'paused' && (
              <PopoverItem label="Resume" onPress={() => { setGoalStatus(menuGoal.id, 'active'); setMenu(null); }} />
            )}
            {menuGoal.status === 'archived' ? (
              <PopoverItem label="Restore" onPress={() => { setGoalStatus(menuGoal.id, 'active'); setMenu(null); }} />
            ) : (
              <PopoverItem label="Archive" onPress={() => { setGoalStatus(menuGoal.id, 'archived'); setMenu(null); }} />
            )}
            <PopoverItem
              label={menuGoal.description ? 'Notes…' : 'Add notes…'}
              onPress={() => {
                setNotes({ goalId: menuGoal.id, anchor: menu.anchor, text: menuGoal.description });
                setMenu(null);
              }}
            />
            <PopoverItem
              label="Delete"
              destructive
              onPress={() => {
                setMenu(null);
                void confirmDelete(menuGoal);
              }}
            />
          </>
        )}
      </Popover>

      <Popover anchor={notes?.anchor ?? null} onClose={() => setNotes(null)} width={300} accessibilityLabel="Notes">
        {notes && (
          <View style={styles.notes}>
            <TextInput
              value={notes.text}
              onChangeText={(text) => setNotes({ ...notes, text })}
              multiline
              autoFocus
              placeholder="Notes for this goal"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Notes"
              style={[styles.notesInput, { color: colors.text, borderColor: colors.border }]}
            />
            <Pressable
              onPress={() => {
                updateGoal(notes.goalId, { description: notes.text.trim() });
                setNotes(null);
              }}
              accessibilityRole="button"
              style={[styles.notesSave, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.notesSaveText, { color: colors.onPrimary }]}>Save notes</Text>
            </Pressable>
          </View>
        )}
      </Popover>

      <Popover
        anchor={infoAnchor}
        onClose={() => setInfoAnchor(null)}
        width={300}
        align="left"
        accessibilityLabel="How forecasts work"
      >
        <View style={styles.info}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>How forecasts work</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>{GOAL_FORECAST_EXPLAINER}</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Drag a row by its handle to change the order. A goal with no type or no estimate is a plain
            to-do item: it is never scheduled or forecast.
          </Text>
        </View>
      </Popover>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerSide: { width: 56 },
  headerRight: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center', fontSize: 30, fontWeight: '600' },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGlyph: { fontSize: 15, fontWeight: '700', fontStyle: 'italic' },
  filterBox: {
    width: 46,
    height: 46,
    borderWidth: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterAll: { fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  listContent: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingBottom: 48,
  },
  empty: { fontSize: 14, paddingVertical: 16, paddingLeft: 28 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderBottomWidth: 1,
  },
  addPlus: { width: 28, textAlign: 'center', fontSize: 18 },
  // Lines the typed name up with the names above it (after the handle and the checkbox).
  addInput: { flex: 1, fontSize: 17, paddingVertical: 10, marginLeft: 34 },
  addError: { fontSize: 12, paddingLeft: 62, paddingTop: 4 },
  ruledLine: { height: 44, borderBottomWidth: 1, marginLeft: 62, marginRight: 72 },
  archivedToggle: { alignSelf: 'flex-start', paddingVertical: 14, paddingLeft: 28 },
  archivedText: { fontSize: 13, textDecorationLine: 'underline' },
  popoverNote: { fontSize: 12, lineHeight: 16, paddingHorizontal: 12, paddingVertical: 6 },
  notes: { padding: 10, gap: 8 },
  notesInput: { minHeight: 90, borderWidth: 1, borderRadius: 6, padding: 8, fontSize: 14, textAlignVertical: 'top' },
  notesSave: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  notesSaveText: { fontWeight: '600' },
  info: { padding: 12, gap: 8 },
  infoTitle: { fontSize: 15, fontWeight: '700' },
  infoText: { fontSize: 13, lineHeight: 18 },
});
