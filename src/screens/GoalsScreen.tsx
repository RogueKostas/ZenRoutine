import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useGoals, useActivityTypes, useActiveRoutine, useAppStore } from '../store';
import { predictAllGoals } from '../core/engine/prediction';
import { formatDuration } from '../core/utils/time';
import type { TabScreenProps } from '../navigation/types';
import type { GoalStatus, GoalPriority } from '../core/types';
import { PRIORITY_LABELS, PRIORITY_COLORS } from '../core/types';

type FilterStatus = 'all' | GoalStatus;

export function GoalsScreen({ navigation }: TabScreenProps<'Goals'>) {
  const { colors } = useTheme();
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [activityFilter, setActivityFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalMinutes, setNewGoalMinutes] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<GoalPriority>(3); // Default to Medium
  const [goalError, setGoalError] = useState<string | null>(null);

  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const activeRoutine = useActiveRoutine();
  const { addGoal, setGoalStatus, deleteGoal, trackingEntries } = useAppStore();

  // Filter by status
  let filteredGoals = statusFilter === 'all'
    ? goals
    : goals.filter((g) => g.status === statusFilter);

  // Filter by activity type
  if (activityFilter) {
    filteredGoals = filteredGoals.filter((g) => g.activityTypeId === activityFilter);
  }

  // Sort by priority (highest = 1 first)
  filteredGoals = [...filteredGoals].sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));

  const predictions = activeRoutine
    ? predictAllGoals(goals, activeRoutine, trackingEntries)
    : [];

  const handleAddGoal = () => {
    const estimatedMinutes = Number(newGoalMinutes);
    if (!newGoalName.trim()) {
      setGoalError('Enter a name for the goal.');
      return;
    }
    if (!selectedActivityId) {
      setGoalError('Choose an activity type.');
      return;
    }
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
      setGoalError('Estimated time must be a whole number greater than zero.');
      return;
    }

    const goalId = addGoal({
      name: newGoalName.trim(),
      description: newGoalDescription.trim(),
      estimatedMinutes,
      activityTypeId: selectedActivityId,
      priority: selectedPriority,
    });
    if (!goalId) {
      setGoalError('The goal could not be saved. Check the details and try again.');
      return;
    }

    setNewGoalName('');
    setNewGoalMinutes('');
    setNewGoalDescription('');
    setSelectedActivityId(null);
    setSelectedPriority(3);
    setGoalError(null);
    setShowAddModal(false);
  };

  const getStatusCounts = () => ({
    all: goals.length,
    active: goals.filter((g) => g.status === 'active').length,
    completed: goals.filter((g) => g.status === 'completed').length,
    paused: goals.filter((g) => g.status === 'paused').length,
    archived: goals.filter((g) => g.status === 'archived').length,
  });

  const counts = getStatusCounts();

  const getStatusBadgeStyle = (status: GoalStatus) => {
    switch (status) {
      case 'active': return { backgroundColor: colors.success + '20' };
      case 'completed': return { backgroundColor: colors.primary + '20' };
      case 'paused': return { backgroundColor: colors.warning + '20' };
      case 'archived': return { backgroundColor: colors.textMuted + '20' };
      default: return {};
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Goals</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            setGoalError(null);
            setShowAddModal(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add goal"
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Status Filter Tabs */}
      <ScrollView
        horizontal
        style={styles.filterRow}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRowContent}
      >
        {(['all', 'active', 'completed', 'paused', 'archived'] as FilterStatus[]).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterTab,
              { backgroundColor: colors.backgroundSecondary },
              statusFilter === status && { backgroundColor: colors.primary },
            ]}
            onPress={() => setStatusFilter(status)}
            accessibilityRole="tab"
            accessibilityLabel={`${status} goals, ${counts[status]}`}
            accessibilityState={{ selected: statusFilter === status }}
          >
            <Text style={[
              styles.filterText,
              { color: colors.textSecondary },
              statusFilter === status && styles.filterTextActive,
            ]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
            <Text style={[
              styles.filterCount,
              { color: colors.textMuted },
              statusFilter === status && styles.filterCountActive,
            ]}>
              {counts[status]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Activity Type Filter */}
      <ScrollView
        horizontal
        style={[styles.filterRow, styles.activityFilterRow, { borderBottomColor: colors.border }]}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRowContent}
      >
        <TouchableOpacity
          style={[
            styles.activityFilterTab,
            { backgroundColor: colors.backgroundSecondary },
            !activityFilter && { backgroundColor: colors.primary },
          ]}
          onPress={() => setActivityFilter(null)}
          accessibilityRole="button"
          accessibilityLabel="Show all activity types"
          accessibilityState={{ selected: !activityFilter }}
        >
          <Text style={[
            styles.filterText,
            { color: colors.textSecondary },
            !activityFilter && styles.filterTextActive,
          ]}>
            All types
          </Text>
        </TouchableOpacity>
        {activityTypes.map((at) => (
          <TouchableOpacity
            key={at.id}
            style={[
              styles.activityFilterTab,
              { backgroundColor: colors.backgroundSecondary },
              activityFilter === at.id && { backgroundColor: at.color + '30', borderColor: at.color, borderWidth: 1 },
            ]}
            onPress={() => setActivityFilter(activityFilter === at.id ? null : at.id)}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${at.name}`}
            accessibilityState={{ selected: activityFilter === at.id }}
          >
            <Text style={styles.activityFilterIcon}>{at.icon}</Text>
            <Text style={[
              styles.activityFilterText,
              { color: colors.text },
              activityFilter === at.id && { fontWeight: '600' },
            ]} numberOfLines={1}>
              {at.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeRoutine && predictions.length > 0 && (
        <View style={[styles.forecastNotice, { backgroundColor: colors.backgroundSecondary }]}>
          <Text style={[styles.forecastNoticeTitle, { color: colors.text }]}>How forecasts work</Text>
          <Text style={[styles.forecastNoticeText, { color: colors.textSecondary }]}>
            Goal-linked blocks stay dedicated. Unlinked time is shared by priority, then
            reallocated as goals finish. Dates assume this routine and these priorities continue.
          </Text>
        </View>
      )}

      {/* Goals List */}
      <ScrollView style={styles.goalsList} showsVerticalScrollIndicator={false}>
        {filteredGoals.length > 0 ? (
          filteredGoals.map((goal) => {
            const activity = activityTypes.find((a) => a.id === goal.activityTypeId);
            const prediction = predictions.find((p) => p.goalId === goal.id);
            const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);

            return (
              <View
                key={goal.id}
                style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.goalHeader}>
                  <View style={[styles.goalColor, { backgroundColor: activity?.color || '#666' }]} />
                  <View style={styles.goalInfo}>
                    <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
                    <View style={styles.goalMeta}>
                      <Text style={[styles.goalActivity, { color: colors.textSecondary }]}>{activity?.name}</Text>
                      {goal.priority && (
                        <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[goal.priority] + '20' }]}>
                          <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[goal.priority] }]} />
                          <Text style={[styles.priorityText, { color: PRIORITY_COLORS[goal.priority] }]}>
                            {PRIORITY_LABELS[goal.priority]}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, getStatusBadgeStyle(goal.status)]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>{goal.status}</Text>
                  </View>
                </View>

                {goal.description ? (
                  <Text style={[styles.goalDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                    {goal.description}
                  </Text>
                ) : null}

                <View style={styles.progressSection}>
                  <View style={[styles.progressBar, { backgroundColor: colors.borderLight }]}>
                    <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <View style={styles.progressStats}>
                    <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                      {formatDuration(goal.loggedMinutes)} / {formatDuration(goal.estimatedMinutes)}
                    </Text>
                    <Text style={[styles.progressPercent, { color: colors.primary }]}>{progress.toFixed(0)}%</Text>
                  </View>
                </View>

                {prediction && goal.status === 'active' && (
                  <View style={[styles.predictionSection, { borderTopColor: colors.borderLight }]}>
                    <View style={styles.predictionHeader}>
                      <View>
                        <Text style={[styles.predictionLabel, { color: colors.textSecondary }]}>Estimated completion</Text>
                        <Text style={[styles.predictionDate, { color: colors.primary }]}>
                          {prediction.predictedCompletionDate || 'No available routine time'}
                        </Text>
                      </View>
                      <View style={[styles.confidenceBadge, { backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={[styles.confidenceText, { color: colors.textSecondary }]}>
                          {prediction.confidenceLevel} confidence
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.predictionCapacity, { color: colors.text }]}>
                      {formatDuration(prediction.weeklyMinutesAllocated)}/week allocated from{' '}
                      {formatDuration(prediction.activityWeeklyCapacity)} scheduled
                    </Text>
                    <Text style={[styles.predictionReason, { color: colors.textSecondary }]}>
                      {prediction.dedicatedWeeklyMinutes > 0
                        ? `${formatDuration(prediction.dedicatedWeeklyMinutes)} is linked directly to this goal. `
                        : ''}
                      {prediction.competingGoalCount > 0 && prediction.sharedWeeklyCapacity > 0
                        ? `Unlinked time is shared with ${prediction.competingGoalCount} other active goal${prediction.competingGoalCount === 1 ? '' : 's'} by priority. `
                        : prediction.otherLinkedWeeklyMinutes > 0
                          ? `${formatDuration(prediction.otherLinkedWeeklyMinutes)} is linked to other goals and stays reserved. `
                          : 'No other active goal competes for this activity. '}
                      {prediction.confidenceReason}
                    </Text>
                  </View>
                )}

                <View style={[styles.goalActions, { borderTopColor: colors.borderLight }]}>
                  {goal.status === 'active' && (
                    <>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => setGoalStatus(goal.id, 'paused')}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Pause</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => setGoalStatus(goal.id, 'completed')}
                      >
                        <Text style={[styles.actionButtonText, { color: colors.success }]}>
                          Complete
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {goal.status === 'paused' && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setGoalStatus(goal.id, 'active')}
                    >
                      <Text style={[styles.actionButtonText, { color: colors.primary }]}>
                        Resume
                      </Text>
                    </TouchableOpacity>
                  )}
                  {goal.status === 'completed' && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => setGoalStatus(goal.id, 'archived')}
                    >
                      <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Archive</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No {statusFilter !== 'all' ? statusFilter : ''} goals</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {statusFilter === 'all'
                ? 'Create your first goal to start tracking progress'
                : `You don't have any ${statusFilter} goals`}
            </Text>
            {statusFilter === 'all' && (
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddModal(true)}
              >
                <Text style={styles.emptyButtonText}>Create Goal</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Goal Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setShowAddModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel new goal"
            >
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Goal</Text>
            <TouchableOpacity
              onPress={handleAddGoal}
              disabled={!newGoalName.trim() || !selectedActivityId || !newGoalMinutes}
              accessibilityRole="button"
              accessibilityLabel="Save goal"
              accessibilityState={{ disabled: !newGoalName.trim() || !selectedActivityId || !newGoalMinutes }}
            >
              <Text
                style={[
                  styles.modalSave,
                  { color: colors.primary },
                  (!newGoalName.trim() || !selectedActivityId || !newGoalMinutes) &&
                    { color: colors.textMuted },
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Goal Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g., Complete TypeScript Course"
              value={newGoalName}
              onChangeText={(value) => {
                setNewGoalName(value);
                setGoalError(null);
              }}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Goal name"
              autoFocus
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="Add details about your goal..."
              value={newGoalDescription}
              onChangeText={setNewGoalDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Goal description"
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Estimated Time (minutes)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g., 1200"
              value={newGoalMinutes}
              onChangeText={(value) => {
                setNewGoalMinutes(value);
                setGoalError(null);
              }}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Estimated time in minutes"
            />
            {Boolean(newGoalMinutes) && (
              <Text style={[styles.inputHint, { color: colors.primary }]}>
                = {formatDuration(parseInt(newGoalMinutes, 10) || 0)}
              </Text>
            )}

            <Text style={[styles.inputLabel, { color: colors.text }]}>Activity Type</Text>
            <View style={styles.activityGrid}>
              {activityTypes.map((at) => (
                <TouchableOpacity
                  key={at.id}
                  style={[
                    styles.activityOption,
                    { backgroundColor: colors.backgroundSecondary },
                    selectedActivityId === at.id && { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
                  ]}
                  onPress={() => {
                    setSelectedActivityId(at.id);
                    setGoalError(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={at.name}
                  accessibilityState={{ checked: selectedActivityId === at.id }}
                >
                  <View style={[styles.activityDot, { backgroundColor: at.color }]} />
                  <Text
                    style={[
                      styles.activityName,
                      { color: colors.text },
                      selectedActivityId === at.id && styles.activityNameSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {at.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Priority</Text>
            <View style={styles.priorityGrid}>
              {([1, 2, 3, 4, 5] as GoalPriority[]).map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.priorityOption,
                    { backgroundColor: colors.backgroundSecondary },
                    selectedPriority === priority && {
                      borderColor: PRIORITY_COLORS[priority],
                      backgroundColor: PRIORITY_COLORS[priority] + '15',
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setSelectedPriority(priority)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${PRIORITY_LABELS[priority]} priority`}
                  accessibilityState={{ checked: selectedPriority === priority }}
                >
                  <View style={[styles.priorityOptionDot, { backgroundColor: PRIORITY_COLORS[priority] }]} />
                  <Text
                    style={[
                      styles.priorityOptionText,
                      { color: colors.text },
                      selectedPriority === priority && { fontWeight: '600' },
                    ]}
                  >
                    {PRIORITY_LABELS[priority]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {goalError && (
              <Text accessibilityLiveRegion="assertive" style={[styles.formError, { color: colors.error }]}>
                {goalError}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterRowContent: {
    paddingRight: 16,
  },
  activityFilterRow: {
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    borderRadius: 12,
    minHeight: 44,
  },
  filterText: {
    fontSize: 12,
    marginRight: 4,
  },
  filterTextActive: {
    color: '#fff',
  },
  filterCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  filterCountActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  activityFilterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    borderRadius: 12,
    minHeight: 44,
  },
  activityFilterIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  activityFilterText: {
    fontSize: 12,
    maxWidth: 80,
  },
  goalsList: {
    flex: 1,
    padding: 20,
  },
  goalCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  goalInfo: {
    flex: 1,
  },
  goalName: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalActivity: {
    fontSize: 12,
  },
  goalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    flexWrap: 'wrap',
    gap: 6,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  goalDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 12,
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  predictionSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  predictionLabel: {
    fontSize: 12,
  },
  predictionValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  goalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  predictionDate: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  predictionCapacity: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  predictionReason: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  forecastNotice: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
  },
  forecastNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  forecastNoticeText: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  formError: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCancel: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    marginTop: 4,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  activityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  activityName: {
    fontSize: 14,
  },
  activityNameSelected: {
    fontWeight: '600',
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  priorityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  priorityOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  priorityOptionText: {
    fontSize: 14,
  },
});
