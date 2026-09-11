import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import {
  useActiveRoutine,
  useCurrentTracking,
  useActiveGoals,
  useActivityTypes,
  useGoals,
  useTrackingEntries,
  useAppStore,
} from '../store';
import {
  formatDuration,
  getDayName,
  getTrackingEntryDurationMinutes,
  minutesToTimeString,
} from '../core/utils/time';
import { ActiveTimer, QuickStart } from '../components/tracking';
import type { TabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const { colors } = useTheme();
  const activeRoutine = useActiveRoutine();
  const activeTracking = useCurrentTracking();
  const activeGoals = useActiveGoals();
  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const trackingEntries = useTrackingEntries();
  const startTracking = useAppStore((state) => state.startTracking);
  const [trackingStatus, setTrackingStatus] = useState('');

  const today = new Date();
  const dayOfWeek = today.getDay();
  const currentMinutes = today.getHours() * 60 + today.getMinutes();
  const previousDay = (dayOfWeek + 6) % 7;
  const todayBlocks = activeRoutine?.blocks.filter((block) =>
    block.dayOfWeek === dayOfWeek ||
    (
      block.dayOfWeek === previousDay &&
      block.endMinutes <= block.startMinutes &&
      currentMinutes < block.endMinutes
    )
  ) || [];

  // Sort blocks by start time
  const sortedBlocks = [...todayBlocks].sort((left, right) => {
    const leftStart = left.dayOfWeek === previousDay ? left.startMinutes - 1440 : left.startMinutes;
    const rightStart = right.dayOfWeek === previousDay ? right.startMinutes - 1440 : right.startMinutes;
    return leftStart - rightStart;
  });
  const recentEntry = trackingEntries
    .filter((entry) => entry.endTime)
    .sort((left, right) => right.endTime!.localeCompare(left.endTime!))[0];
  const recentActivity = recentEntry
    ? activityTypes.find((activity) => activity.id === recentEntry.activityTypeId)
    : undefined;
  const recentGoal = recentEntry?.goalId
    ? goals.find((goal) => goal.id === recentEntry.goalId)
    : undefined;

  const startScheduledBlock = (block: NonNullable<typeof activeRoutine>['blocks'][number]) => {
    const activity = activityTypes.find((candidate) => candidate.id === block.activityTypeId);
    const entryId = startTracking({
      activityTypeId: block.activityTypeId,
      goalId: block.goalId,
      routineBlockId: block.id,
      source: 'scheduled',
    });
    setTrackingStatus(
      entryId
        ? `Started tracking ${activity?.name ?? 'scheduled activity'}.`
        : 'Unable to start tracking. Check that no other timer is running.'
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: colors.text }]}>Good {getTimeOfDay()}</Text>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {getDayName(dayOfWeek)}, {today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Active Tracking Display */}
        {activeTracking ? (
          <View style={styles.trackingSection}>
            <ActiveTimer
              onStopped={() => setTrackingStatus('Tracking stopped and saved. You can review it below.')}
            />
          </View>
        ) : (
          <QuickStart maxActivities={6} />
        )}

        <Text accessibilityLiveRegion="polite" style={styles.srStatus}>
          {trackingStatus}
        </Text>

        {/* Today's Schedule */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Schedule</Text>
          {sortedBlocks.length > 0 ? (
            <View style={styles.scheduleList}>
              {sortedBlocks.map((block) => {
                const activity = activityTypes.find((a) => a.id === block.activityTypeId);
                const duration = block.endMinutes - block.startMinutes;
                const adjustedDuration = duration > 0 ? duration : duration + 1440;

                // Determine if this occurrence is past, current, or upcoming.
                const isCarryover = block.dayOfWeek === previousDay;
                const isOvernight = block.endMinutes <= block.startMinutes;
                const isPast = !isCarryover && !isOvernight && block.endMinutes <= currentMinutes;
                const isCurrent = isCarryover || (
                  block.startMinutes <= currentMinutes &&
                  (isOvernight || currentMinutes < block.endMinutes)
                );
                const isNext = !isPast && !isCurrent &&
                  sortedBlocks.find((candidate) =>
                    candidate.dayOfWeek === dayOfWeek && candidate.startMinutes > currentMinutes
                  )?.id === block.id;

                return (
                  <View
                    key={block.id}
                    style={[
                      styles.scheduleItem,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      isPast ? styles.scheduleItemPast : undefined,
                      isCurrent ? { borderColor: colors.primary, backgroundColor: colors.primary + '08' } : undefined,
                      isNext ? { borderColor: colors.success + '60' } : undefined,
                    ]}
                  >
                    <View style={[styles.scheduleColor, { backgroundColor: activity?.color || '#666' }]} />
                    <View style={styles.scheduleContent}>
                      <View style={styles.scheduleTimeRow}>
                        <Text style={[styles.scheduleTime, { color: isPast ? colors.textMuted : colors.textSecondary }]}>
                          {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
                        </Text>
                        {isCurrent && (
                          <View style={[styles.nowBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.nowBadgeText}>NOW</Text>
                          </View>
                        )}
                        {isNext && (
                          <View style={[styles.nextBadge, { backgroundColor: colors.success + '20' }]}>
                            <Text style={[styles.nextBadgeText, { color: colors.success }]}>NEXT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.scheduleActivity, { color: isPast ? colors.textMuted : colors.text }]}>
                        {activity?.icon} {activity?.name || 'Unknown'}
                      </Text>
                    </View>
                    <View style={styles.scheduleActions}>
                      <Text style={[styles.scheduleDuration, { color: isPast ? colors.textMuted : colors.textSecondary }]}>
                        {formatDuration(adjustedDuration)}
                      </Text>
                      {!activeTracking && !isPast && (
                        <TouchableOpacity
                          style={[styles.startBlockButton, { backgroundColor: colors.primary }]}
                          onPress={() => startScheduledBlock(block)}
                          accessibilityRole="button"
                          accessibilityLabel={`Start ${activity?.name ?? 'scheduled activity'} from ${minutesToTimeString(block.startMinutes)} to ${minutesToTimeString(block.endMinutes)}`}
                        >
                          <Text style={styles.startBlockButtonText}>Start</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No blocks scheduled for today</Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate('Routine')}
                accessibilityRole="button"
                accessibilityLabel="Set up routine"
              >
                <Text style={styles.emptyButtonText}>Set up routine</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {!activeTracking && recentEntry && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently Tracked</Text>
            <View style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.recentSummary}>
                <Text style={styles.recentIcon}>{recentActivity?.icon ?? '✓'}</Text>
                <View style={styles.recentDetails}>
                  <Text style={[styles.recentName, { color: colors.text }]}>
                    {recentActivity?.name ?? 'Activity'}
                  </Text>
                  <Text style={[styles.recentMeta, { color: colors.textSecondary }]}>
                    {formatDuration(getTrackingEntryDurationMinutes(recentEntry))}
                    {recentGoal ? ` · ${recentGoal.name}` : ''}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.reviewButton, { borderColor: colors.primary }]}
                onPress={() => navigation.navigate('Analytics')}
                accessibilityRole="button"
                accessibilityLabel="Review tracked time this week"
              >
                <Text style={[styles.reviewButtonText, { color: colors.primary }]}>Review week</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Active Goals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitleInline, { color: colors.text }]}>Active Goals</Text>
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => navigation.navigate('Goals')}
              accessibilityRole="button"
              accessibilityLabel="See all goals"
            >
              <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {activeGoals.length > 0 ? (
            <View style={styles.goalsList}>
              {activeGoals.slice(0, 3).map((goal) => {
                const activity = activityTypes.find((a) => a.id === goal.activityTypeId);
                const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);
                return (
                  <View key={goal.id} style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.goalHeader}>
                      <Text style={styles.goalIcon}>{activity?.icon || '🎯'}</Text>
                      <View style={styles.goalInfo}>
                        <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>{goal.name}</Text>
                        <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>
                          {formatDuration(goal.loggedMinutes)} / {formatDuration(goal.estimatedMinutes)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.goalProgress}>
                      <View style={[styles.progressBar, { backgroundColor: colors.borderLight }]}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${progress}%`, backgroundColor: activity?.color || colors.primary },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progress.toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No active goals</Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate('Goals')}
                accessibilityRole="button"
                accessibilityLabel="Create a goal"
              >
                <Text style={styles.emptyButtonText}>Create a goal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Routine')}
              accessibilityRole="button"
              accessibilityLabel="Edit routine"
            >
              <Text style={styles.quickActionIcon}>📅</Text>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Edit Routine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Goals')}
              accessibilityRole="button"
              accessibilityLabel="Add goal"
            >
              <Text style={styles.quickActionIcon}>🎯</Text>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Add Goal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Analytics')}
              accessibilityRole="button"
              accessibilityLabel="View analytics"
            >
              <Text style={styles.quickActionIcon}>📊</Text>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>View Stats</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  date: {
    fontSize: 16,
    marginTop: spacing.xs,
  },
  trackingSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  srStatus: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitleInline: {
    fontSize: 18,
    fontWeight: '600',
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '500',
  },
  scheduleList: {
    paddingHorizontal: spacing.lg,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  scheduleItemPast: {
    opacity: 0.5,
  },
  scheduleColor: {
    width: 4,
    height: 44,
    borderRadius: 2,
    marginRight: spacing.md,
  },
  scheduleContent: {
    flex: 1,
  },
  scheduleTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleTime: {
    fontSize: 12,
  },
  nowBadge: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  nowBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  nextBadge: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  scheduleActivity: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  scheduleDuration: {
    fontSize: 14,
  },
  seeAllButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  scheduleActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  startBlockButton: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBlockButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  recentCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recentSummary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentIcon: {
    fontSize: 28,
    marginRight: spacing.sm,
  },
  recentDetails: {
    flex: 1,
  },
  recentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  recentMeta: {
    marginTop: 2,
    fontSize: 13,
  },
  reviewButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  reviewButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  goalsList: {
    paddingHorizontal: spacing.lg,
  },
  goalCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  goalIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalName: {
    fontSize: 15,
    fontWeight: '500',
  },
  goalMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  goalProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    width: 40,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    marginBottom: spacing.md,
  },
  emptyButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: spacing.sm,
  },
  quickActionText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
