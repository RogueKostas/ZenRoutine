import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { useActiveRoutine, useCurrentTracking, useActiveGoals, useActivityTypes } from '../store';
import { formatDuration, getDayName, minutesToTimeString } from '../core/utils/time';
import { ActiveTimer, QuickStartHorizontal } from '../components/tracking';
import type { TabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const { colors } = useTheme();
  const activeRoutine = useActiveRoutine();
  const activeTracking = useCurrentTracking();
  const activeGoals = useActiveGoals();
  const activityTypes = useActivityTypes();

  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayBlocks = activeRoutine?.blocks.filter((b) => b.dayOfWeek === dayOfWeek) || [];

  // Sort blocks by start time
  const sortedBlocks = [...todayBlocks].sort((a, b) => a.startMinutes - b.startMinutes);

  // Get current time in minutes for highlighting current/upcoming blocks
  const currentMinutes = today.getHours() * 60 + today.getMinutes();

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
            <ActiveTimer />
          </View>
        ) : (
          <QuickStartHorizontal />
        )}

        {/* Today's Schedule */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Schedule</Text>
          {sortedBlocks.length > 0 ? (
            <View style={styles.scheduleList}>
              {sortedBlocks.map((block) => {
                const activity = activityTypes.find((a) => a.id === block.activityTypeId);
                const duration = block.endMinutes - block.startMinutes;
                const adjustedDuration = duration > 0 ? duration : duration + 1440;

                // Determine if block is past, current, or upcoming
                const isPast = block.endMinutes < currentMinutes;
                const isCurrent = block.startMinutes <= currentMinutes && block.endMinutes > currentMinutes;
                const isNext = !isPast && !isCurrent &&
                  sortedBlocks.find((b) => b.startMinutes > currentMinutes)?.id === block.id;

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
                    <Text style={[styles.scheduleDuration, { color: isPast ? colors.textMuted : colors.textSecondary }]}>
                      {formatDuration(adjustedDuration)}
                    </Text>
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
              >
                <Text style={styles.emptyButtonText}>Set up routine</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Active Goals */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitleInline, { color: colors.text }]}>Active Goals</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Goals')}>
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
            >
              <Text style={styles.quickActionIcon}>📅</Text>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Edit Routine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Goals')}
            >
              <Text style={styles.quickActionIcon}>🎯</Text>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Add Goal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => navigation.navigate('Analytics')}
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
