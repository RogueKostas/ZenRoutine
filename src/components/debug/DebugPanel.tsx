import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import {
  useAppStore,
  useActivityTypes,
  useGoals,
  useRoutines,
  useActiveRoutine,
  useCurrentTracking,
} from '../../store';
import { predictAllGoals, PredictionResult } from '../../core/engine/prediction';
import { formatDuration, minutesToTimeString, getDayName } from '../../core/utils/time';
import { colors } from '../../theme/colors';
import { DayOfWeek } from '../../core/types';

export function DebugPanel() {
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalMinutes, setNewGoalMinutes] = useState('60');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);

  const activityTypes = useActivityTypes();
  const goals = useGoals();
  const routines = useRoutines();
  const activeRoutine = useActiveRoutine();
  const currentTracking = useCurrentTracking();

  const {
    addGoal,
    deleteGoal,
    addRoutine,
    setActiveRoutine,
    addRoutineBlock,
    deleteRoutineBlock,
    startTracking,
    stopTracking,
    resetState,
    _addSampleData,
    initializeDefaults,
    trackingEntries,
  } = useAppStore();

  // Calculate predictions when goals or routine changes
  useEffect(() => {
    if (activeRoutine && goals.length > 0) {
      const results = predictAllGoals(goals, activeRoutine, trackingEntries);
      setPredictions(results);
    } else {
      setPredictions([]);
    }
  }, [goals, activeRoutine, trackingEntries]);

  // Initialize defaults on mount
  useEffect(() => {
    initializeDefaults();
  }, []);

  const handleAddGoal = () => {
    if (!newGoalName.trim() || !selectedActivityId) {
      Alert.alert('Error', 'Please enter a goal name and select an activity type');
      return;
    }
    const minutes = parseInt(newGoalMinutes, 10) || 60;
    addGoal({
      name: newGoalName.trim(),
      description: '',
      estimatedMinutes: minutes,
      activityTypeId: selectedActivityId,
    });
    setNewGoalName('');
    setNewGoalMinutes('60');
  };

  const handleAddBlock = () => {
    if (!activeRoutine || !selectedActivityId) {
      Alert.alert('Error', 'Please select a routine and activity type');
      return;
    }
    const now = new Date();
    const dayOfWeek = now.getDay() as DayOfWeek;
    addRoutineBlock(activeRoutine.id, {
      dayOfWeek,
      startMinutes: 540, // 9:00 AM
      endMinutes: 600,   // 10:00 AM
      activityTypeId: selectedActivityId,
    });
  };

  const handleStartTracking = () => {
    if (!selectedActivityId) {
      Alert.alert('Error', 'Please select an activity type');
      return;
    }
    startTracking({
      activityTypeId: selectedActivityId,
      source: 'manual',
    });
  };

  const handleReset = () => {
    Alert.alert(
      'Reset All Data',
      'This will delete all your data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: resetState },
      ]
    );
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return renderOverview();
      case 'activities':
        return renderActivities();
      case 'goals':
        return renderGoals();
      case 'routines':
        return renderRoutines();
      case 'tracking':
        return renderTracking();
      case 'predictions':
        return renderPredictions();
      default:
        return renderOverview();
    }
  };

  const renderOverview = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>State Overview</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activityTypes.length}</Text>
          <Text style={styles.statLabel}>Activity Types</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{goals.length}</Text>
          <Text style={styles.statLabel}>Goals</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{routines.length}</Text>
          <Text style={styles.statLabel}>Routines</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{trackingEntries.length}</Text>
          <Text style={styles.statLabel}>Entries</Text>
        </View>
      </View>

      {currentTracking && (
        <View style={styles.activeTrackingCard}>
          <Text style={styles.activeTrackingTitle}>Currently Tracking</Text>
          <Text style={styles.activeTrackingActivity}>
            {activityTypes.find((a) => a.id === currentTracking.activityTypeId)?.name}
          </Text>
          <Text style={styles.activeTrackingTime}>
            Started: {new Date(currentTracking.startTime).toLocaleTimeString()}
          </Text>
          <TouchableOpacity style={styles.stopButton} onPress={() => stopTracking()}>
            <Text style={styles.stopButtonText}>Stop Tracking</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton} onPress={_addSampleData}>
          <Text style={styles.actionButtonText}>Load Sample Data</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.dangerButton]} onPress={handleReset}>
          <Text style={styles.actionButtonText}>Reset All</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderActivities = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Activity Types ({activityTypes.length})</Text>
      <Text style={styles.hint}>Tap to select for goal/block creation</Text>
      <ScrollView style={styles.list}>
        {activityTypes.map((at) => (
          <TouchableOpacity
            key={at.id}
            style={[
              styles.listItem,
              selectedActivityId === at.id && styles.selectedItem,
            ]}
            onPress={() => setSelectedActivityId(at.id)}
          >
            <View style={[styles.colorDot, { backgroundColor: at.color }]} />
            <View style={styles.listItemContent}>
              <Text style={styles.listItemTitle}>{at.name}</Text>
              <Text style={styles.listItemSubtitle}>
                {at.icon} | {at.isDefault ? 'Default' : 'Custom'}
              </Text>
            </View>
            {selectedActivityId === at.id && (
              <Text style={styles.selectedIndicator}>Selected</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderGoals = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Goals ({goals.length})</Text>

      <View style={styles.addForm}>
        <TextInput
          style={styles.input}
          placeholder="Goal name"
          value={newGoalName}
          onChangeText={setNewGoalName}
          placeholderTextColor={colors.textMuted}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputSmall]}
            placeholder="Minutes"
            value={newGoalMinutes}
            onChangeText={setNewGoalMinutes}
            keyboardType="numeric"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.addButton, !selectedActivityId && styles.disabledButton]}
            onPress={handleAddGoal}
            disabled={!selectedActivityId}
          >
            <Text style={styles.addButtonText}>Add Goal</Text>
          </TouchableOpacity>
        </View>
        {!selectedActivityId && (
          <Text style={styles.warning}>Select an activity type first</Text>
        )}
      </View>

      <ScrollView style={styles.list}>
        {goals.map((goal) => {
          const activity = activityTypes.find((a) => a.id === goal.activityTypeId);
          const progress = Math.min(100, (goal.loggedMinutes / goal.estimatedMinutes) * 100);
          return (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View style={[styles.colorDot, { backgroundColor: activity?.color || '#666' }]} />
                <Text style={styles.goalName}>{goal.name}</Text>
                <TouchableOpacity onPress={() => deleteGoal(goal.id)}>
                  <Text style={styles.deleteButton}>Delete</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.goalProgress}>
                {formatDuration(goal.loggedMinutes)} / {formatDuration(goal.estimatedMinutes)} ({progress.toFixed(0)}%)
              </Text>
              <Text style={styles.goalStatus}>Status: {goal.status}</Text>
            </View>
          );
        })}
        {goals.length === 0 && (
          <Text style={styles.emptyText}>No goals yet. Add one above!</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderRoutines = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Routines ({routines.length})</Text>

      <View style={styles.addForm}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => addRoutine('New Routine')}
        >
          <Text style={styles.addButtonText}>Add Routine</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {routines.map((routine) => (
          <View key={routine.id} style={styles.routineCard}>
            <View style={styles.routineHeader}>
              <Text style={styles.routineName}>{routine.name}</Text>
              <TouchableOpacity
                style={[
                  styles.activeToggle,
                  routine.isActive && styles.activeToggleOn,
                ]}
                onPress={() => setActiveRoutine(routine.id)}
              >
                <Text style={styles.activeToggleText}>
                  {routine.isActive ? 'Active' : 'Activate'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.blockCount}>{routine.blocks.length} blocks</Text>

            {routine.blocks.slice(0, 5).map((block) => {
              const activity = activityTypes.find((a) => a.id === block.activityTypeId);
              return (
                <View key={block.id} style={styles.blockItem}>
                  <View style={[styles.colorDot, { backgroundColor: activity?.color || '#666' }]} />
                  <Text style={styles.blockText}>
                    {getDayName(block.dayOfWeek, true)} {minutesToTimeString(block.startMinutes)}-{minutesToTimeString(block.endMinutes)}
                  </Text>
                  <TouchableOpacity onPress={() => deleteRoutineBlock(routine.id, block.id)}>
                    <Text style={styles.deleteButton}>X</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {routine.blocks.length > 5 && (
              <Text style={styles.moreBlocks}>... and {routine.blocks.length - 5} more blocks</Text>
            )}
          </View>
        ))}
      </ScrollView>

      {activeRoutine && selectedActivityId && (
        <TouchableOpacity style={styles.floatingButton} onPress={handleAddBlock}>
          <Text style={styles.floatingButtonText}>+ Add Block</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderTracking = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Tracking</Text>

      {currentTracking ? (
        <View style={styles.activeTrackingCard}>
          <Text style={styles.activeTrackingTitle}>Currently Tracking</Text>
          <Text style={styles.activeTrackingActivity}>
            {activityTypes.find((a) => a.id === currentTracking.activityTypeId)?.name}
          </Text>
          <Text style={styles.activeTrackingTime}>
            Started: {new Date(currentTracking.startTime).toLocaleTimeString()}
          </Text>
          <TouchableOpacity style={styles.stopButton} onPress={() => stopTracking()}>
            <Text style={styles.stopButtonText}>Stop Tracking</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.startTrackingSection}>
          {selectedActivityId ? (
            <TouchableOpacity style={styles.startButton} onPress={handleStartTracking}>
              <Text style={styles.startButtonText}>
                Start Tracking: {activityTypes.find((a) => a.id === selectedActivityId)?.name}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>Select an activity type in the Activities tab to start tracking</Text>
          )}
        </View>
      )}

      <Text style={styles.subsectionTitle}>Recent Entries ({trackingEntries.length})</Text>
      <ScrollView style={styles.list}>
        {trackingEntries.slice(-10).reverse().map((entry) => {
          const activity = activityTypes.find((a) => a.id === entry.activityTypeId);
          const duration = entry.endTime
            ? Math.round((new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000)
            : null;
          return (
            <View key={entry.id} style={styles.entryCard}>
              <View style={[styles.colorDot, { backgroundColor: activity?.color || '#666' }]} />
              <View style={styles.entryContent}>
                <Text style={styles.entryActivity}>{activity?.name}</Text>
                <Text style={styles.entryTime}>
                  {entry.date} | {new Date(entry.startTime).toLocaleTimeString()}
                  {entry.endTime ? ` - ${new Date(entry.endTime).toLocaleTimeString()}` : ' (active)'}
                </Text>
                {duration !== null && (
                  <Text style={styles.entryDuration}>{formatDuration(duration)}</Text>
                )}
              </View>
            </View>
          );
        })}
        {trackingEntries.length === 0 && (
          <Text style={styles.emptyText}>No tracking entries yet.</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderPredictions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Goal Predictions</Text>

      {!activeRoutine ? (
        <Text style={styles.warning}>Set an active routine to see predictions</Text>
      ) : predictions.length === 0 ? (
        <Text style={styles.emptyText}>No active goals to predict</Text>
      ) : (
        <ScrollView style={styles.list}>
          {predictions.map((pred) => {
            const goal = goals.find((g) => g.id === pred.goalId);
            const activity = activityTypes.find((a) => a.id === goal?.activityTypeId);
            return (
              <View key={pred.goalId} style={styles.predictionCard}>
                <View style={styles.predictionHeader}>
                  <View style={[styles.colorDot, { backgroundColor: activity?.color || '#666' }]} />
                  <Text style={styles.predictionGoal}>{goal?.name}</Text>
                </View>
                <View style={styles.predictionDetails}>
                  <View style={styles.predictionRow}>
                    <Text style={styles.predictionLabel}>Weekly allocation:</Text>
                    <Text style={styles.predictionValue}>
                      {formatDuration(pred.weeklyMinutesAllocated)}
                    </Text>
                  </View>
                  <View style={styles.predictionRow}>
                    <Text style={styles.predictionLabel}>Remaining:</Text>
                    <Text style={styles.predictionValue}>
                      {formatDuration(pred.remainingMinutes)}
                    </Text>
                  </View>
                  <View style={styles.predictionRow}>
                    <Text style={styles.predictionLabel}>Weeks remaining:</Text>
                    <Text style={styles.predictionValue}>
                      {pred.weeksRemaining !== null ? pred.weeksRemaining.toFixed(1) : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.predictionRow}>
                    <Text style={styles.predictionLabel}>Predicted completion:</Text>
                    <Text style={[styles.predictionValue, styles.predictionDate]}>
                      {pred.predictedCompletionDate || 'No time allocated'}
                    </Text>
                  </View>
                  <View style={styles.confidenceBadge}>
                    <Text style={[
                      styles.confidenceText,
                      pred.confidenceLevel === 'high' && styles.confidenceHigh,
                      pred.confidenceLevel === 'medium' && styles.confidenceMedium,
                      pred.confidenceLevel === 'low' && styles.confidenceLow,
                    ]}>
                      Confidence: {pred.confidenceLevel}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Panel</Text>

      <ScrollView horizontal style={styles.tabs} showsHorizontalScrollIndicator={false}>
        {['overview', 'activities', 'goals', 'routines', 'tracking', 'predictions'].map((section) => (
          <TouchableOpacity
            key={section}
            style={[styles.tab, activeSection === section && styles.activeTab]}
            onPress={() => setActiveSection(section)}
          >
            <Text style={[styles.tabText, activeSection === section && styles.activeTabText]}>
              {section.charAt(0).toUpperCase() + section.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderSection()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    padding: 16,
    paddingBottom: 8,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 4,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
  },
  warning: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 8,
    marginRight: '4%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  list: {
    maxHeight: 400,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedItem: {
    borderColor: colors.primary,
    backgroundColor: colors.backgroundSecondary,
  },
  listItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  listItemSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectedIndicator: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  addForm: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputSmall: {
    flex: 1,
    marginRight: 8,
    marginBottom: 0,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: colors.textMuted,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  goalCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  goalName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  deleteButton: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  progressContainer: {
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  goalProgress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  goalStatus: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  routineCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  routineName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  activeToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.borderLight,
  },
  activeToggleOn: {
    backgroundColor: colors.success,
  },
  activeToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  blockCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  blockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  blockText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  moreBlocks: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  floatingButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  activeTrackingCard: {
    backgroundColor: colors.success + '20',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.success,
  },
  activeTrackingTitle: {
    fontSize: 14,
    color: colors.success,
    fontWeight: '600',
    marginBottom: 4,
  },
  activeTrackingActivity: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  activeTrackingTime: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  stopButton: {
    backgroundColor: colors.error,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  startTrackingSection: {
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  entryContent: {
    flex: 1,
    marginLeft: 12,
  },
  entryActivity: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  entryTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  entryDuration: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  predictionCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  predictionGoal: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  predictionDetails: {
    marginLeft: 20,
  },
  predictionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  predictionLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  predictionValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  predictionDate: {
    color: colors.primary,
  },
  confidenceBadge: {
    marginTop: 8,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  confidenceHigh: {
    color: colors.success,
  },
  confidenceMedium: {
    color: colors.warning,
  },
  confidenceLow: {
    color: colors.error,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
  },
  dangerButton: {
    backgroundColor: colors.error,
    marginRight: 0,
    marginLeft: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
