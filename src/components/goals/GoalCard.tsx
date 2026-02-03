import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { formatDuration } from '../../core/utils/time';
import { ProgressBar } from '../common/ProgressBar';
import { Badge, ColorDot } from '../common/Badge';
import type { Goal, ActivityType } from '../../core/types';

interface GoalCardProps {
  goal: Goal;
  activityType?: ActivityType;
  prediction?: {
    predictedCompletionDate: string | null;
    weeklyMinutesAllocated: number;
    confidenceLevel: 'low' | 'medium' | 'high';
  };
  onPress?: () => void;
  onActionPress?: (action: 'pause' | 'resume' | 'complete' | 'archive') => void;
  compact?: boolean;
  showActions?: boolean;
  style?: ViewStyle;
}

export function GoalCard({
  goal,
  activityType,
  prediction,
  onPress,
  onActionPress,
  compact = false,
  showActions = true,
  style,
}: GoalCardProps) {
  const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);
  const remaining = Math.max(0, goal.estimatedMinutes - goal.loggedMinutes);

  const getStatusVariant = (): 'success' | 'warning' | 'muted' | 'default' => {
    switch (goal.status) {
      case 'completed':
        return 'success';
      case 'paused':
        return 'warning';
      case 'archived':
        return 'muted';
      default:
        return 'default';
    }
  };

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, style]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <ColorDot color={activityType?.color || '#666'} size={10} style={styles.compactDot} />
        <View style={styles.compactContent}>
          <Text style={styles.compactName} numberOfLines={1}>{goal.name}</Text>
          <ProgressBar progress={progress} height={4} showLabel labelPosition="right" />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ColorDot color={activityType?.color || '#666'} size={12} style={styles.dot} />
          <View style={styles.titleContainer}>
            <Text style={styles.name} numberOfLines={1}>{goal.name}</Text>
            <Text style={styles.activity}>{activityType?.name}</Text>
          </View>
        </View>
        <Badge label={goal.status} variant={getStatusVariant()} size="small" />
      </View>

      {goal.description && (
        <Text style={styles.description} numberOfLines={2}>{goal.description}</Text>
      )}

      <View style={styles.progressSection}>
        <ProgressBar
          progress={progress}
          height={8}
          color={activityType?.color}
        />
        <View style={styles.progressStats}>
          <Text style={styles.progressText}>
            {formatDuration(goal.loggedMinutes)} / {formatDuration(goal.estimatedMinutes)}
          </Text>
          <Text style={styles.progressPercent}>{progress.toFixed(0)}%</Text>
        </View>
      </View>

      {prediction && goal.status === 'active' && (
        <View style={styles.predictionSection}>
          <View style={styles.predictionRow}>
            <Text style={styles.predictionLabel}>Remaining</Text>
            <Text style={styles.predictionValue}>{formatDuration(remaining)}</Text>
          </View>
          <View style={styles.predictionRow}>
            <Text style={styles.predictionLabel}>Weekly allocation</Text>
            <Text style={styles.predictionValue}>
              {prediction.weeklyMinutesAllocated > 0
                ? formatDuration(prediction.weeklyMinutesAllocated)
                : 'None'}
            </Text>
          </View>
          {prediction.predictedCompletionDate && (
            <View style={styles.predictionRow}>
              <Text style={styles.predictionLabel}>Est. completion</Text>
              <Text style={[styles.predictionValue, styles.predictionDate]}>
                {prediction.predictedCompletionDate}
              </Text>
            </View>
          )}
        </View>
      )}

      {showActions && onActionPress && (
        <View style={styles.actions}>
          {goal.status === 'active' && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onActionPress('pause')}
              >
                <Text style={styles.actionText}>Pause</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onActionPress('complete')}
              >
                <Text style={[styles.actionText, styles.actionSuccess]}>Complete</Text>
              </TouchableOpacity>
            </>
          )}
          {goal.status === 'paused' && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onActionPress('resume')}
            >
              <Text style={[styles.actionText, styles.actionPrimary]}>Resume</Text>
            </TouchableOpacity>
          )}
          {goal.status === 'completed' && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onActionPress('archive')}
            >
              <Text style={styles.actionText}>Archive</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

interface GoalProgressMiniProps {
  goal: Goal;
  activityType?: ActivityType;
  style?: ViewStyle;
}

export function GoalProgressMini({ goal, activityType, style }: GoalProgressMiniProps) {
  const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);

  return (
    <View style={[styles.miniContainer, style]}>
      <View style={styles.miniHeader}>
        <ColorDot color={activityType?.color || '#666'} size={8} style={styles.miniDot} />
        <Text style={styles.miniName} numberOfLines={1}>{goal.name}</Text>
      </View>
      <View style={styles.miniProgress}>
        <View
          style={[
            styles.miniProgressBar,
            { width: `${progress}%`, backgroundColor: activityType?.color || colors.primary },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
    marginRight: spacing.sm,
  },
  dot: {
    marginTop: 4,
    marginRight: spacing.sm,
  },
  titleContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  activity: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  progressSection: {
    marginBottom: spacing.sm,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  progressPercent: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  predictionSection: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  predictionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  predictionValue: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  predictionDate: {
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginLeft: spacing.sm,
  },
  actionText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  actionPrimary: {
    color: colors.primary,
  },
  actionSuccess: {
    color: colors.success,
  },

  // Compact
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactDot: {
    marginRight: spacing.sm,
  },
  compactContent: {
    flex: 1,
  },
  compactName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs,
  },

  // Mini
  miniContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.sm,
    padding: spacing.xs,
  },
  miniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  miniDot: {
    marginRight: 4,
  },
  miniName: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
  },
  miniProgress: {
    height: 3,
    backgroundColor: colors.borderLight,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  miniProgressBar: {
    height: '100%',
    borderRadius: 1.5,
  },
});
