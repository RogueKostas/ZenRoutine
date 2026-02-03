import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import {
  useGoals,
  useActivityTypes,
  useActiveRoutine,
  useTrackingEntries,
} from '../store';
import { predictAllGoals } from '../core/engine/prediction';
import { formatDuration, getDayName } from '../core/utils/time';
import { PRIORITY_COLORS, PRIORITY_LABELS } from '../core/types';
import type { DayOfWeek, RoutineBlock, Goal } from '../core/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  blocks: RoutineBlock[];
  goalCompletions: Goal[];
}

export function CalendarScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [showDayModal, setShowDayModal] = useState(false);

  const goals = useGoals();
  const activityTypes = useActivityTypes();
  const activeRoutine = useActiveRoutine();
  const trackingEntries = useTrackingEntries();

  // Get predictions for all active goals
  const predictions = useMemo(() => {
    if (!activeRoutine) return [];
    return predictAllGoals(goals, activeRoutine, trackingEntries);
  }, [goals, activeRoutine, trackingEntries]);

  // Build calendar data for the current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Get first day of month and total days
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();

    // Get today's date for comparison
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    // Create array of days
    const days: CalendarDay[] = [];

    // Add days from previous month to fill first week
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const date = new Date(year, month - 1, day);
      days.push({
        date,
        dayOfMonth: day,
        isCurrentMonth: false,
        isToday: false,
        blocks: [],
        goalCompletions: [],
      });
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay() as DayOfWeek;
      const isToday = isCurrentMonth && today.getDate() === day;

      // Get blocks for this day of week
      const blocks = activeRoutine?.blocks.filter(b => b.dayOfWeek === dayOfWeek) || [];

      // Find goals predicted to complete on this date
      const dateString = date.toISOString().split('T')[0];
      const completingGoals = predictions
        .filter(p => p.predictedCompletionDate === dateString)
        .map(p => goals.find(g => g.id === p.goalId))
        .filter((g): g is Goal => g !== undefined);

      days.push({
        date,
        dayOfMonth: day,
        isCurrentMonth: true,
        isToday,
        blocks,
        goalCompletions: completingGoals,
      });
    }

    // Add days from next month to complete the grid (6 rows x 7 days = 42)
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({
        date,
        dayOfMonth: day,
        isCurrentMonth: false,
        isToday: false,
        blocks: [],
        goalCompletions: [],
      });
    }

    return days;
  }, [currentDate, activeRoutine, predictions, goals]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDayPress = (day: CalendarDay) => {
    if (day.isCurrentMonth) {
      setSelectedDay(day);
      setShowDayModal(true);
    }
  };

  const getActivityColor = (activityTypeId: string) => {
    return activityTypes.find(a => a.id === activityTypeId)?.color || '#666';
  };

  const getUniqueActivityColors = (blocks: RoutineBlock[]) => {
    const uniqueIds = [...new Set(blocks.map(b => b.activityTypeId))];
    return uniqueIds.slice(0, 4).map(id => getActivityColor(id));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Calendar</Text>
        <TouchableOpacity onPress={handleToday}>
          <Text style={[styles.todayButton, { color: colors.primary }]}>Today</Text>
        </TouchableOpacity>
      </View>

      {/* Month Navigation */}
      <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
          <Text style={[styles.navButtonText, { color: colors.primary }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.monthTitle, { color: colors.text }]}>
          {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
        </Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
          <Text style={[styles.navButtonText, { color: colors.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Day Labels */}
        <View style={styles.dayLabels}>
          {DAY_LABELS.map(day => (
            <View key={day} style={styles.dayLabelCell}>
              <Text style={[styles.dayLabelText, { color: colors.textSecondary }]}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarGrid}>
          {Array.from({ length: 6 }, (_, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                const activityColors = getUniqueActivityColors(day.blocks);
                const hasGoalCompletion = day.goalCompletions.length > 0;

                return (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[
                      styles.dayCell,
                      { borderColor: colors.border },
                      day.isToday && { borderColor: colors.primary, borderWidth: 2 },
                      !day.isCurrentMonth && { opacity: 0.3 },
                    ]}
                    onPress={() => handleDayPress(day)}
                    disabled={!day.isCurrentMonth}
                  >
                    <Text style={[
                      styles.dayNumber,
                      { color: colors.text },
                      day.isToday && { color: colors.primary, fontWeight: 'bold' },
                    ]}>
                      {day.dayOfMonth}
                    </Text>

                    {/* Activity indicators */}
                    {activityColors.length > 0 && (
                      <View style={styles.activityIndicators}>
                        {activityColors.map((color, i) => (
                          <View key={i} style={[styles.activityDot, { backgroundColor: color }]} />
                        ))}
                      </View>
                    )}

                    {/* Goal completion indicator */}
                    {hasGoalCompletion && (
                      <View style={[styles.goalIndicator, { backgroundColor: colors.success }]}>
                        <Text style={styles.goalIndicatorText}>🎯</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* Legend */}
        <View style={[styles.legendSection, { borderTopColor: colors.border }]}>
          <Text style={[styles.legendTitle, { color: colors.text }]}>Legend</Text>

          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.legendText, { color: colors.textSecondary }]}>Goal predicted to complete</Text>
          </View>

          {activityTypes.slice(0, 6).map(at => (
            <View key={at.id} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: at.color }]} />
              <Text style={[styles.legendText, { color: colors.textSecondary }]} numberOfLines={1}>
                {at.icon} {at.name}
              </Text>
            </View>
          ))}
        </View>

        {/* Upcoming Goal Completions */}
        {predictions.filter(p => p.predictedCompletionDate).length > 0 && (
          <View style={[styles.predictionsSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Predicted Goal Completions</Text>
            {predictions
              .filter(p => p.predictedCompletionDate)
              .sort((a, b) => (a.predictedCompletionDate || '').localeCompare(b.predictedCompletionDate || ''))
              .slice(0, 5)
              .map(prediction => {
                const goal = goals.find(g => g.id === prediction.goalId);
                const activity = activityTypes.find(a => a.id === goal?.activityTypeId);
                if (!goal) return null;

                return (
                  <View
                    key={prediction.goalId}
                    style={[styles.predictionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[styles.predictionIcon, { backgroundColor: (activity?.color || '#666') + '20' }]}>
                      <Text style={styles.predictionEmoji}>{activity?.icon || '📌'}</Text>
                    </View>
                    <View style={styles.predictionInfo}>
                      <Text style={[styles.predictionName, { color: colors.text }]}>{goal.name}</Text>
                      <Text style={[styles.predictionDate, { color: colors.textSecondary }]}>
                        {formatPredictionDate(prediction.predictedCompletionDate!)}
                      </Text>
                    </View>
                    <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(prediction.confidenceLevel) + '20' }]}>
                      <Text style={[styles.confidenceText, { color: getConfidenceColor(prediction.confidenceLevel) }]}>
                        {prediction.confidenceLevel}
                      </Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Day Detail Modal */}
      <Modal
        visible={showDayModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDayModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowDayModal(false)}>
              <Text style={[styles.modalClose, { color: colors.textSecondary }]}>Close</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {selectedDay && formatDayTitle(selectedDay.date)}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedDay && (
              <>
                {/* Scheduled Blocks */}
                <Text style={[styles.modalSectionTitle, { color: colors.text }]}>
                  Scheduled Activities
                </Text>
                {selectedDay.blocks.length > 0 ? (
                  selectedDay.blocks
                    .sort((a, b) => a.startMinutes - b.startMinutes)
                    .map(block => {
                      const activity = activityTypes.find(a => a.id === block.activityTypeId);
                      const goal = block.goalId ? goals.find(g => g.id === block.goalId) : null;
                      const duration = block.endMinutes - block.startMinutes;
                      const adjustedDuration = duration > 0 ? duration : duration + 1440;

                      return (
                        <View
                          key={block.id}
                          style={[styles.blockCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        >
                          <View style={[styles.blockColor, { backgroundColor: activity?.color || '#666' }]} />
                          <View style={styles.blockInfo}>
                            <Text style={[styles.blockTime, { color: colors.textSecondary }]}>
                              {formatTime(block.startMinutes)} - {formatTime(block.endMinutes)}
                            </Text>
                            <Text style={[styles.blockActivity, { color: colors.text }]}>
                              {activity?.icon} {activity?.name}
                            </Text>
                            {goal && (
                              <Text style={[styles.blockGoal, { color: colors.primary }]}>
                                Goal: {goal.name}
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.blockDuration, { color: colors.textSecondary }]}>
                            {formatDuration(adjustedDuration)}
                          </Text>
                        </View>
                      );
                    })
                ) : (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No activities scheduled
                  </Text>
                )}

                {/* Goal Completions */}
                {selectedDay.goalCompletions.length > 0 && (
                  <>
                    <Text style={[styles.modalSectionTitle, { color: colors.text, marginTop: spacing.lg }]}>
                      Goals Predicted to Complete
                    </Text>
                    {selectedDay.goalCompletions.map(goal => {
                      const activity = activityTypes.find(a => a.id === goal.activityTypeId);
                      return (
                        <View
                          key={goal.id}
                          style={[styles.goalCard, { backgroundColor: colors.success + '10', borderColor: colors.success }]}
                        >
                          <Text style={styles.goalEmoji}>🎯</Text>
                          <View style={styles.goalInfo}>
                            <Text style={[styles.goalName, { color: colors.text }]}>{goal.name}</Text>
                            <Text style={[styles.goalActivity, { color: colors.textSecondary }]}>
                              {activity?.icon} {activity?.name}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
}

function formatDayTitle(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${days[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function formatPredictionDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateString === today.toISOString().split('T')[0]) {
    return 'Today';
  }
  if (dateString === tomorrow.toISOString().split('T')[0]) {
    return 'Tomorrow';
  }

  const daysUntil = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 7) {
    return `In ${daysUntil} days`;
  }

  return `${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
}

function getConfidenceColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'high': return '#43A047';
    case 'medium': return '#FB8C00';
    case 'low': return '#78909C';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  todayButton: {
    fontSize: 16,
    fontWeight: '500',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  navButton: {
    padding: spacing.sm,
  },
  navButtonText: {
    fontSize: 28,
    fontWeight: '300',
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  dayLabels: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dayLabelCell: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  calendarGrid: {
    paddingHorizontal: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.xs,
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '500',
  },
  activityIndicators: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  goalIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalIndicatorText: {
    fontSize: 8,
  },
  legendSection: {
    padding: spacing.lg,
    borderTopWidth: 1,
    marginTop: spacing.md,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  legendText: {
    fontSize: 14,
    flex: 1,
  },
  predictionsSection: {
    padding: spacing.lg,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  predictionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  predictionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  predictionEmoji: {
    fontSize: 20,
  },
  predictionInfo: {
    flex: 1,
  },
  predictionName: {
    fontSize: 14,
    fontWeight: '500',
  },
  predictionDate: {
    fontSize: 12,
    marginTop: 2,
  },
  confidenceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalClose: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    padding: spacing.lg,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  blockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  blockColor: {
    width: 4,
    height: '100%',
  },
  blockInfo: {
    flex: 1,
    padding: spacing.md,
  },
  blockTime: {
    fontSize: 12,
    marginBottom: 2,
  },
  blockActivity: {
    fontSize: 14,
    fontWeight: '500',
  },
  blockGoal: {
    fontSize: 12,
    marginTop: 2,
  },
  blockDuration: {
    fontSize: 12,
    paddingRight: spacing.md,
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  goalEmoji: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  goalInfo: {
    flex: 1,
  },
  goalName: {
    fontSize: 14,
    fontWeight: '500',
  },
  goalActivity: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
