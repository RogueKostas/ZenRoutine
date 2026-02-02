import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useRoutines, useActiveRoutine, useActivityTypes, useAppStore } from '../store';
import { getDayName, minutesToTimeString, formatDuration } from '../core/utils/time';
import type { TabScreenProps } from '../navigation/types';
import type { DayOfWeek } from '../core/types';

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function RoutineScreen({ navigation }: TabScreenProps<'Routine'>) {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);
  const routines = useRoutines();
  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
  const { addRoutine, setActiveRoutine } = useAppStore();

  const dayBlocks = activeRoutine?.blocks
    .filter((b) => b.dayOfWeek === selectedDay)
    .sort((a, b) => a.startMinutes - b.startMinutes) || [];

  const totalMinutes = dayBlocks.reduce((sum, b) => {
    const duration = b.endMinutes - b.startMinutes;
    return sum + (duration > 0 ? duration : duration + 1440);
  }, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Routine</Text>
        {routines.length > 1 && (
          <TouchableOpacity style={styles.routineSelector}>
            <Text style={styles.routineName}>{activeRoutine?.name || 'Select'}</Text>
            <Text style={styles.dropdownIcon}>▼</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {DAYS.map((day) => {
          const isSelected = day === selectedDay;
          const isToday = day === new Date().getDay();
          const hasBlocks = activeRoutine?.blocks.some((b) => b.dayOfWeek === day);
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayButton,
                isSelected && styles.dayButtonSelected,
                isToday && !isSelected && styles.dayButtonToday,
              ]}
              onPress={() => setSelectedDay(day)}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {getDayName(day, true)}
              </Text>
              {hasBlocks && !isSelected && <View style={styles.dayDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day Summary */}
      <View style={styles.daySummary}>
        <Text style={styles.dayTitle}>{getDayName(selectedDay)}</Text>
        <Text style={styles.dayStats}>
          {dayBlocks.length} blocks • {formatDuration(totalMinutes)} scheduled
        </Text>
      </View>

      {/* Timeline */}
      <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
        {activeRoutine ? (
          dayBlocks.length > 0 ? (
            <View style={styles.blockList}>
              {dayBlocks.map((block, index) => {
                const activity = activityTypes.find((a) => a.id === block.activityTypeId);
                const duration = block.endMinutes - block.startMinutes;
                const adjustedDuration = duration > 0 ? duration : duration + 1440;
                return (
                  <TouchableOpacity
                    key={block.id}
                    style={styles.blockCard}
                    onPress={() => {
                      // TODO: Navigate to block editor
                    }}
                  >
                    <View style={[styles.blockColor, { backgroundColor: activity?.color || '#666' }]} />
                    <View style={styles.blockContent}>
                      <Text style={styles.blockTime}>
                        {minutesToTimeString(block.startMinutes)} - {minutesToTimeString(block.endMinutes)}
                      </Text>
                      <Text style={styles.blockActivity}>{activity?.name || 'Unknown'}</Text>
                      {block.goalId && (
                        <Text style={styles.blockGoal}>Goal linked</Text>
                      )}
                    </View>
                    <View style={styles.blockMeta}>
                      <Text style={styles.blockDuration}>{formatDuration(adjustedDuration)}</Text>
                      <Text style={styles.blockEdit}>Edit</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No blocks on {getDayName(selectedDay)}</Text>
              <Text style={styles.emptySubtitle}>Add a time block to start planning this day</Text>
              <TouchableOpacity style={styles.addBlockButton}>
                <Text style={styles.addBlockButtonText}>+ Add Block</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={styles.noRoutine}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No routine yet</Text>
            <Text style={styles.emptySubtitle}>Create a routine to start organizing your week</Text>
            <TouchableOpacity
              style={styles.addBlockButton}
              onPress={() => {
                const id = addRoutine('My Week');
                setActiveRoutine(id);
              }}
            >
              <Text style={styles.addBlockButtonText}>Create Routine</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Copy Day Actions */}
        {activeRoutine && dayBlocks.length > 0 && (
          <View style={styles.copySection}>
            <Text style={styles.copyTitle}>Copy this day to...</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {DAYS.filter((d) => d !== selectedDay).map((day) => (
                <TouchableOpacity key={day} style={styles.copyButton}>
                  <Text style={styles.copyButtonText}>{getDayName(day, true)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Button */}
      {activeRoutine && (
        <TouchableOpacity style={styles.fab}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
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
  routineSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
  },
  routineName: {
    fontSize: 14,
    color: colors.text,
    marginRight: 4,
  },
  dropdownIcon: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonToday: {
    backgroundColor: colors.backgroundSecondary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  dayTextSelected: {
    color: '#fff',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  daySummary: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  dayStats: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  timeline: {
    flex: 1,
  },
  blockList: {
    padding: 20,
  },
  blockCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  blockColor: {
    width: 4,
  },
  blockContent: {
    flex: 1,
    padding: 16,
  },
  blockTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  blockActivity: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  blockGoal: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 4,
  },
  blockMeta: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  blockDuration: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  blockEdit: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  emptyDay: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  noRoutine: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
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
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  addBlockButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  addBlockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  copySection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  copyTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  copyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 6,
    marginRight: 8,
  },
  copyButtonText: {
    fontSize: 14,
    color: colors.text,
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
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
