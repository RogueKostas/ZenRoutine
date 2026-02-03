import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { useRoutines, useActiveRoutine, useActivityTypes, useGoals, useAppStore } from '../store';
import { getDayName, minutesToTimeString, formatDuration } from '../core/utils/time';
import { BlockEditor, SimpleBlockList } from '../components/routine';
import type { TabScreenProps } from '../navigation/types';
import type { DayOfWeek, RoutineBlock } from '../core/types';

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function RoutineScreen({ navigation }: TabScreenProps<'Routine'>) {
  const { colors } = useTheme();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [editingBlock, setEditingBlock] = useState<RoutineBlock | undefined>(undefined);

  const routines = useRoutines();
  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
  const goals = useGoals();
  const { addRoutine, setActiveRoutine, copyDayBlocks } = useAppStore();

  const dayBlocks = activeRoutine?.blocks
    .filter((b) => b.dayOfWeek === selectedDay)
    .sort((a, b) => a.startMinutes - b.startMinutes) || [];

  const totalMinutes = dayBlocks.reduce((sum, b) => {
    const duration = b.endMinutes - b.startMinutes;
    return sum + (duration > 0 ? duration : duration + 1440);
  }, 0);

  const handleAddBlock = useCallback(() => {
    setEditingBlock(undefined);
    setShowBlockEditor(true);
  }, []);

  const handleEditBlock = useCallback((block: RoutineBlock) => {
    setEditingBlock(block);
    setShowBlockEditor(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setShowBlockEditor(false);
    setEditingBlock(undefined);
  }, []);

  const handleCopyDay = useCallback((targetDay: DayOfWeek) => {
    if (!activeRoutine) return;

    const targetBlocks = activeRoutine.blocks.filter((b) => b.dayOfWeek === targetDay);

    if (targetBlocks.length > 0) {
      Alert.alert(
        'Replace existing blocks?',
        `${getDayName(targetDay)} already has ${targetBlocks.length} block${targetBlocks.length > 1 ? 's' : ''}. This will replace them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              copyDayBlocks(activeRoutine.id, selectedDay, [targetDay]);
            },
          },
        ]
      );
    } else {
      copyDayBlocks(activeRoutine.id, selectedDay, [targetDay]);
      Alert.alert('Copied', `Blocks copied to ${getDayName(targetDay)}`);
    }
  }, [activeRoutine, selectedDay, copyDayBlocks]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Routine</Text>
        {routines.length > 1 && (
          <TouchableOpacity style={[styles.routineSelector, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.routineName, { color: colors.text }]}>{activeRoutine?.name || 'Select'}</Text>
            <Text style={[styles.dropdownIcon, { color: colors.textSecondary }]}>▼</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Day Selector */}
      <View style={[styles.daySelector, { borderBottomColor: colors.border }]}>
        {DAYS.map((day) => {
          const isSelected = day === selectedDay;
          const isToday = day === new Date().getDay();
          const hasBlocks = activeRoutine?.blocks.some((b) => b.dayOfWeek === day);
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayButton,
                isSelected ? { backgroundColor: colors.primary } : undefined,
                isToday && !isSelected ? { backgroundColor: colors.backgroundSecondary } : undefined,
              ]}
              onPress={() => setSelectedDay(day)}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: colors.textSecondary },
                  isSelected ? styles.dayTextSelected : undefined,
                ]}
              >
                {getDayName(day, true)}
              </Text>
              {hasBlocks && !isSelected && <View style={[styles.dayDot, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day Summary */}
      <View style={[styles.daySummary, { borderBottomColor: colors.border }]}>
        <Text style={[styles.dayTitle, { color: colors.text }]}>{getDayName(selectedDay)}</Text>
        <Text style={[styles.dayStats, { color: colors.textSecondary }]}>
          {dayBlocks.length} block{dayBlocks.length !== 1 ? 's' : ''} • {formatDuration(totalMinutes)} scheduled
        </Text>
      </View>

      {/* Timeline */}
      <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
        {activeRoutine ? (
          dayBlocks.length > 0 ? (
            <SimpleBlockList
              blocks={dayBlocks}
              activityTypes={activityTypes}
              goals={goals}
              onBlockPress={handleEditBlock}
            />
          ) : (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No blocks on {getDayName(selectedDay)}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Add a time block to start planning this day</Text>
              <TouchableOpacity style={[styles.addBlockButton, { backgroundColor: colors.primary }]} onPress={handleAddBlock}>
                <Text style={styles.addBlockButtonText}>+ Add Block</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={styles.noRoutine}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No routine yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Create a routine to start organizing your week</Text>
            <TouchableOpacity
              style={[styles.addBlockButton, { backgroundColor: colors.primary }]}
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
          <View style={[styles.copySection, { borderTopColor: colors.border }]}>
            <Text style={[styles.copyTitle, { color: colors.textSecondary }]}>Copy this day to...</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {DAYS.filter((d) => d !== selectedDay).map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.copyButton, { backgroundColor: colors.backgroundSecondary }]}
                  onPress={() => handleCopyDay(day)}
                >
                  <Text style={[styles.copyButtonText, { color: colors.text }]}>{getDayName(day, true)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Button */}
      {activeRoutine && (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={handleAddBlock}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Block Editor Modal */}
      {activeRoutine && (
        <BlockEditor
          visible={showBlockEditor}
          routineId={activeRoutine.id}
          block={editingBlock}
          dayOfWeek={selectedDay}
          existingBlocks={dayBlocks}
          onClose={handleCloseEditor}
          onSave={handleCloseEditor}
        />
      )}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  routineSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  routineName: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  dropdownIcon: {
    fontSize: 10,
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  dayButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: 2,
    borderRadius: borderRadius.md,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '500',
  },
  dayTextSelected: {
    color: '#fff',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.xs,
  },
  daySummary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  dayStats: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  timeline: {
    flex: 1,
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
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  addBlockButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  addBlockButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  copySection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  copyTitle: {
    fontSize: 14,
    marginBottom: spacing.md,
  },
  copyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  copyButtonText: {
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
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
