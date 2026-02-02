import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { minutesToTimeString, formatDuration } from '../../core/utils/time';
import { ColorDot } from '../common/Badge';
import type { RoutineBlock, ActivityType, Goal } from '../../core/types';

interface BlockCardProps {
  block: RoutineBlock;
  activityType?: ActivityType;
  goal?: Goal;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  isDragging?: boolean;
  compact?: boolean;
  style?: ViewStyle;
}

export function BlockCard({
  block,
  activityType,
  goal,
  onPress,
  onLongPress,
  onDelete,
  isSelected = false,
  isDragging = false,
  compact = false,
  style,
}: BlockCardProps) {
  const duration = block.endMinutes - block.startMinutes;
  const adjustedDuration = duration < 0 ? duration + 1440 : duration;
  const color = activityType?.color || '#666';

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactContainer,
          { borderLeftColor: color },
          isSelected && styles.selectedContainer,
          isDragging && styles.draggingContainer,
          style,
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
      >
        <Text style={styles.compactTime}>
          {minutesToTimeString(block.startMinutes)}
        </Text>
        <Text style={styles.compactName} numberOfLines={1}>
          {activityType?.name || 'Unknown'}
        </Text>
        <Text style={styles.compactDuration}>{formatDuration(adjustedDuration)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isSelected && styles.selectedContainer,
        isDragging && styles.draggingContainer,
        style,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={[styles.colorBar, { backgroundColor: color }]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.timeRange}>
            {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
          </Text>
          <Text style={styles.duration}>{formatDuration(adjustedDuration)}</Text>
        </View>
        <Text style={styles.activityName}>{activityType?.name || 'Unknown Activity'}</Text>
        {goal && (
          <View style={styles.goalContainer}>
            <Text style={styles.goalIcon}>🎯</Text>
            <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
          </View>
        )}
      </View>
      {onDelete && (
        <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

interface BlockTimelineItemProps {
  block: RoutineBlock;
  activityType?: ActivityType;
  goal?: Goal;
  onPress?: () => void;
  pixelsPerMinute?: number;
  minHeight?: number;
}

export function BlockTimelineItem({
  block,
  activityType,
  goal,
  onPress,
  pixelsPerMinute = 1,
  minHeight = 40,
}: BlockTimelineItemProps) {
  const duration = block.endMinutes - block.startMinutes;
  const adjustedDuration = duration < 0 ? duration + 1440 : duration;
  const height = Math.max(minHeight, adjustedDuration * pixelsPerMinute);
  const color = activityType?.color || '#666';

  return (
    <TouchableOpacity
      style={[
        styles.timelineItem,
        { height, borderLeftColor: color },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.timelineContent}>
        <Text style={styles.timelineActivity} numberOfLines={1}>
          {activityType?.name || 'Unknown'}
        </Text>
        {height > 50 && (
          <Text style={styles.timelineTime}>
            {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
          </Text>
        )}
        {height > 70 && goal && (
          <Text style={styles.timelineGoal} numberOfLines={1}>
            🎯 {goal.name}
          </Text>
        )}
      </View>
      <View style={[styles.timelineBg, { backgroundColor: color }]} />
    </TouchableOpacity>
  );
}

interface EmptyBlockSlotProps {
  startMinutes: number;
  endMinutes: number;
  onPress?: () => void;
}

export function EmptyBlockSlot({ startMinutes, endMinutes, onPress }: EmptyBlockSlotProps) {
  const duration = endMinutes - startMinutes;

  return (
    <TouchableOpacity
      style={styles.emptySlot}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={styles.emptySlotTime}>
        {minutesToTimeString(startMinutes)} - {minutesToTimeString(endMinutes)}
      </Text>
      <Text style={styles.emptySlotDuration}>{formatDuration(duration)} available</Text>
      <Text style={styles.emptySlotAdd}>+ Add block</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Standard card
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  selectedContainer: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  draggingContainer: {
    opacity: 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  colorBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  timeRange: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  duration: {
    fontSize: 12,
    color: colors.textMuted,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  goalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  goalIcon: {
    fontSize: 12,
    marginRight: spacing.xs,
  },
  goalName: {
    fontSize: 12,
    color: colors.primary,
    flex: 1,
  },
  deleteButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  deleteText: {
    fontSize: 24,
    color: colors.textMuted,
  },

  // Compact card
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactTime: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 45,
  },
  compactName: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginHorizontal: spacing.xs,
  },
  compactDuration: {
    fontSize: 12,
    color: colors.textMuted,
  },

  // Timeline item
  timelineItem: {
    position: 'relative',
    borderLeftWidth: 4,
    marginBottom: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  timelineBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
  },
  timelineContent: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  timelineActivity: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  timelineTime: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timelineGoal: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
  },

  // Empty slot
  emptySlot: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
  },
  emptySlotTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptySlotDuration: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  emptySlotAdd: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
