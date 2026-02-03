import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { useActivityTypes, useGoals, useCurrentTracking, useAppStore } from '../../store';
import type { ActivityType, Goal } from '../../core/types';

interface QuickStartProps {
  onTrackingStarted?: (entryId: string) => void;
  maxActivities?: number;
  showGoalSelection?: boolean;
}

export function QuickStart({
  onTrackingStarted,
  maxActivities = 6,
  showGoalSelection = true,
}: QuickStartProps) {
  const activityTypes = useActivityTypes();
  const goals = useGoals();
  const activeTracking = useCurrentTracking();
  const { startTracking } = useAppStore();

  const [selectedActivity, setSelectedActivity] = useState<ActivityType | null>(null);
  const [showGoalModal, setShowGoalModal] = useState(false);

  // Get most used or default activities
  const quickActivities = useMemo(() => {
    return activityTypes.slice(0, maxActivities);
  }, [activityTypes, maxActivities]);

  // Get goals matching selected activity
  const matchingGoals = useMemo(() => {
    if (!selectedActivity) return [];
    return goals.filter(
      (g) => g.activityTypeId === selectedActivity.id && g.status === 'active'
    );
  }, [selectedActivity, goals]);

  const handleActivityPress = useCallback((activity: ActivityType) => {
    if (activeTracking) {
      // Already tracking something
      return;
    }

    const activityGoals = goals.filter(
      (g) => g.activityTypeId === activity.id && g.status === 'active'
    );

    if (showGoalSelection && activityGoals.length > 0) {
      setSelectedActivity(activity);
      setShowGoalModal(true);
    } else {
      // Start tracking without goal
      const id = startTracking({
        activityTypeId: activity.id,
        source: 'manual',
      });
      if (id) onTrackingStarted?.(id);
    }
  }, [activeTracking, goals, showGoalSelection, startTracking, onTrackingStarted]);

  const handleGoalSelect = useCallback((goal: Goal | null) => {
    if (!selectedActivity) return;

    const id = startTracking({
      activityTypeId: selectedActivity.id,
      goalId: goal?.id,
      source: 'manual',
    });

    setShowGoalModal(false);
    setSelectedActivity(null);
    if (id) onTrackingStarted?.(id);
  }, [selectedActivity, startTracking, onTrackingStarted]);

  if (activeTracking) {
    return null; // Don't show quick start when already tracking
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick Start</Text>
      <Text style={styles.subtitle}>Tap an activity to start tracking</Text>

      <View style={styles.grid}>
        {quickActivities.map((activity) => (
          <TouchableOpacity
            key={activity.id}
            style={[styles.activityCard, { borderColor: activity.color + '40' }]}
            onPress={() => handleActivityPress(activity)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: activity.color + '20' }]}>
              <Text style={styles.activityIcon}>{activity.icon}</Text>
            </View>
            <Text style={styles.activityName} numberOfLines={1}>
              {activity.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Goal Selection Modal */}
      <Modal
        visible={showGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link to Goal?</Text>
              <TouchableOpacity onPress={() => setShowGoalModal(false)}>
                <Text style={styles.modalClose}>×</Text>
              </TouchableOpacity>
            </View>

            {selectedActivity && (
              <View style={styles.selectedActivity}>
                <Text style={styles.selectedIcon}>{selectedActivity.icon}</Text>
                <Text style={styles.selectedName}>{selectedActivity.name}</Text>
              </View>
            )}

            <ScrollView style={styles.goalList}>
              <TouchableOpacity
                style={styles.goalOption}
                onPress={() => handleGoalSelect(null)}
              >
                <View style={styles.goalInfo}>
                  <Text style={styles.goalName}>No Goal</Text>
                  <Text style={styles.goalDesc}>Track without linking to a goal</Text>
                </View>
              </TouchableOpacity>

              {matchingGoals.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={styles.goalOption}
                  onPress={() => handleGoalSelect(goal)}
                >
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalName}>{goal.name}</Text>
                    <Text style={styles.goalDesc}>
                      {goal.loggedMinutes} / {goal.estimatedMinutes} min this week
                    </Text>
                  </View>
                  <View style={styles.goalProgress}>
                    <View
                      style={[
                        styles.goalProgressFill,
                        {
                          width: `${Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100)}%`,
                          backgroundColor: selectedActivity?.color || colors.primary,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Horizontal scroll version
export function QuickStartHorizontal({
  onTrackingStarted,
}: {
  onTrackingStarted?: (entryId: string) => void;
}) {
  const activityTypes = useActivityTypes();
  const activeTracking = useCurrentTracking();
  const { startTracking } = useAppStore();

  const handlePress = useCallback((activity: ActivityType) => {
    if (activeTracking) return;

    const id = startTracking({
      activityTypeId: activity.id,
      source: 'manual',
    });
    if (id) onTrackingStarted?.(id);
  }, [activeTracking, startTracking, onTrackingStarted]);

  if (activeTracking) return null;

  return (
    <View style={styles.horizontalContainer}>
      <Text style={styles.horizontalTitle}>Quick Start</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScroll}
      >
        {activityTypes.map((activity) => (
          <TouchableOpacity
            key={activity.id}
            style={styles.horizontalCard}
            onPress={() => handlePress(activity)}
          >
            <View
              style={[
                styles.horizontalIcon,
                { backgroundColor: activity.color + '20' },
              ]}
            >
              <Text style={styles.horizontalIconText}>{activity.icon}</Text>
            </View>
            <Text style={styles.horizontalName} numberOfLines={1}>
              {activity.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// Floating action button with activity menu
interface QuickStartFABProps {
  visible?: boolean;
  onTrackingStarted?: (entryId: string) => void;
}

export function QuickStartFAB({ visible = true, onTrackingStarted }: QuickStartFABProps) {
  const [expanded, setExpanded] = useState(false);
  const activityTypes = useActivityTypes();
  const activeTracking = useCurrentTracking();
  const { startTracking } = useAppStore();

  const handleActivityPress = useCallback((activity: ActivityType) => {
    const id = startTracking({
      activityTypeId: activity.id,
      source: 'manual',
    });
    setExpanded(false);
    if (id) onTrackingStarted?.(id);
  }, [startTracking, onTrackingStarted]);

  if (!visible || activeTracking) return null;

  return (
    <>
      {expanded && (
        <TouchableOpacity
          style={styles.fabOverlay}
          activeOpacity={1}
          onPress={() => setExpanded(false)}
        >
          <View style={styles.fabMenu}>
            {activityTypes.slice(0, 5).map((activity, index) => (
              <TouchableOpacity
                key={activity.id}
                style={[
                  styles.fabMenuItem,
                  { bottom: 70 + index * 56 },
                ]}
                onPress={() => handleActivityPress(activity)}
              >
                <Text style={styles.fabMenuLabel}>{activity.name}</Text>
                <View
                  style={[
                    styles.fabMenuIcon,
                    { backgroundColor: activity.color },
                  ]}
                >
                  <Text style={styles.fabMenuIconText}>{activity.icon}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.fab, expanded && styles.fabExpanded]}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.fabIcon}>{expanded ? '×' : '▶'}</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  // Grid version
  container: {
    padding: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  activityCard: {
    width: '31%',
    marginHorizontal: '1.16%',
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activityIcon: {
    fontSize: 24,
  },
  activityName: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    fontSize: 28,
    color: colors.textSecondary,
    lineHeight: 28,
  },
  selectedActivity: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
  },
  selectedIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  goalList: {
    padding: spacing.md,
  },
  goalOption: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalInfo: {
    marginBottom: spacing.sm,
  },
  goalName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  goalDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  goalProgress: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Horizontal version
  horizontalContainer: {
    paddingVertical: spacing.md,
  },
  horizontalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  horizontalScroll: {
    paddingHorizontal: spacing.md,
  },
  horizontalCard: {
    alignItems: 'center',
    marginHorizontal: spacing.sm,
    width: 72,
  },
  horizontalIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  horizontalIconText: {
    fontSize: 28,
  },
  horizontalName: {
    fontSize: 11,
    color: colors.text,
    textAlign: 'center',
  },

  // FAB version
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  fabMenu: {
    position: 'absolute',
    right: 24,
    bottom: 0,
  },
  fabMenuItem: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabMenuLabel: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    fontSize: 14,
    color: colors.text,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  fabMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabMenuIconText: {
    fontSize: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  fabExpanded: {
    backgroundColor: colors.textSecondary,
  },
  fabIcon: {
    fontSize: 24,
    color: '#fff',
  },
});
