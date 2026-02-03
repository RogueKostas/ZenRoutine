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
import type { GoalStatus } from '../core/types';

type FilterStatus = 'all' | GoalStatus;

export function GoalsScreen({ navigation }: TabScreenProps<'Goals'>) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalMinutes, setNewGoalMinutes] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const activeRoutine = useActiveRoutine();
  const { addGoal, setGoalStatus, deleteGoal, trackingEntries } = useAppStore();

  const filteredGoals = filter === 'all'
    ? goals
    : goals.filter((g) => g.status === filter);

  const predictions = activeRoutine
    ? predictAllGoals(goals, activeRoutine, trackingEntries)
    : [];

  const handleAddGoal = () => {
    if (!newGoalName.trim() || !selectedActivityId || !newGoalMinutes) return;

    addGoal({
      name: newGoalName.trim(),
      description: newGoalDescription.trim(),
      estimatedMinutes: parseInt(newGoalMinutes, 10),
      activityTypeId: selectedActivityId,
    });

    setNewGoalName('');
    setNewGoalMinutes('');
    setNewGoalDescription('');
    setSelectedActivityId(null);
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
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        style={[styles.filterContainer, { borderBottomColor: colors.border }]}
        showsHorizontalScrollIndicator={false}
      >
        {(['all', 'active', 'completed', 'paused', 'archived'] as FilterStatus[]).map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterTab,
              { backgroundColor: colors.backgroundSecondary },
              filter === status && { backgroundColor: colors.primary },
            ]}
            onPress={() => setFilter(status)}
          >
            <Text style={[
              styles.filterText,
              { color: colors.textSecondary },
              filter === status && styles.filterTextActive,
            ]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
            <Text style={[
              styles.filterCount,
              { color: colors.textMuted },
              filter === status && styles.filterCountActive,
            ]}>
              {counts[status]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Goals List */}
      <ScrollView style={styles.goalsList} showsVerticalScrollIndicator={false}>
        {filteredGoals.length > 0 ? (
          filteredGoals.map((goal) => {
            const activity = activityTypes.find((a) => a.id === goal.activityTypeId);
            const prediction = predictions.find((p) => p.goalId === goal.id);
            const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);

            return (
              <TouchableOpacity
                key={goal.id}
                style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.goalHeader}>
                  <View style={[styles.goalColor, { backgroundColor: activity?.color || '#666' }]} />
                  <View style={styles.goalInfo}>
                    <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
                    <Text style={[styles.goalActivity, { color: colors.textSecondary }]}>{activity?.name}</Text>
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
                    <Text style={[styles.predictionLabel, { color: colors.textSecondary }]}>Estimated completion:</Text>
                    <Text style={[styles.predictionValue, { color: colors.primary }]}>
                      {prediction.predictedCompletionDate || 'Add routine blocks'}
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
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No {filter !== 'all' ? filter : ''} goals</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? 'Create your first goal to start tracking progress'
                : `You don't have any ${filter} goals`}
            </Text>
            {filter === 'all' && (
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
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Goal</Text>
            <TouchableOpacity
              onPress={handleAddGoal}
              disabled={!newGoalName.trim() || !selectedActivityId || !newGoalMinutes}
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
              onChangeText={setNewGoalName}
              placeholderTextColor={colors.textMuted}
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
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Estimated Time (minutes)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholder="e.g., 1200"
              value={newGoalMinutes}
              onChangeText={setNewGoalMinutes}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            {newGoalMinutes && (
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
                  onPress={() => setSelectedActivityId(at.id)}
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
  filterContainer: {
    paddingHorizontal: 16,
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
    marginTop: 2,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    marginBottom: 12,
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
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
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
});
