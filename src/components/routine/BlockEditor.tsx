import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
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
import { blockEditorErrors, type BlockEditorErrors } from './blockEditorErrors';
import { activeGoalsForActivityType, quickAddGoal } from './blockGoals';
import type { RoutineBlock, DayOfWeek, ActivityType } from '../../core/types';

interface BlockEditorProps {
  visible: boolean;
  routineId: string;
  block?: RoutineBlock; // undefined for new block
  dayOfWeek: DayOfWeek;
  existingBlocks: RoutineBlock[];
  onClose: () => void;
  onSave: () => void;
}

export function BlockEditor({
  visible,
  routineId,
  block,
  dayOfWeek,
  existingBlocks,
  onClose,
  onSave,
}: BlockEditorProps) {
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
        // Find next available time slot
        const nextSlot = findNextAvailableSlot(existingBlocks, dayOfWeek);
        setStartTime(nextSlot.start);
        setEndTime(nextSlot.end);
      }
    }
  }, [visible, block, activityTypes, existingBlocks, dayOfWeek]);

  const duration = endTime >= startTime
    ? endTime - startTime
    : (1440 - startTime) + endTime;
  const timeError = timeDraftMessage(timeDrafts) ?? errors.time;

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
        message: `This block overlaps with an existing "${overlapActivity?.name}" block. Please adjust the time.`,
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
      title: 'Delete Block',
      message: 'Are you sure you want to delete this time block?',
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
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {isEditing ? 'Edit Block' : 'New Block'}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveButton}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Day indicator */}
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeText}>{getDayName(dayOfWeek)}</Text>
          </View>
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
          <View style={styles.summarySection}>
            <Text style={styles.summaryTitle}>Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>{formatDuration(duration)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Activity</Text>
                <Text style={styles.summaryValue}>
                  {activityTypes.find((a) => a.id === selectedActivityId)?.name || 'Not selected'}
                </Text>
              </View>
            </View>
          </View>

          {/* Delete button (only for editing) */}
          {isEditing && (
            <View style={styles.deleteSection}>
              <Button
                title="Delete Block"
                variant="destructive"
                onPress={handleDelete}
                fullWidth
              />
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelButton: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  dayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '15',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
  },
  dayBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  fieldError: {
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
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
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  noGoalsText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  summarySection: {
    marginBottom: spacing.xl,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
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
  deleteSection: {
    marginTop: spacing.lg,
  },
});
