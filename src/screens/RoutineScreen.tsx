import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing, borderRadius } from '../theme/spacing';
import { useRoutines, useActiveRoutine, useActivityTypes, useAppStore } from '../store';
import { getDayName, minutesToTimeString, formatDuration } from '../core/utils/time';
import { BlockEditor, SimpleBlockList } from '../components/routine';
import type { TabScreenProps } from '../navigation/types';
import type { DayOfWeek, RoutineBlock } from '../core/types';

const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function RoutineScreen({ navigation }: TabScreenProps<'Routine'>) {
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [editingBlock, setEditingBlock] = useState<RoutineBlock | undefined>(undefined);

  const routines = useRoutines();
  const activeRoutine = useActiveRoutine();
  const activityTypes = useActivityTypes();
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
                isSelected ? styles.dayButtonSelected : undefined,
                isToday && !isSelected ? styles.dayButtonToday : undefined,
              ]}
              onPress={() => setSelectedDay(day)}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected ? styles.dayTextSelected : undefined,
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
              onBlockPress={handleEditBlock}
            />
          ) : (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>No blocks on {getDayName(selectedDay)}</Text>
              <Text style={styles.emptySubtitle}>Add a time block to start planning this day</Text>
              <TouchableOpacity style={styles.addBlockButton} onPress={handleAddBlock}>
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
                <TouchableOpacity
                  key={day}
                  style={styles.copyButton}
                  onPress={() => handleCopyDay(day)}
                >
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
        <TouchableOpacity style={styles.fab} onPress={handleAddBlock}>
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
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  routineSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
  },
  routineName: {
    fontSize: 14,
    color: colors.text,
    marginRight: spacing.xs,
  },
  dropdownIcon: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: 2,
    borderRadius: borderRadius.md,
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
    marginTop: spacing.xs,
  },
  daySummary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  addBlockButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
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
    borderTopColor: colors.border,
  },
  copyTitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  copyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
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
