import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useActiveRoutine, useCurrentTracking, useActiveGoals, useActivityTypes } from '../store';
import { formatDuration, getDayName, minutesToTimeString } from '../core/utils/time';
import type { TabScreenProps } from '../navigation/types';

export function HomeScreen({ navigation }: TabScreenProps<'Home'>) {
  const activeRoutine = useActiveRoutine();
  const currentTracking = useCurrentTracking();
  const activeGoals = useActiveGoals();
  const activityTypes = useActivityTypes();

  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayBlocks = activeRoutine?.blocks.filter((b) => b.dayOfWeek === dayOfWeek) || [];

  // Sort blocks by start time
  const sortedBlocks = [...todayBlocks].sort((a, b) => a.startMinutes - b.startMinutes);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Good {getTimeOfDay()}</Text>
          <Text style={styles.date}>
            {getDayName(dayOfWeek)}, {today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Current Tracking Card */}
        {currentTracking && (
          <View style={styles.trackingCard}>
            <Text style={styles.trackingLabel}>Currently Tracking</Text>
            <Text style={styles.trackingActivity}>
              {activityTypes.find((a) => a.id === currentTracking.activityTypeId)?.name || 'Unknown'}
            </Text>
            <Text style={styles.trackingTime}>
              Since {new Date(currentTracking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        {/* Today's Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          {sortedBlocks.length > 0 ? (
            <View style={styles.scheduleList}>
              {sortedBlocks.map((block) => {
                const activity = activityTypes.find((a) => a.id === block.activityTypeId);
                const duration = block.endMinutes - block.startMinutes;
                return (
                  <View key={block.id} style={styles.scheduleItem}>
                    <View style={[styles.scheduleColor, { backgroundColor: activity?.color || '#666' }]} />
                    <View style={styles.scheduleContent}>
                      <Text style={styles.scheduleTime}>
                        {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
                      </Text>
                      <Text style={styles.scheduleActivity}>{activity?.name || 'Unknown'}</Text>
                    </View>
                    <Text style={styles.scheduleDuration}>{formatDuration(duration)}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
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
            <Text style={styles.sectionTitle}>Active Goals</Text>
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
                      <View style={[styles.goalColor, { backgroundColor: activity?.color || '#666' }]} />
                      <Text style={styles.goalName} numberOfLines={1}>{goal.name}</Text>
                    </View>
                    <View style={styles.goalProgress}>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      </View>
                      <Text style={styles.progressText}>{progress.toFixed(0)}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
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
    padding: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  date: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  trackingCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.success + '15',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.success,
  },
  trackingLabel: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  trackingActivity: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 4,
  },
  trackingTime: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  seeAll: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  scheduleList: {
    paddingHorizontal: 20,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scheduleColor: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  scheduleContent: {
    flex: 1,
  },
  scheduleTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  scheduleActivity: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginTop: 2,
  },
  scheduleDuration: {
    fontSize: 14,
    color: colors.textMuted,
  },
  goalsList: {
    paddingHorizontal: 20,
  },
  goalCard: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  goalName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
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
    marginRight: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 35,
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  emptyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 6,
  },
  emptyButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
