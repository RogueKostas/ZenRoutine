import React, { useMemo, useState } from 'react';
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
  useRoutines,
  useTrackingEntries,
  useAppStore,
} from '../store';
import { isFirstRunEmpty } from '../store/sampleData';
import { formatDuration, formatGoalTimeLabel, getTrackingEntryDurationMinutes } from '../core/utils/time';
import { goalProgressPercent } from '../core/engine/goalList';
import {
  getDayOverview,
  getScheduledStart,
  getScheduleFocus,
  type DayOverviewRow,
} from '../core/engine/dayOverview';
import { ActiveTimer } from '../components/tracking';
import { TodayRibbon, useNow } from '../components/ribbon';
import {
  DayOverviewList,
  HomeClock,
  ScheduleFocusCard,
  TrackSomethingElse,
} from '../components/home';
import type { TabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const { colors } = useTheme();
  const activeRoutine = useActiveRoutine();
  const activeTracking = useCurrentTracking();
  const activeGoals = useActiveGoals();
  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const trackingEntries = useTrackingEntries();
  const routines = useRoutines();
  const startTracking = useAppStore((state) => state.startTracking);
  const addSampleData = useAppStore((state) => state._addSampleData);
  const [trackingStatus, setTrackingStatus] = useState('');
  const showExampleDataOffer = isFirstRunEmpty({ goals, routines, trackingEntries });
  const now = useNow(60_000);

  const overviewRows = useMemo(
    () => getDayOverview({ routine: activeRoutine, goals, trackingEntries, now }),
    [activeRoutine, goals, trackingEntries, now]
  );
  const focus = getScheduleFocus(overviewRows);
  const recentEntry = trackingEntries
    .filter((entry) => entry.endTime)
    .sort((left, right) => right.endTime!.localeCompare(left.endTime!))[0];
  const recentActivity = recentEntry
    ? activityTypes.find((activity) => activity.id === recentEntry.activityTypeId)
    : undefined;
  const recentGoal = recentEntry?.goalId
    ? goals.find((goal) => goal.id === recentEntry.goalId)
    : undefined;

  const startScheduledRow = (row: DayOverviewRow) => {
    const activity = activityTypes.find((candidate) => candidate.id === row.activityTypeId);
    const entryId = startTracking(getScheduledStart(row));
    setTrackingStatus(
      entryId
        ? `Started tracking ${row.goalName ?? activity?.name ?? 'scheduled activity'}.`
        : 'Unable to start tracking. Check that no other timer is running.'
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <HomeClock now={now} />

        <TodayRibbon />

        {showExampleDataOffer && (
          <View style={[styles.exampleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.exampleTitle, { color: colors.text }]}>Nothing here yet</Text>
            <Text style={[styles.exampleText, { color: colors.textSecondary }]}>
              Load an example week with goals and a few weeks of tracking to see how ZenRoutine works.
            </Text>
            <TouchableOpacity
              style={[styles.exampleButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                addSampleData();
              }}
              accessibilityRole="button"
              accessibilityLabel="Try it with example data"
            >
              <Text style={styles.exampleButtonText}>Try it with example data</Text>
            </TouchableOpacity>
            <Text style={[styles.exampleHint, { color: colors.textMuted }]}>
              Settings → Reset All Data removes it again.
            </Text>
          </View>
        )}

        {/* Active Tracking Display */}
        {activeTracking ? (
          <View style={styles.trackingSection}>
            <ActiveTimer
              onStopped={() => setTrackingStatus('Tracking stopped and saved. You can review it below.')}
            />
          </View>
        ) : (
          <>
            {overviewRows.length > 0 && (
              <ScheduleFocusCard focus={focus} activityTypes={activityTypes} onStart={startScheduledRow} />
            )}
            <TrackSomethingElse />
          </>
        )}

        <Text accessibilityLiveRegion="polite" style={styles.srStatus}>
          {trackingStatus}
        </Text>

        {/* Day Overview (#55) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Today</Text>
          {overviewRows.length > 0 ? (
            <DayOverviewList
              rows={overviewRows}
              activityTypes={activityTypes}
              canStart={!activeTracking}
              onStart={startScheduledRow}
            />
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
                const progress = goalProgressPercent(goal) ?? 0;
                return (
                  <View key={goal.id} style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.goalHeader}>
                      <Text style={styles.goalIcon}>{activity?.icon || '🎯'}</Text>
                      <View style={styles.goalInfo}>
                        <Text style={[styles.goalName, { color: colors.text }]} numberOfLines={1}>{goal.name}</Text>
                        <Text style={[styles.goalMeta, { color: colors.textSecondary }]}>
                          {formatGoalTimeLabel(goal.loggedMinutes, goal.estimatedMinutes)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  exampleCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  exampleTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  exampleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  exampleButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  exampleButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  exampleHint: {
    fontSize: 12,
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
  seeAllButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
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
