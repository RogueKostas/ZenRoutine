import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  ActivityType,
  Goal,
  GoalStatus,
  Routine,
  RoutineBlock,
  TrackingEntry,
  TrackingSource,
  DayOfWeek,
} from '../core/types';
import { generateId } from '../core/utils/id';
import { createDefaultActivityTypes } from '../core/engine/defaults';

// Schema version for migrations
const CURRENT_SCHEMA_VERSION = 1;

// Initial state factory
const createInitialState = (): AppState => ({
  activityTypes: createDefaultActivityTypes(),
  goals: [],
  routines: [],
  trackingEntries: [],
  activeRoutineId: null,
  currentTrackingEntryId: null,
  lastSyncedAt: undefined,
  schemaVersion: CURRENT_SCHEMA_VERSION,
});

// Action types
interface AppActions {
  // Activity Type Actions
  addActivityType: (data: Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateActivityType: (id: string, data: Partial<Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteActivityType: (id: string) => void;
  reorderActivityTypes: (ids: string[]) => void;

  // Goal Actions
  addGoal: (data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'loggedMinutes' | 'status'>) => string;
  updateGoal: (id: string, data: Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteGoal: (id: string) => void;
  logMinutesToGoal: (id: string, minutes: number) => void;
  setGoalStatus: (id: string, status: GoalStatus) => void;

  // Routine Actions
  addRoutine: (name: string) => string;
  updateRoutine: (id: string, data: Partial<Omit<Routine, 'id' | 'createdAt' | 'updatedAt' | 'blocks'>>) => void;
  deleteRoutine: (id: string) => void;
  setActiveRoutine: (id: string | null) => void;
  duplicateRoutine: (id: string, newName: string) => string | null;

  // Routine Block Actions
  addRoutineBlock: (routineId: string, block: Omit<RoutineBlock, 'id'>) => string | null;
  updateRoutineBlock: (routineId: string, blockId: string, data: Partial<Omit<RoutineBlock, 'id'>>) => void;
  deleteRoutineBlock: (routineId: string, blockId: string) => void;
  copyDayBlocks: (routineId: string, fromDay: DayOfWeek, toDays: DayOfWeek[]) => void;

  // Tracking Entry Actions
  startTracking: (data: {
    activityTypeId: string;
    goalId?: string;
    routineBlockId?: string;
    source: TrackingSource;
    notes?: string;
  }) => string | null;
  stopTracking: (id?: string) => void;
  addCompletedEntry: (data: Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTrackingEntry: (id: string, data: Partial<Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteTrackingEntry: (id: string) => void;

  // State Management
  resetState: () => void;
  hydrate: (state: Partial<AppState>) => void;
  initializeDefaults: () => void;

  // Debug helpers
  _addSampleData: () => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial State
      ...createInitialState(),

      // ============================================
      // Activity Type Actions
      // ============================================
      addActivityType: (data) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newActivityType: ActivityType = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          activityTypes: [...state.activityTypes, newActivityType],
        }));
        return id;
      },

      updateActivityType: (id, data) => {
        set((state) => ({
          activityTypes: state.activityTypes.map((at) =>
            at.id === id
              ? { ...at, ...data, updatedAt: new Date().toISOString() }
              : at
          ),
        }));
      },

      deleteActivityType: (id) => {
        const state = get();
        // Prevent deletion if activity type is in use
        const isInUseByGoal = state.goals.some((g) => g.activityTypeId === id);
        const isInUseByRoutine = state.routines.some((r) =>
          r.blocks.some((b) => b.activityTypeId === id)
        );
        const isInUseByEntry = state.trackingEntries.some(
          (e) => e.activityTypeId === id
        );

        if (isInUseByGoal || isInUseByRoutine || isInUseByEntry) {
          console.warn('Cannot delete activity type that is in use');
          return;
        }

        set((state) => ({
          activityTypes: state.activityTypes.filter((at) => at.id !== id),
        }));
      },

      reorderActivityTypes: (ids) => {
        set((state) => ({
          activityTypes: state.activityTypes
            .map((at) => ({
              ...at,
              sortOrder: ids.indexOf(at.id),
              updatedAt: new Date().toISOString(),
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      },

      // ============================================
      // Goal Actions
      // ============================================
      addGoal: (data) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newGoal: Goal = {
          ...data,
          id,
          loggedMinutes: 0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          goals: [...state.goals, newGoal],
        }));
        return id;
      },

      updateGoal: (id, data) => {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === id
              ? { ...g, ...data, updatedAt: new Date().toISOString() }
              : g
          ),
        }));
      },

      deleteGoal: (id) => {
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          // Also update any routine blocks that reference this goal
          routines: state.routines.map((r) => ({
            ...r,
            blocks: r.blocks.map((b) =>
              b.goalId === id ? { ...b, goalId: undefined } : b
            ),
          })),
        }));
      },

      logMinutesToGoal: (id, minutes) => {
        set((state) => ({
          goals: state.goals.map((g) => {
            if (g.id !== id) return g;
            const newLoggedMinutes = g.loggedMinutes + minutes;
            const isCompleted = newLoggedMinutes >= g.estimatedMinutes;
            return {
              ...g,
              loggedMinutes: newLoggedMinutes,
              status: isCompleted ? 'completed' : g.status,
              completedAt: isCompleted ? new Date().toISOString() : g.completedAt,
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      },

      setGoalStatus: (id, status) => {
        set((state) => ({
          goals: state.goals.map((g) =>
            g.id === id
              ? {
                  ...g,
                  status,
                  completedAt:
                    status === 'completed'
                      ? new Date().toISOString()
                      : g.completedAt,
                  updatedAt: new Date().toISOString(),
                }
              : g
          ),
        }));
      },

      // ============================================
      // Routine Actions
      // ============================================
      addRoutine: (name) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newRoutine: Routine = {
          id,
          name,
          isActive: false,
          blocks: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
        return id;
      },

      updateRoutine: (id, data) => {
        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === id
              ? { ...r, ...data, updatedAt: new Date().toISOString() }
              : r
          ),
        }));
      },

      deleteRoutine: (id) => {
        set((state) => ({
          routines: state.routines.filter((r) => r.id !== id),
          activeRoutineId:
            state.activeRoutineId === id ? null : state.activeRoutineId,
        }));
      },

      setActiveRoutine: (id) => {
        set((state) => ({
          routines: state.routines.map((r) => ({
            ...r,
            isActive: r.id === id,
            updatedAt: new Date().toISOString(),
          })),
          activeRoutineId: id,
        }));
      },

      duplicateRoutine: (id, newName) => {
        const state = get();
        const sourceRoutine = state.routines.find((r) => r.id === id);
        if (!sourceRoutine) return null;

        const newId = generateId();
        const now = new Date().toISOString();
        const newRoutine: Routine = {
          ...sourceRoutine,
          id: newId,
          name: newName,
          isActive: false,
          blocks: sourceRoutine.blocks.map((b) => ({
            ...b,
            id: generateId(),
          })),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
        return newId;
      },

      // ============================================
      // Routine Block Actions
      // ============================================
      addRoutineBlock: (routineId, block) => {
        const state = get();
        const routine = state.routines.find((r) => r.id === routineId);
        if (!routine) return null;

        const blockId = generateId();
        const newBlock: RoutineBlock = {
          ...block,
          id: blockId,
        };

        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: [...r.blocks, newBlock],
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        }));
        return blockId;
      },

      updateRoutineBlock: (routineId, blockId, data) => {
        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: r.blocks.map((b) =>
                    b.id === blockId ? { ...b, ...data } : b
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        }));
      },

      deleteRoutineBlock: (routineId, blockId) => {
        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: r.blocks.filter((b) => b.id !== blockId),
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        }));
      },

      copyDayBlocks: (routineId, fromDay, toDays) => {
        set((state) => {
          const routine = state.routines.find((r) => r.id === routineId);
          if (!routine) return state;

          const sourceBlocks = routine.blocks.filter((b) => b.dayOfWeek === fromDay);
          const newBlocks: RoutineBlock[] = [];

          for (const toDay of toDays) {
            for (const sourceBlock of sourceBlocks) {
              newBlocks.push({
                ...sourceBlock,
                id: generateId(),
                dayOfWeek: toDay,
              });
            }
          }

          // Remove existing blocks on target days
          const filteredBlocks = routine.blocks.filter(
            (b) => !toDays.includes(b.dayOfWeek)
          );

          return {
            routines: state.routines.map((r) =>
              r.id === routineId
                ? {
                    ...r,
                    blocks: [...filteredBlocks, ...newBlocks],
                    updatedAt: new Date().toISOString(),
                  }
                : r
            ),
          };
        });
      },

      // ============================================
      // Tracking Entry Actions
      // ============================================
      startTracking: (data) => {
        const state = get();
        // Stop any currently running tracking
        if (state.currentTrackingEntryId) {
          get().stopTracking();
        }

        const id = generateId();
        const now = new Date().toISOString();
        const today = now.split('T')[0];
        const newEntry: TrackingEntry = {
          id,
          date: today,
          startTime: now,
          endTime: undefined,
          activityTypeId: data.activityTypeId,
          goalId: data.goalId,
          routineBlockId: data.routineBlockId,
          source: data.source,
          notes: data.notes,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          trackingEntries: [...state.trackingEntries, newEntry],
          currentTrackingEntryId: id,
        }));
        return id;
      },

      stopTracking: (id) => {
        const state = get();
        const entryId = id || state.currentTrackingEntryId;
        if (!entryId) return;

        const entry = state.trackingEntries.find((e) => e.id === entryId);
        if (!entry || entry.endTime) return;

        const now = new Date().toISOString();
        const startTime = new Date(entry.startTime).getTime();
        const endTime = new Date(now).getTime();
        const durationMinutes = Math.round((endTime - startTime) / 60000);

        set((state) => ({
          trackingEntries: state.trackingEntries.map((e) =>
            e.id === entryId
              ? { ...e, endTime: now, updatedAt: now }
              : e
          ),
          currentTrackingEntryId:
            state.currentTrackingEntryId === entryId
              ? null
              : state.currentTrackingEntryId,
        }));

        // Log minutes to goal if applicable
        if (entry.goalId && durationMinutes > 0) {
          get().logMinutesToGoal(entry.goalId, durationMinutes);
        }
      },

      addCompletedEntry: (data) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newEntry: TrackingEntry = {
          ...data,
          id,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          trackingEntries: [...state.trackingEntries, newEntry],
        }));

        // Log minutes to goal if applicable
        if (data.goalId && data.endTime) {
          const startTime = new Date(data.startTime).getTime();
          const endTime = new Date(data.endTime).getTime();
          const durationMinutes = Math.round((endTime - startTime) / 60000);
          if (durationMinutes > 0) {
            get().logMinutesToGoal(data.goalId, durationMinutes);
          }
        }

        return id;
      },

      updateTrackingEntry: (id, data) => {
        set((state) => ({
          trackingEntries: state.trackingEntries.map((e) =>
            e.id === id
              ? { ...e, ...data, updatedAt: new Date().toISOString() }
              : e
          ),
        }));
      },

      deleteTrackingEntry: (id) => {
        set((state) => ({
          trackingEntries: state.trackingEntries.filter((e) => e.id !== id),
          currentTrackingEntryId:
            state.currentTrackingEntryId === id
              ? null
              : state.currentTrackingEntryId,
        }));
      },

      // ============================================
      // State Management
      // ============================================
      resetState: () => {
        set(createInitialState());
      },

      hydrate: (state) => {
        set((current) => ({
          ...current,
          ...state,
        }));
      },

      initializeDefaults: () => {
        const state = get();
        // Initialize default activity types if none exist
        if (state.activityTypes.length === 0) {
          const defaults = createDefaultActivityTypes();
          set({ activityTypes: defaults });
        }
        // Create default routine if none exist
        if (state.routines.length === 0) {
          const now = new Date().toISOString();
          const defaultRoutine: Routine = {
            id: generateId(),
            name: 'My Week',
            isActive: true,
            blocks: [],
            createdAt: now,
            updatedAt: now,
          };
          set({
            routines: [defaultRoutine],
            activeRoutineId: defaultRoutine.id,
          });
        }
      },

      // ============================================
      // Debug Helpers
      // ============================================
      _addSampleData: () => {
        const state = get();
        const workActivity = state.activityTypes.find((at) => at.name === 'Work');
        const fitnessActivity = state.activityTypes.find((at) => at.name === 'Fitness');
        const sideProjectActivity = state.activityTypes.find((at) => at.name === 'Side Project');

        if (!workActivity || !fitnessActivity || !sideProjectActivity) return;

        // Add sample goals
        const goal1Id = get().addGoal({
          name: 'Complete TypeScript Course',
          description: 'Finish the advanced TypeScript patterns course',
          estimatedMinutes: 1200,
          activityTypeId: sideProjectActivity.id,
        });

        const goal2Id = get().addGoal({
          name: 'Run 100 miles',
          description: 'Cumulative running goal for the month',
          estimatedMinutes: 600,
          activityTypeId: fitnessActivity.id,
        });

        // Add sample routine
        const routineId = get().addRoutine('Work Week');

        // Add blocks to routine
        const blocks: Omit<RoutineBlock, 'id'>[] = [
          // Monday - Friday work blocks
          ...[1, 2, 3, 4, 5].flatMap((day) => [
            {
              dayOfWeek: day as DayOfWeek,
              startMinutes: 540, // 9:00 AM
              endMinutes: 720,   // 12:00 PM
              activityTypeId: workActivity.id,
            },
            {
              dayOfWeek: day as DayOfWeek,
              startMinutes: 780, // 1:00 PM
              endMinutes: 1020,  // 5:00 PM
              activityTypeId: workActivity.id,
            },
          ]),
          // Morning workout Monday, Wednesday, Friday
          ...[1, 3, 5].map((day) => ({
            dayOfWeek: day as DayOfWeek,
            startMinutes: 420, // 7:00 AM
            endMinutes: 480,   // 8:00 AM
            activityTypeId: fitnessActivity.id,
            goalId: goal2Id,
          })),
          // Side project evenings
          ...[1, 2, 3, 4].map((day) => ({
            dayOfWeek: day as DayOfWeek,
            startMinutes: 1140, // 7:00 PM
            endMinutes: 1260,   // 9:00 PM
            activityTypeId: sideProjectActivity.id,
            goalId: goal1Id,
          })),
        ];

        blocks.forEach((block) => {
          get().addRoutineBlock(routineId, block);
        });

        // Set as active routine
        get().setActiveRoutine(routineId);

        // Add some sample tracking entries
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        get().addCompletedEntry({
          date: yesterday.toISOString().split('T')[0],
          startTime: new Date(yesterday.setHours(9, 0, 0, 0)).toISOString(),
          endTime: new Date(yesterday.setHours(12, 0, 0, 0)).toISOString(),
          activityTypeId: workActivity.id,
          source: 'scheduled',
        });

        get().addCompletedEntry({
          date: yesterday.toISOString().split('T')[0],
          startTime: new Date(yesterday.setHours(7, 0, 0, 0)).toISOString(),
          endTime: new Date(yesterday.setHours(8, 0, 0, 0)).toISOString(),
          activityTypeId: fitnessActivity.id,
          goalId: goal2Id,
          source: 'manual',
        });
      },
    }),
    {
      name: 'zenroutine-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: CURRENT_SCHEMA_VERSION,
      migrate: (persistedState, version) => {
        // Handle migrations here when schema changes
        if (version === 0) {
          // Migration from version 0 to 1
          return { ...(persistedState as AppState), schemaVersion: 1 };
        }
        return persistedState as AppState & AppActions;
      },
    }
  )
);

// Selector hooks for common queries
// Note: For derived data (filter/find), we select the base data and derive in the component
// to avoid creating new object references that cause infinite re-renders

export const useActivityTypes = () => useAppStore((s) => s.activityTypes);
export const useGoals = () => useAppStore((s) => s.goals);
export const useRoutines = () => useAppStore((s) => s.routines);
export const useTrackingEntries = () => useAppStore((s) => s.trackingEntries);

// For derived selectors, we select primitive/stable values and compute in the hook
export const useActiveGoals = () => {
  const goals = useAppStore((s) => s.goals);
  // useMemo would be ideal here, but to keep it simple we'll accept the filter on each render
  // The key fix is that we're selecting `goals` (stable reference) not the filtered result
  return goals.filter((g) => g.status === 'active');
};

export const useActiveRoutine = () => {
  const routines = useAppStore((s) => s.routines);
  const activeRoutineId = useAppStore((s) => s.activeRoutineId);
  return routines.find((r) => r.id === activeRoutineId);
};

export const useCurrentTracking = () => {
  const trackingEntries = useAppStore((s) => s.trackingEntries);
  const currentTrackingEntryId = useAppStore((s) => s.currentTrackingEntryId);
  if (!currentTrackingEntryId) return null;
  return trackingEntries.find((e) => e.id === currentTrackingEntryId);
};
