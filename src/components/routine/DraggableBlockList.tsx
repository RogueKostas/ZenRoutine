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
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { minutesToTimeString, formatDuration } from '../../core/utils/time';
import type { RoutineBlock, ActivityType } from '../../core/types';

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
              isHoverTarget && styles.hoverTarget,
            ]}
          >
            <TouchableOpacity
              style={[
                styles.blockCard,
                isDragging && styles.blockCardDragging,
              ]}
              onPress={() => onBlockPress(block)}
              activeOpacity={0.7}
            >
              <View
                style={[styles.blockColor, { backgroundColor: activity?.color || '#666' }]}
              />

              {/* Drag Handle */}
              <View {...panResponder.panHandlers} style={styles.dragHandle}>
                <View style={styles.dragLine} />
                <View style={styles.dragLine} />
                <View style={styles.dragLine} />
              </View>

              <View style={styles.blockContent}>
                <Text style={styles.blockTime}>
                  {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
                </Text>
                <Text style={styles.blockActivity}>{activity?.name || 'Unknown'}</Text>
                {block.goalId && (
                  <View style={styles.goalTag}>
                    <Text style={styles.goalTagText}>Goal linked</Text>
                  </View>
                )}
              </View>

              <View style={styles.blockMeta}>
                <Text style={styles.blockDuration}>{formatDuration(adjustedDuration)}</Text>
                <Text style={styles.activityIcon}>{activity?.icon || '📌'}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
}

// Alternative simpler list without drag (for basic usage)
interface SimpleBlockListProps {
  blocks: RoutineBlock[];
  activityTypes: ActivityType[];
  onBlockPress: (block: RoutineBlock) => void;
}

export function SimpleBlockList({
  blocks,
  activityTypes,
  onBlockPress,
}: SimpleBlockListProps) {
  const getActivity = (activityTypeId: string) => {
    return activityTypes.find((a) => a.id === activityTypeId);
  };

  if (blocks.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {blocks.map((block) => {
        const activity = getActivity(block.activityTypeId);
        const duration = block.endMinutes - block.startMinutes;
        const adjustedDuration = duration > 0 ? duration : duration + 1440;

        return (
          <TouchableOpacity
            key={block.id}
            style={styles.blockCard}
            onPress={() => onBlockPress(block)}
            activeOpacity={0.7}
          >
            <View
              style={[styles.blockColor, { backgroundColor: activity?.color || '#666' }]}
            />

            <View style={styles.blockContent}>
              <Text style={styles.blockTime}>
                {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
              </Text>
              <Text style={styles.blockActivity}>{activity?.name || 'Unknown'}</Text>
              {block.goalId && (
                <View style={styles.goalTag}>
                  <Text style={styles.goalTagText}>Goal linked</Text>
                </View>
              )}
            </View>

            <View style={styles.blockMeta}>
              <Text style={styles.blockDuration}>{formatDuration(adjustedDuration)}</Text>
              <Text style={styles.activityIcon}>{activity?.icon || '📌'}</Text>
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
  hoverTarget: {
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    paddingTop: spacing.xs,
  },
  blockCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  blockCardDragging: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderColor: colors.primary,
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
    backgroundColor: colors.borderLight,
    marginVertical: 2,
    borderRadius: 1,
  },
  blockContent: {
    flex: 1,
    padding: spacing.md,
  },
  blockTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  blockActivity: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  goalTag: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.sm,
  },
  goalTagText: {
    fontSize: 11,
    color: colors.primary,
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
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  activityIcon: {
    fontSize: 20,
  },
});
