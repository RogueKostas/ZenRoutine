import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  LayoutChangeEvent,
  Dimensions,
} from 'react-native';
import { useTheme } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { minutesToTimeString, formatDuration } from '../../core/utils/time';
import type { RoutineBlock, ActivityType, Goal } from '../../core/types';

interface BlockItemLayout {
  y: number;
  height: number;
}

interface DraggableBlockListProps {
  blocks: RoutineBlock[];
  activityTypes: ActivityType[];
  onBlockPress: (block: RoutineBlock) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete?: (block: RoutineBlock) => void;
}

export function DraggableBlockList({
  blocks,
  activityTypes,
  onBlockPress,
  onReorder,
  onDelete,
}: DraggableBlockListProps) {
  const { colors } = useTheme();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const itemLayouts = useRef<BlockItemLayout[]>([]);
  const pan = useRef(new Animated.ValueXY()).current;
  const dragStartY = useRef(0);

  const createPanResponder = (index: number) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: (_, gestureState) => {
        setDraggingIndex(index);
        dragStartY.current = gestureState.y0;
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        pan.setValue({ x: 0, y: gestureState.dy });

        // Calculate hover index based on current position
        const currentY = dragStartY.current + gestureState.dy;
        let newHoverIndex = index;

        for (let i = 0; i < itemLayouts.current.length; i++) {
          const layout = itemLayouts.current[i];
          if (layout) {
            const itemCenter = layout.y + layout.height / 2;
            if (currentY < itemCenter) {
              newHoverIndex = i;
              break;
            }
            newHoverIndex = i + 1;
          }
        }

        newHoverIndex = Math.max(0, Math.min(newHoverIndex, blocks.length - 1));
        if (newHoverIndex !== hoverIndex) {
          setHoverIndex(newHoverIndex);
        }
      },
      onPanResponderRelease: () => {
        if (draggingIndex !== null && hoverIndex !== null && draggingIndex !== hoverIndex) {
          onReorder(draggingIndex, hoverIndex);
        }
        setDraggingIndex(null);
        setHoverIndex(null);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        setDraggingIndex(null);
        setHoverIndex(null);
        pan.setValue({ x: 0, y: 0 });
      },
    });
  };

  const handleLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    itemLayouts.current[index] = { y, height };
  };

  const getActivity = (activityTypeId: string) => {
    return activityTypes.find((a) => a.id === activityTypeId);
  };

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        const activity = getActivity(block.activityTypeId);
        const duration = block.endMinutes - block.startMinutes;
        const adjustedDuration = duration > 0 ? duration : duration + 1440;
        const isDragging = draggingIndex === index;
        const isHoverTarget = hoverIndex === index && draggingIndex !== null && draggingIndex !== index;
        const panResponder = createPanResponder(index);

        return (
          <Animated.View
            key={block.id}
            onLayout={handleLayout(index)}
            style={[
              styles.blockWrapper,
              isDragging && {
                transform: pan.getTranslateTransform(),
                zIndex: 100,
                elevation: 10,
              },
              isHoverTarget && { borderTopWidth: 2, borderTopColor: colors.primary, paddingTop: spacing.xs },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.blockCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                isDragging && { borderColor: colors.primary, shadowOpacity: 0.3 },
              ]}
              onPress={() => onBlockPress(block)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.blockColor, { backgroundColor: activity?.color || '#666' }]}
              />

              {/* Drag Handle */}
              <View {...panResponder.panHandlers} style={styles.dragHandle}>
                <View style={[styles.dragLine, { backgroundColor: colors.borderLight }]} />
                <View style={[styles.dragLine, { backgroundColor: colors.borderLight }]} />
                <View style={[styles.dragLine, { backgroundColor: colors.borderLight }]} />
              </View>

              <View style={styles.blockContent}>
                <Text style={[styles.blockTime, { color: colors.textSecondary }]}>
                  {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
                </Text>
                <Text style={[styles.blockActivity, { color: colors.text }]}>{activity?.name || 'Unknown'}</Text>
                {block.goalId && (
                  <View style={[styles.goalTag, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.goalTagText, { color: colors.primary }]}>Goal linked</Text>
                  </View>
                )}
              </View>

              <View style={styles.blockMeta}>
                <Text style={[styles.blockDuration, { color: colors.textSecondary }]}>{formatDuration(adjustedDuration)}</Text>
                <Text style={styles.activityIcon}>{activity?.icon || '📌'}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

// Enhanced block list with goal information
interface SimpleBlockListProps {
  blocks: RoutineBlock[];
  activityTypes: ActivityType[];
  goals?: Goal[];
  onBlockPress: (block: RoutineBlock) => void;
}

export function SimpleBlockList({
  blocks,
  activityTypes,
  goals = [],
  onBlockPress,
}: SimpleBlockListProps) {
  const { colors } = useTheme();

  const getActivity = (activityTypeId: string) => {
    return activityTypes.find((a) => a.id === activityTypeId);
  };

  const getGoal = (goalId: string | undefined) => {
    if (!goalId) return undefined;
    return goals.find((g) => g.id === goalId);
  };

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {blocks.map((block) => {
        const activity = getActivity(block.activityTypeId);
        const goal = getGoal(block.goalId);
        const duration = block.endMinutes - block.startMinutes;
        const adjustedDuration = duration > 0 ? duration : duration + 1440;

        // Calculate goal progress if linked
        const goalProgress = goal ? Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100) : 0;
        const blockContribution = goal ? Math.min(100, (adjustedDuration / goal.estimatedMinutes) * 100) : 0;

        return (
          <TouchableOpacity
            key={block.id}
            style={[styles.enhancedBlockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onBlockPress(block)}
            activeOpacity={0.7}
          >
            {/* Left: Big icon with colored background */}
            <View style={[styles.iconContainer, { backgroundColor: (activity?.color || '#666') + '20' }]}>
              <Text style={styles.bigIcon}>{activity?.icon || '📌'}</Text>
            </View>

            {/* Middle: Content */}
            <View style={styles.enhancedContent}>
              {/* Time */}
              <Text style={[styles.blockTime, { color: colors.textSecondary }]}>
                {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)} • {formatDuration(adjustedDuration)}
              </Text>

              {/* Goal name (prominent) or Activity name */}
              {goal ? (
                <>
                  <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>
                    {goal.name}
                  </Text>
                  <Text style={[styles.activitySubtitle, { color: colors.textSecondary }]}>
                    {activity?.name || 'Unknown'}
                  </Text>
                </>
              ) : (
                <Text style={[styles.blockActivityLarge, { color: colors.text }]}>
                  {activity?.name || 'Unknown'}
                </Text>
              )}

              {/* Progress bar for linked goals */}
              {goal && (
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBarBg, { backgroundColor: colors.borderLight }]}>
                    {/* Previous progress */}
                    <View
                      style={[
                        styles.progressFillPrevious,
                        { width: `${goalProgress}%`, backgroundColor: activity?.color || colors.primary, opacity: 0.5 },
                      ]}
                    />
                    {/* This block's contribution (shown brighter) */}
                    <View
                      style={[
                        styles.progressFillCurrent,
                        {
                          left: `${goalProgress}%`,
                          width: `${Math.min(blockContribution, 100 - goalProgress)}%`,
                          backgroundColor: activity?.color || colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={[styles.progressText, { color: colors.textMuted }]}>
                      {formatDuration(goal.loggedMinutes)} logged
                    </Text>
                    <Text style={[styles.progressText, { color: colors.textMuted }]}>
                      +{formatDuration(adjustedDuration)} this block
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Right: Chevron */}
            <View style={styles.chevronContainer}>
              <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  blockWrapper: {
    marginBottom: spacing.sm,
  },
  blockCard: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  blockColor: {
    width: 4,
  },
  dragHandle: {
    width: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: spacing.xs,
  },
  dragLine: {
    width: 16,
    height: 2,
    marginVertical: 2,
    borderRadius: 1,
  },
  blockContent: {
    flex: 1,
    padding: spacing.md,
  },
  blockTime: {
    fontSize: 12,
    marginBottom: 4,
  },
  blockActivity: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalTag: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  goalTagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  blockMeta: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  blockDuration: {
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  activityIcon: {
    fontSize: 20,
  },

  // Enhanced block styles
  enhancedBlockCard: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  bigIcon: {
    fontSize: 24,
  },
  enhancedContent: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  goalName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 13,
  },
  blockActivityLarge: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: spacing.sm,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFillPrevious: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    borderRadius: 3,
  },
  progressFillCurrent: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
    fontSize: 10,
  },
  chevronContainer: {
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 24,
  },
});
