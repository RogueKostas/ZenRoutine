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
import { colors } from '../theme/colors';
import { useGoals, useActivityTypes, useActiveRoutine, useAppStore } from '../store';
import { predictAllGoals } from '../core/engine/prediction';
import { formatDuration } from '../core/utils/time';
import type { TabScreenProps } from '../navigation/types';
import type { GoalStatus } from '../core/types';

type FilterStatus = 'all' | GoalStatus;

export function GoalsScreen({ navigation }: TabScreenProps<'Goals'>) {
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Goals</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        style={styles.filterContainer}
        showsHorizontalScrollIndicator={false}
      >
        {(['all', 'active', 'completed', 'paused', 'archived'] as FilterStatus[]).map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterTab, filter === status && styles.filterTabActive]}
            onPress={() => setFilter(status)}
          >
            <Text style={[styles.filterText, filter === status && styles.filterTextActive]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
            <Text style={[styles.filterCount, filter === status && styles.filterCountActive]}>
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
              <TouchableOpacity key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <View style={[styles.goalColor, { backgroundColor: activity?.color || '#666' }]} />
                  <View style={styles.goalInfo}>
                    <Text style={styles.goalName}>{goal.name}</Text>
                    <Text style={styles.goalActivity}>{activity?.name}</Text>
                  </View>
                  <View style={[styles.statusBadge, styles[`status_${goal.status}`]]}>
                    <Text style={styles.statusText}>{goal.status}</Text>
                  </View>
                </View>

                {goal.description ? (
                  <Text style={styles.goalDescription} numberOfLines={2}>
                    {goal.description}
                  </Text>
                ) : null}

                <View style={styles.progressSection}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <View style={styles.progressStats}>
                    <Text style={styles.progressText}>
                      {formatDuration(goal.loggedMinutes)} / {formatDuration(goal.estimatedMinutes)}
                    </Text>
                    <Text style={styles.progressPercent}>{progress.toFixed(0)}%</Text>
                  </View>
                </View>

                {prediction && goal.status === 'active' && (
                  <View style={styles.predictionSection}>
                    <Text style={styles.predictionLabel}>Estimated completion:</Text>
                    <Text style={styles.predictionValue}>
                      {prediction.predictedCompletionDate || 'Add routine blocks'}
                    </Text>
                  </View>
                )}

                <View style={styles.goalActions}>
                  {goal.status === 'active' && (
                    <>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => setGoalStatus(goal.id, 'paused')}
                      >
                        <Text style={styles.actionButtonText}>Pause</Text>
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
                      <Text style={styles.actionButtonText}>Archive</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎯</Text>
            <Text style={styles.emptyTitle}>No {filter !== 'all' ? filter : ''} goals</Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'all'
                ? 'Create your first goal to start tracking progress'
                : `You don't have any ${filter} goals`}
            </Text>
            {filter === 'all' && (
              <TouchableOpacity
                style={styles.emptyButton}
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Goal</Text>
            <TouchableOpacity
              onPress={handleAddGoal}
              disabled={!newGoalName.trim() || !selectedActivityId || !newGoalMinutes}
            >
              <Text
                style={[
                  styles.modalSave,
                  (!newGoalName.trim() || !selectedActivityId || !newGoalMinutes) &&
                    styles.modalSaveDisabled,
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.inputLabel}>Goal Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Complete TypeScript Course"
              value={newGoalName}
              onChangeText={setNewGoalName}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Add details about your goal..."
              value={newGoalDescription}
              onChangeText={setNewGoalDescription}
              multiline
              numberOfLines={3}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Estimated Time (minutes)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 1200"
              value={newGoalMinutes}
              onChangeText={setNewGoalMinutes}
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
            />
            {newGoalMinutes && (
              <Text style={styles.inputHint}>
                = {formatDuration(parseInt(newGoalMinutes, 10) || 0)}
              </Text>
            )}

            <Text style={styles.inputLabel}>Activity Type</Text>
            <View style={styles.activityGrid}>
              {activityTypes.map((at) => (
                <TouchableOpacity
                  key={at.id}
                  style={[
                    styles.activityOption,
                    selectedActivityId === at.id && styles.activityOptionSelected,
                  ]}
                  onPress={() => setSelectedActivityId(at.id)}
                >
                  <View style={[styles.activityDot, { backgroundColor: at.color }]} />
                  <Text
                    style={[
                      styles.activityName,
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
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
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
    borderBottomColor: colors.border,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 6,
  },
  filterTextActive: {
    color: '#fff',
  },
  filterCount: {
    fontSize: 12,
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  goalActivity: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  status_active: {
    backgroundColor: colors.success + '20',
  },
  status_completed: {
    backgroundColor: colors.primary + '20',
  },
  status_paused: {
    backgroundColor: colors.warning + '20',
  },
  status_archived: {
    backgroundColor: colors.textMuted + '20',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colors.text,
  },
  goalDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  progressPercent: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  predictionSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginBottom: 12,
  },
  predictionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  predictionValue: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  goalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 12,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
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
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCancel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalSave: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  modalSaveDisabled: {
    color: colors.textMuted,
  },
  modalContent: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    color: colors.primary,
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
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activityOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  activityName: {
    fontSize: 14,
    color: colors.text,
  },
  activityNameSelected: {
    fontWeight: '600',
  },
});
