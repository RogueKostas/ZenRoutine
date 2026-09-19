import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { useTheme, type ThemeColors } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { getDayName, formatDuration } from '../../core/utils/time';
import { useActivityTypes, useGoals, useAppStore } from '../../store';
import { validateRoutineBlock, findOverlappingBlocks } from '../../core/engine/validation';
import { goalProgressPercent } from '../../core/engine/goalList';
import { TimeRangePicker } from './TimePicker';
import { findNextAvailableSlot, timeDraftMessage, type TimeDrafts } from './timeFields';
import { ActivityPicker } from '../activity/ActivityPicker';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useDialog } from '../common/Dialog';
import { formatRibbonEdgeLabel } from '../ribbon/ribbonLayout';
import { blockEditorErrors, type BlockEditorErrors } from './blockEditorErrors';
import { activeGoalsForActivityType, quickAddGoal } from './blockGoals';
import type { RoutineBlock, DayOfWeek, ActivityType } from '../../core/types';

interface BlockEditorProps {
  visible: boolean;
  routineId: string;
  block?: RoutineBlock; // undefined for new block
  dayOfWeek: DayOfWeek;
  existingBlocks: RoutineBlock[];
  /** Times for a new block, e.g. from a tap on the ribbon. Without them, the first free hour. */
  initialStart?: number;
  initialEnd?: number;
  onClose: () => void;
  onSave: () => void;
}

/** The activity edit box (p17–p19, p37): a small dialog over the ribbon, not a full screen. */
export function BlockEditor({
  visible,
  routineId,
  block,
  dayOfWeek,
  existingBlocks,
  initialStart,
  initialEnd,
  onClose,
  onSave,
}: BlockEditorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const activityTypes = useActivityTypes();
  const goals = useGoals();
  const { addRoutineBlock, updateRoutineBlock, deleteRoutineBlock, addGoal } = useAppStore();

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(540); // 9:00 AM
  const [endTime, setEndTime] = useState(600); // 10:00 AM
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalError, setNewGoalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<BlockEditorErrors>({});
  const [timeDrafts, setTimeDrafts] = useState<TimeDrafts>({});
  const dialog = useDialog();

  const isEditing = !!block;

  // Initialize state when block changes
  useEffect(() => {
    if (visible) {
      setErrors({});
      setTimeDrafts({});
      setNewGoalName('');
      setNewGoalError(null);
      if (block) {
        setSelectedActivityId(block.activityTypeId);
        setStartTime(block.startMinutes);
        setEndTime(block.endMinutes);
      } else {
        // Default to first activity type
        setSelectedActivityId(activityTypes[0]?.id || null);
        if (initialStart !== undefined && initialEnd !== undefined) {
          setStartTime(initialStart);
          setEndTime(initialEnd);
        } else {
          // Find next available time slot
          const nextSlot = findNextAvailableSlot(existingBlocks, dayOfWeek);
          setStartTime(nextSlot.start);
          setEndTime(nextSlot.end);
        }
      }
    }
  }, [visible, block, activityTypes, existingBlocks, dayOfWeek, initialStart, initialEnd]);

  const duration = endTime >= startTime
    ? endTime - startTime
    : (1440 - startTime) + endTime;
  const timeError = timeDraftMessage(timeDrafts) ?? errors.time;
  const selectedType = activityTypes.find((a) => a.id === selectedActivityId);

  // Where this block's time goes. Read-only: a block never names a goal (#60).
  const typeGoals = activeGoalsForActivityType(goals, selectedActivityId);

  // Creates the goal straight away and leaves the block being edited exactly as it is (#48).
  const handleQuickAddGoal = () => {
    const request = quickAddGoal(newGoalName, selectedActivityId);
    if (!request.ok) {
      setNewGoalError(request.error);
      return;
    }
    if (!addGoal(request.goal)) {
      setNewGoalError('The goal could not be saved. Try again.');
      return;
    }
    setNewGoalName('');
    setNewGoalError(null);
  };

  const handleSave = () => {
    const unparsedTime = timeDraftMessage(timeDrafts, true);
    if (unparsedTime) {
      setErrors({ time: unparsedTime });
      return;
    }
    if (!selectedActivityId) {
      setErrors({ activity: 'Please select an activity type' });
      return;
    }

    // Validate the block
    const newBlock: Partial<RoutineBlock> = {
      id: block?.id,
      dayOfWeek,
      startMinutes: startTime,
      endMinutes: endTime,
      activityTypeId: selectedActivityId,
    };

    const validation = validateRoutineBlock(newBlock);
    if (!validation.isValid) {
      setErrors(blockEditorErrors(validation.errors));
      return;
    }
    setErrors({});

    // Check for overlaps (excluding current block if editing)
    const blocksToCheck = existingBlocks.filter((b) => b.id !== block?.id);
    const overlaps = findOverlappingBlocks(blocksToCheck, newBlock as RoutineBlock);
    if (overlaps.length > 0) {
      const overlapActivity = activityTypes.find((a) => a.id === overlaps[0].activityTypeId);
      void dialog.notify({
        title: 'Time Conflict',
        message: `This activity overlaps with an existing "${overlapActivity?.name}" activity. Please adjust the time.`,
      });
      return;
    }

    if (isEditing && block) {
      updateRoutineBlock(routineId, block.id, {
        startMinutes: startTime,
        endMinutes: endTime,
        activityTypeId: selectedActivityId,
      });
    } else {
      addRoutineBlock(routineId, {
        dayOfWeek,
        startMinutes: startTime,
        endMinutes: endTime,
        activityTypeId: selectedActivityId,
      });
    }

    onSave();
    onClose();
  };

  const handleDelete = async () => {
    if (!block) return;

    const confirmed = await dialog.confirm({
      title: 'Delete activity?',
      message: 'This removes the activity from the routine.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    deleteRoutineBlock(routineId, block.id);
    onClose();
  };

  const handleStartTimeChange = (minutes: number) => {
    setErrors((prev) => ({ ...prev, time: undefined }));
    setStartTime(minutes);
  };

  const handleEndTimeChange = (minutes: number) => {
    setErrors((prev) => ({ ...prev, time: undefined }));
    setEndTime(minutes);
  };

  const handleActivitySelect = (activity: ActivityType) => {
    setErrors((prev) => ({ ...prev, activity: undefined }));
    setSelectedActivityId(activity.id);
    setNewGoalError(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* The card comes first so the focus trap starts inside it, not on the backdrop. */}
        <View
          accessibilityViewIsModal
          accessibilityLabel={isEditing ? 'Edit activity' : 'New activity'}
          style={styles.card}
        >
          {/* The time tab with the type's colour stroke (p17, p37) */}
          <View style={styles.header}>
            <View
              style={[styles.typeStroke, { backgroundColor: selectedType?.color ?? colors.border }]}
            />
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.title}>
                {isEditing ? 'Edit activity' : 'New activity'}
              </Text>
              <Text style={styles.subtitle}>
                {getDayName(dayOfWeek)} · ( {formatRibbonEdgeLabel(startTime)} – {formatRibbonEdgeLabel(endTime)} )
              </Text>
            </View>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
          >
            {errors.other && (
              <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                {errors.other}
              </Text>
            )}

            {/* Time Range */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Time</Text>
              <TimeRangePicker
                key={visible ? 'open' : 'closed'}
                startTime={startTime}
                endTime={endTime}
                onStartTimeChange={handleStartTimeChange}
                onEndTimeChange={handleEndTimeChange}
                onStartDraftChange={(start) => setTimeDrafts((prev) => ({ ...prev, start }))}
                onEndDraftChange={(end) => setTimeDrafts((prev) => ({ ...prev, end }))}
                minuteInterval={15}
              />
              {timeError && (
                <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                  {timeError}
                </Text>
              )}
            </View>

            {/* Activity Type */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Activity Type</Text>
              <ActivityPicker
                selectedId={selectedActivityId}
                onSelect={handleActivitySelect}
                layout="grid"
              />
              {errors.activity && (
                <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                  {errors.activity}
                </Text>
              )}
            </View>

            {/* Goals this block's time feeds (read-only), plus a quick add (#48, #60) */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Goals for this activity type</Text>

              {typeGoals.length > 0 ? (
                <View accessibilityRole="list">
                  {typeGoals.map((goal) => {
                    const progress = goalProgressPercent(goal) ?? 0;
                    return (
                      <View key={goal.id} style={styles.goalRow}>
                        <Text style={styles.goalRowText} numberOfLines={1}>
                          {goal.name}
                        </Text>
                        <Text style={styles.goalProgress}>{progress.toFixed(0)}%</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.noGoalsContainer}>
                  <Text style={styles.noGoalsText}>
                    {selectedActivityId
                      ? 'No active goals for this activity type yet'
                      : 'Select an activity type first'}
                  </Text>
                </View>
              )}

              {selectedActivityId && (
                <Input
                  containerStyle={styles.quickAdd}
                  value={newGoalName}
                  onChangeText={(text) => {
                    setNewGoalName(text);
                    setNewGoalError(null);
                  }}
                  onSubmitEditing={handleQuickAddGoal}
                  placeholder="New goal name"
                  accessibilityLabel="New goal name"
                  returnKeyType="done"
                  error={newGoalError ?? undefined}
                  rightIcon={
                    <TouchableOpacity
                      onPress={handleQuickAddGoal}
                      accessibilityRole="button"
                      accessibilityLabel="Add goal"
                    >
                      <Text style={styles.quickAddButton}>Add</Text>
                    </TouchableOpacity>
                  }
                />
              )}
            </View>

            {/* Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Summary</Text>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Duration</Text>
                  <Text style={styles.summaryValue}>{formatDuration(duration)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Activity</Text>
                  <Text style={styles.summaryValue}>{selectedType?.name || 'Not selected'}</Text>
                </View>
              </View>
            </View>

            {/* Delete (only for editing) */}
            {isEditing && (
              <Button
                title="Delete activity"
                variant="destructive"
                onPress={handleDelete}
                fullWidth
              />
            )}
          </ScrollView>

          {/* Cancel and Save side by side at the bottom (p17: Cancel left, OK right; #45) */}
          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={[styles.footerButton, styles.cancelButton]}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              accessibilityRole="button"
              style={[styles.footerButton, styles.saveButton]}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Close edit box"
          focusable={false}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.md,
    },
    backdrop: {
      backgroundColor: colors.overlay,
      zIndex: 0,
    },
    card: {
      zIndex: 1,
      width: '100%',
      maxWidth: 480,
      maxHeight: '100%',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    typeStroke: {
      width: 6,
      alignSelf: 'stretch',
      borderRadius: 3,
      marginRight: spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    content: {
      flexGrow: 0,
      flexShrink: 1,
    },
    contentInner: {
      padding: spacing.md,
    },
    section: {
      marginBottom: spacing.lg,
    },
    fieldError: {
      fontSize: 13,
      color: colors.error,
      marginTop: spacing.sm,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    goalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.backgroundSecondary,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      marginBottom: spacing.xs,
    },
    goalRowText: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
    },
    goalProgress: {
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: spacing.sm,
    },
    quickAdd: {
      marginTop: spacing.sm,
      marginBottom: 0,
    },
    quickAddButton: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
    noGoalsContainer: {
      backgroundColor: colors.backgroundSecondary,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    noGoalsText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    summaryCard: {
      backgroundColor: colors.backgroundSecondary,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
    },
    summaryLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    saveButton: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    saveText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.onPrimary,
    },
  });
