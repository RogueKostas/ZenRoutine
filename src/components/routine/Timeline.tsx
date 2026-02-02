import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { minutesToTimeString } from '../../core/utils/time';
import { BlockTimelineItem } from './BlockCard';
import type { RoutineBlock, ActivityType, Goal } from '../../core/types';

interface TimelineProps {
  blocks: RoutineBlock[];
  activityTypes: ActivityType[];
  goals?: Goal[];
  startHour?: number;
  endHour?: number;
  pixelsPerHour?: number;
  showCurrentTime?: boolean;
  onBlockPress?: (block: RoutineBlock) => void;
  style?: ViewStyle;
}

export function Timeline({
  blocks,
  activityTypes,
  goals = [],
  startHour = 6,
  endHour = 24,
  pixelsPerHour = 60,
  showCurrentTime = true,
  onBlockPress,
  style,
}: TimelineProps) {
  const hours = useMemo(() => {
    const result = [];
    for (let h = startHour; h <= endHour; h++) {
      result.push(h % 24);
    }
    return result;
  }, [startHour, endHour]);

  const totalHeight = (endHour - startHour) * pixelsPerHour;
  const pixelsPerMinute = pixelsPerHour / 60;
  const startMinutes = startHour * 60;

  // Sort blocks by start time
  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => a.startMinutes - b.startMinutes);
  }, [blocks]);

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimePosition = (currentMinutes - startMinutes) * pixelsPerMinute;
  const showCurrentIndicator = showCurrentTime &&
    currentMinutes >= startMinutes &&
    currentMinutes <= endHour * 60;

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      <View style={[styles.timeline, { height: totalHeight }]}>
        {/* Hour markers */}
        <View style={styles.hourMarkers}>
          {hours.map((hour, index) => (
            <View
              key={hour}
              style={[
                styles.hourMarker,
                { top: index * pixelsPerHour },
              ]}
            >
              <Text style={styles.hourLabel}>
                {minutesToTimeString(hour * 60)}
              </Text>
              <View style={styles.hourLine} />
            </View>
          ))}
        </View>

        {/* Blocks */}
        <View style={styles.blocksContainer}>
          {sortedBlocks.map((block) => {
            const activityType = activityTypes.find((a) => a.id === block.activityTypeId);
            const goal = goals.find((g) => g.id === block.goalId);
            const top = (block.startMinutes - startMinutes) * pixelsPerMinute;
            const duration = block.endMinutes - block.startMinutes;
            const adjustedDuration = duration < 0 ? duration + 1440 : duration;
            const height = adjustedDuration * pixelsPerMinute;

            return (
              <View
                key={block.id}
                style={[
                  styles.blockWrapper,
                  { top, height: Math.max(30, height) },
                ]}
              >
                <BlockTimelineItem
                  block={block}
                  activityType={activityType}
                  goal={goal}
                  onPress={() => onBlockPress?.(block)}
                  pixelsPerMinute={pixelsPerMinute}
                  minHeight={30}
                />
              </View>
            );
          })}
        </View>

        {/* Current time indicator */}
        {showCurrentIndicator && (
          <View style={[styles.currentTime, { top: currentTimePosition }]}>
            <View style={styles.currentTimeDot} />
            <View style={styles.currentTimeLine} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

interface CompactTimelineProps {
  blocks: RoutineBlock[];
  activityTypes: ActivityType[];
  onBlockPress?: (block: RoutineBlock) => void;
  style?: ViewStyle;
}

export function CompactTimeline({
  blocks,
  activityTypes,
  onBlockPress,
  style,
}: CompactTimelineProps) {
  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => a.startMinutes - b.startMinutes);
  }, [blocks]);

  // Calculate proportional widths based on duration
  const totalMinutes = blocks.reduce((sum, b) => {
    const duration = b.endMinutes - b.startMinutes;
    return sum + (duration < 0 ? duration + 1440 : duration);
  }, 0);

  return (
    <View style={[styles.compactContainer, style]}>
      {sortedBlocks.map((block) => {
        const activityType = activityTypes.find((a) => a.id === block.activityTypeId);
        const duration = block.endMinutes - block.startMinutes;
        const adjustedDuration = duration < 0 ? duration + 1440 : duration;
        const widthPercent = totalMinutes > 0 ? (adjustedDuration / totalMinutes) * 100 : 0;

        return (
          <View
            key={block.id}
            style={[
              styles.compactBlock,
              {
                width: `${widthPercent}%`,
                backgroundColor: activityType?.color || '#666',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

interface DayOverviewProps {
  blocks: RoutineBlock[];
  activityTypes: ActivityType[];
  style?: ViewStyle;
}

export function DayOverview({ blocks, activityTypes, style }: DayOverviewProps) {
  // Create 24-hour grid
  const hourBlocks = useMemo(() => {
    const hours: { hour: number; activityColor: string | null }[] = [];
    for (let h = 0; h < 24; h++) {
      const hourStart = h * 60;
      const hourEnd = (h + 1) * 60;

      // Find block that overlaps with this hour
      const block = blocks.find((b) => {
        const blockEnd = b.endMinutes < b.startMinutes ? b.endMinutes + 1440 : b.endMinutes;
        return b.startMinutes < hourEnd && blockEnd > hourStart;
      });

      const activity = block
        ? activityTypes.find((a) => a.id === block.activityTypeId)
        : null;

      hours.push({
        hour: h,
        activityColor: activity?.color || null,
      });
    }
    return hours;
  }, [blocks, activityTypes]);

  return (
    <View style={[styles.dayOverview, style]}>
      {hourBlocks.map(({ hour, activityColor }) => (
        <View
          key={hour}
          style={[
            styles.dayOverviewHour,
            activityColor && { backgroundColor: activityColor },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  timeline: {
    position: 'relative',
    marginLeft: 50,
    marginRight: spacing.md,
  },
  hourMarkers: {
    position: 'absolute',
    top: 0,
    left: -50,
    right: 0,
    bottom: 0,
  },
  hourMarker: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hourLabel: {
    width: 45,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
    marginRight: spacing.xs,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderLight,
  },
  blocksContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blockWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  currentTime: {
    position: 'absolute',
    left: -8,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.error,
  },

  // Compact timeline
  compactContainer: {
    flexDirection: 'row',
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    backgroundColor: colors.borderLight,
  },
  compactBlock: {
    height: '100%',
  },

  // Day overview
  dayOverview: {
    flexDirection: 'row',
    height: 20,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: colors.borderLight,
  },
  dayOverviewHour: {
    flex: 1,
    borderRightWidth: 0.5,
    borderRightColor: colors.background,
  },
});
