import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { getDayName, formatDuration } from '../../core/utils/time';
import { useActivityTypes, useGoals, useAppStore } from '../../store';
import { validateRoutineBlock, findOverlappingBlocks } from '../../core/engine/validation';
import { TimeRangePicker } from './TimePicker';
import { ActivityPicker } from '../activity/ActivityPicker';
import { Button } from '../common/Button';
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
  const { addRoutineBlock, updateRoutineBlock, deleteRoutineBlock } = useAppStore();

  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(undefined);
  const [startTime, setStartTime] = useState(540); // 9:00 AM
  const [endTime, setEndTime] = useState(600); // 10:00 AM
  const [showGoalPicker, setShowGoalPicker] = useState(false);

  const isEditing = !!block;

  // Initialize state when block changes
  useEffect(() => {
    if (visible) {
      if (block) {
        setSelectedActivityId(block.activityTypeId);
        setSelectedGoalId(block.goalId);
        setStartTime(block.startMinutes);
        setEndTime(block.endMinutes);
      } else {
        // Default to first activity type
        setSelectedActivityId(activityTypes[0]?.id || null);
        setSelectedGoalId(undefined);
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

  // Filter goals by selected activity type
  const availableGoals = selectedActivityId
    ? goals.filter((g) => g.activityTypeId === selectedActivityId && g.status === 'active')
    : [];

  const handleSave = () => {
    if (!selectedActivityId) {
      Alert.alert('Error', 'Please select an activity type');
      return;
    }

    // Validate the block
    const newBlock: Partial<RoutineBlock> = {
      id: block?.id,
      dayOfWeek,
      startMinutes: startTime,
      endMinutes: endTime,
      activityTypeId: selectedActivityId,
      goalId: selectedGoalId,
    };

    const validation = validateRoutineBlock(newBlock);
    if (!validation.isValid) {
      Alert.alert('Invalid Block', validation.errors.map((e) => e.message).join('\n'));
      return;
    }

    // Check for overlaps (excluding current block if editing)
    const blocksToCheck = existingBlocks.filter((b) => b.id !== block?.id);
    const overlaps = findOverlappingBlocks(blocksToCheck, newBlock as RoutineBlock);
    if (overlaps.length > 0) {
      const overlapActivity = activityTypes.find((a) => a.id === overlaps[0].activityTypeId);
      Alert.alert(
        'Time Conflict',
        `This block overlaps with an existing "${overlapActivity?.name}" block. Please adjust the time.`
      );
      return;
    }

    if (isEditing && block) {
      updateRoutineBlock(routineId, block.id, {
        startMinutes: startTime,
        endMinutes: endTime,
        activityTypeId: selectedActivityId,
        goalId: selectedGoalId,
      });
    } else {
      addRoutineBlock(routineId, {
        dayOfWeek,
        startMinutes: startTime,
        endMinutes: endTime,
        activityTypeId: selectedActivityId,
        goalId: selectedGoalId,
      });
    }

    onSave();
    onClose();
  };

  const handleDelete = () => {
    if (!block) return;

    Alert.alert(
      'Delete Block',
      'Are you sure you want to delete this time block?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteRoutineBlock(routineId, block.id);
            onClose();
          },
        },
      ]
    );
  };

  const handleActivitySelect = (activity: ActivityType) => {
    setSelectedActivityId(activity.id);
    // Clear goal if it doesn't match the new activity type
    if (selectedGoalId) {
      const goal = goals.find((g) => g.id === selectedGoalId);
      if (goal && goal.activityTypeId !== activity.id) {
        setSelectedGoalId(undefined);
      }
    }
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

          {/* Time Range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time</Text>
            <TimeRangePicker
              startTime={startTime}
              endTime={endTime}
              onStartTimeChange={setStartTime}
              onEndTimeChange={setEndTime}
              minuteInterval={15}
            />
          </View>

          {/* Activity Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity Type</Text>
            <ActivityPicker
              selectedId={selectedActivityId}
              onSelect={handleActivitySelect}
              layout="grid"
            />
          </View>

          {/* Goal (optional) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Link to Goal</Text>
              <Text style={styles.optionalBadge}>Optional</Text>
            </View>

            {availableGoals.length > 0 ? (
              <View style={styles.goalList}>
                <TouchableOpacity
                  style={[
                    styles.goalOption,
                    !selectedGoalId && styles.goalOptionSelected,
                  ]}
                  onPress={() => setSelectedGoalId(undefined)}
                >
                  <Text
                    style={[
                      styles.goalOptionText,
                      !selectedGoalId && styles.goalOptionTextSelected,
                    ]}
                  >
                    No goal
                  </Text>
                </TouchableOpacity>
                {availableGoals.map((goal) => {
                  const progress = (goal.loggedMinutes / goal.estimatedMinutes) * 100;
                  return (
                    <TouchableOpacity
                      key={goal.id}
                      style={[
                        styles.goalOption,
                        selectedGoalId === goal.id && styles.goalOptionSelected,
                      ]}
                      onPress={() => setSelectedGoalId(goal.id)}
                    >
                      <View style={styles.goalInfo}>
                        <Text
                          style={[
                            styles.goalOptionText,
                            selectedGoalId === goal.id && styles.goalOptionTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {goal.name}
                        </Text>
                        <Text style={styles.goalProgress}>
                          {progress.toFixed(0)}% complete
                        </Text>
                      </View>
                      {selectedGoalId === goal.id && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.noGoalsContainer}>
                <Text style={styles.noGoalsText}>
                  {selectedActivityId
                    ? 'No active goals for this activity type'
                    : 'Select an activity type first'}
                </Text>
              </View>
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
              {selectedGoalId && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Goal</Text>
                  <Text style={styles.summaryValue}>
                    {goals.find((g) => g.id === selectedGoalId)?.name || 'None'}
                  </Text>
                </View>
              )}
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

// Helper function to find next available time slot
function findNextAvailableSlot(
  blocks: RoutineBlock[],
  dayOfWeek: DayOfWeek
): { start: number; end: number } {
  const dayBlocks = blocks
    .filter((b) => b.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (dayBlocks.length === 0) {
    return { start: 540, end: 600 }; // Default 9:00 - 10:00
  }

  // Try to find a gap
  let lastEnd = 0;
  for (const block of dayBlocks) {
    if (block.startMinutes - lastEnd >= 60) {
      // Found a gap of at least 1 hour
      return { start: lastEnd, end: Math.min(lastEnd + 60, block.startMinutes) };
    }
    lastEnd = block.endMinutes;
  }

  // No gap found, add after the last block
  if (lastEnd < 1380) {
    return { start: lastEnd, end: Math.min(lastEnd + 60, 1440) };
  }

  // Day is full, default to morning
  return { start: 540, end: 600 };
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  optionalBadge: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: spacing.sm,
    marginBottom: spacing.sm,
  },
  goalList: {},
  goalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  goalOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  goalInfo: {
    flex: 1,
  },
  goalOptionText: {
    fontSize: 15,
    color: colors.text,
  },
  goalOptionTextSelected: {
    fontWeight: '600',
  },
  goalProgress: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: spacing.sm,
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
