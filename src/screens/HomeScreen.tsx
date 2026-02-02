import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/spacing';
import { useActiveRoutine, useCurrentTracking, useActiveGoals, useActivityTypes } from '../store';
import { formatDuration, getDayName, minutesToTimeString } from '../core/utils/time';
import { ActiveTimer, QuickStartHorizontal } from '../components/tracking';
import type { TabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Good {getTimeOfDay()}</Text>
          <Text style={styles.date}>
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
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
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
                      isPast ? styles.scheduleItemPast : undefined,
                      isCurrent ? styles.scheduleItemCurrent : undefined,
                      isNext ? styles.scheduleItemNext : undefined,
                    ]}
                  >
                    <View style={[styles.scheduleColor, { backgroundColor: activity?.color || '#666' }]} />
                    <View style={styles.scheduleContent}>
                      <View style={styles.scheduleTimeRow}>
                        <Text style={[styles.scheduleTime, isPast ? styles.textMuted : undefined]}>
                          {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
                        </Text>
                        {isCurrent && (
                          <View style={styles.nowBadge}>
                            <Text style={styles.nowBadgeText}>NOW</Text>
                          </View>
                        )}
                        {isNext && (
                          <View style={styles.nextBadge}>
                            <Text style={styles.nextBadgeText}>NEXT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.scheduleActivity, isPast ? styles.textMuted : undefined]}>
                        {activity?.icon} {activity?.name || 'Unknown'}
                      </Text>
                    </View>
                    <Text style={[styles.scheduleDuration, isPast ? styles.textMuted : undefined]}>
                      {formatDuration(adjustedDuration)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>No blocks scheduled for today</Text>
              <TouchableOpacity
                style={styles.emptyButton}
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
            <Text style={styles.sectionTitleInline}>Active Goals</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Goals')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {activeGoals.length > 0 ? (
            <View style={styles.goalsList}>
              {activeGoals.slice(0, 3).map((goal) => {
                const activity = activityTypes.find((a) => a.id === goal.activityTypeId);
                const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);
                return (
                  <View key={goal.id} style={styles.goalCard}>
                    <View style={styles.goalHeader}>
                      <Text style={styles.goalIcon}>{activity?.icon || '🎯'}</Text>
                      <View style={styles.goalInfo}>
                        <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
                        <Text style={styles.goalMeta}>
                          {formatDuration(goal.loggedMinutes)} / {formatDuration(goal.estimatedMinutes)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.goalProgress}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${progress}%`, backgroundColor: activity?.color || colors.primary },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>{progress.toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyText}>No active goals</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate('Goals')}
              >
                <Text style={styles.emptyButtonText}>Create a goal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.navigate('Routine')}
            >
              <Text style={styles.quickActionIcon}>📅</Text>
              <Text style={styles.quickActionText}>Edit Routine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.navigate('Goals')}
            >
              <Text style={styles.quickActionIcon}>🎯</Text>
              <Text style={styles.quickActionText}>Add Goal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.navigate('Analytics')}
            >
              <Text style={styles.quickActionIcon}>📊</Text>
              <Text style={styles.quickActionText}>View Stats</Text>
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
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  date: {
    fontSize: 16,
    color: colors.textSecondary,
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
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitleInline: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  scheduleList: {
    paddingHorizontal: spacing.lg,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scheduleItemPast: {
    opacity: 0.5,
  },
  scheduleItemCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  scheduleItemNext: {
    borderColor: colors.success + '60',
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
    color: colors.textSecondary,
  },
  nowBadge: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.success + '20',
    borderRadius: borderRadius.sm,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
  },
  scheduleActivity: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginTop: 2,
  },
  scheduleDuration: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  textMuted: {
    color: colors.textMuted,
  },
  goalsList: {
    paddingHorizontal: spacing.lg,
  },
  goalCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  goalMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  goalProgress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.borderLight,
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
    color: colors.textSecondary,
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
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  emptyButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: spacing.sm,
  },
  quickActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
