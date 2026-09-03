import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  ActivityType,
  Goal,
  GoalStatus,
  GoalPriority,
  Routine,
  RoutineBlock,
  TrackingEntry,
  TrackingSource,
  DayOfWeek,
} from '../core/types';
import { generateId } from '../core/utils/id';
import { createDefaultActivityTypes } from '../core/engine/defaults';
import {
  getTrackingEntryDurationMinutes,
  parseLocalDateKey,
  toLocalDateKey,
} from '../core/utils/time';
import {
  findOverlappingBlocks,
  validateRoutineBlock,
} from '../core/engine/validation';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createInitialState,
  decodeBackup,
  encodeBackup,
  migratePersistedState,
  selectPersistedAppState,
} from './persistence';

export type ImportResult =
  | { ok: true }
  | { ok: false; error: string };

export type HydrationSnapshot =
  | { status: 'idle' | 'loading' | 'ready'; error: null }
  | { status: 'error'; error: string };

const hydrationListeners = new Set<() => void>();
let hydrationSnapshot: HydrationSnapshot = { status: 'idle', error: null };
let hydrationRun: Promise<void> | null = null;
let hydrationFailure: unknown = null;

function publishHydrationSnapshot(next: HydrationSnapshot): void {
  hydrationSnapshot = next;
  hydrationListeners.forEach((listener) => listener());
}

export function getHydrationSnapshot(): HydrationSnapshot {
  return hydrationSnapshot;
}

export function subscribeHydration(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => hydrationListeners.delete(listener);
}

function createDefaultRoutine(now = new Date().toISOString()): Routine {
  return {
    id: generateId(),
    name: 'My Week',
    isActive: true,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createInitializedState(): AppState {
  return ensureRequiredDefaults(createInitialState());
}

function ensureRequiredDefaults(state: AppState): AppState {
  const needsActivities = state.activityTypes.length === 0;
  const needsRoutine = state.routines.length === 0;
  if (!needsActivities && !needsRoutine) return state;
  const routine = needsRoutine ? createDefaultRoutine() : undefined;
  return {
    ...state,
    activityTypes: needsActivities ? createDefaultActivityTypes() : state.activityTypes,
    routines: routine ? [routine] : state.routines,
    activeRoutineId: routine?.id ?? state.activeRoutineId,
  };
}

function applyGoalProgressChange(
  goal: Goal,
  nextLoggedMinutes: number,
  nextEstimatedMinutes: number,
  now: string
): Goal {
  const loggedMinutes = Math.max(0, nextLoggedMinutes);
  const previouslyMetEstimate = goal.loggedMinutes >= goal.estimatedMinutes;
  const meetsEstimate = loggedMinutes >= nextEstimatedMinutes;
  let status = goal.status;
  let completedAt = goal.status === 'completed' ? goal.completedAt : undefined;

  if (meetsEstimate && status !== 'completed') {
    status = 'completed';
    completedAt = now;
  } else if (!meetsEstimate && previouslyMetEstimate && status === 'completed') {
    status = 'active';
    completedAt = undefined;
  }

  return {
    ...goal,
    estimatedMinutes: nextEstimatedMinutes,
    loggedMinutes,
    status,
    completedAt: status === 'completed' ? completedAt ?? now : undefined,
    updatedAt: now,
  };
}

function applyGoalDeltas(
  goals: Goal[],
  deltas: ReadonlyMap<string, number>,
  now: string
): Goal[] {
  if (deltas.size === 0) return goals;
  return goals.map((goal) => {
    const delta = deltas.get(goal.id);
    if (delta === undefined || delta === 0) return goal;
    return applyGoalProgressChange(
      goal,
      goal.loggedMinutes + delta,
      goal.estimatedMinutes,
      now
    );
  });
}

function contributionDelta(
  before: TrackingEntry | undefined,
  after: TrackingEntry | undefined
): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (entry: TrackingEntry | undefined, multiplier: 1 | -1) => {
    if (!entry?.goalId) return;
    const minutes = getTrackingEntryDurationMinutes(entry);
    if (minutes === 0) return;
    deltas.set(entry.goalId, (deltas.get(entry.goalId) ?? 0) + multiplier * minutes);
  };
  add(before, -1);
  add(after, 1);
  return deltas;
}

function blockReferencesAreValid(
  state: AppState,
  block: Pick<RoutineBlock, 'activityTypeId' | 'goalId'>
): boolean {
  if (!state.activityTypes.some((activity) => activity.id === block.activityTypeId)) {
    return false;
  }
  if (!block.goalId) return true;
  const goal = state.goals.find((candidate) => candidate.id === block.goalId);
  return goal?.activityTypeId === block.activityTypeId;
}

function trackingEntryIsValid(state: AppState, entry: TrackingEntry): boolean {
  try {
    parseLocalDateKey(entry.date);
  } catch {
    return false;
  }
  const start = Date.parse(entry.startTime);
  const end = entry.endTime ? Date.parse(entry.endTime) : undefined;
  if (!Number.isFinite(start) || (end !== undefined && (!Number.isFinite(end) || end <= start))) {
    return false;
  }
  const activityExists = state.activityTypes.some(
    (activity) => activity.id === entry.activityTypeId
  );
  if (!activityExists) return false;
  if (entry.goalId) {
    const goal = state.goals.find((candidate) => candidate.id === entry.goalId);
    if (goal?.activityTypeId !== entry.activityTypeId) return false;
  }
  if (entry.routineBlockId) {
    const routineBlock = state.routines
      .flatMap((routine) => routine.blocks)
      .find((block) => block.id === entry.routineBlockId);
    if (!routineBlock || routineBlock.activityTypeId !== entry.activityTypeId) return false;
    if (routineBlock.goalId && routineBlock.goalId !== entry.goalId) return false;
  }
  return true;
}

// Action types
interface AppActions {
  // Activity Type Actions
  addActivityType: (data: Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateActivityType: (id: string, data: Partial<Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteActivityType: (id: string) => void;
  reorderActivityTypes: (ids: string[]) => void;

  // Goal Actions
  addGoal: (data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'loggedMinutes' | 'status' | 'priority'> & { priority?: GoalPriority }) => string | null;
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
  addCompletedEntry: (
    data: Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt' | 'endTime'> & {
      endTime: string;
    }
  ) => string | null;
  updateTrackingEntry: (id: string, data: Partial<Omit<TrackingEntry, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  deleteTrackingEntry: (id: string) => void;

  // State Management
  resetState: () => Promise<void>;
  initializeDefaults: () => void;
  completeOnboarding: () => void;
  exportData: () => string;
  importData: (serialized: string) => Promise<ImportResult>;

  // Debug helpers
  _addSampleData: () => void;
}

export type AppStore = AppState & AppActions;

const appStorage = createJSONStorage<AppState>(() => AsyncStorage);

async function persistSnapshot(state: AppState): Promise<void> {
  if (!appStorage) {
    throw new Error('Local storage is unavailable.');
  }
  await appStorage.setItem(APP_STORAGE_KEY, {
    state: selectPersistedAppState(state),
    version: CURRENT_SCHEMA_VERSION,
  });
}

export const useAppStore = create<AppStore>()(
  persist<AppStore, [], [], AppState>(
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
        const state = get();
        if (
          !data.name.trim() ||
          !Number.isInteger(data.estimatedMinutes) ||
          data.estimatedMinutes <= 0 ||
          !state.activityTypes.some((activity) => activity.id === data.activityTypeId) ||
          (data.priority !== undefined && ![1, 2, 3, 4, 5].includes(data.priority))
        ) {
          return null;
        }
        const id = generateId();
        const now = new Date().toISOString();
        const newGoal: Goal = {
          ...data,
          id,
          loggedMinutes: 0,
          status: 'active',
          priority: data.priority ?? 3, // Default to Medium priority
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
          goals: state.goals.map((goal) => {
            if (goal.id !== id) return goal;
            const now = new Date().toISOString();
            const estimatedMinutes = data.estimatedMinutes ?? goal.estimatedMinutes;
            const loggedMinutes = data.loggedMinutes ?? goal.loggedMinutes;
            const activityTypeId = data.activityTypeId ?? goal.activityTypeId;
            const priority = data.priority ?? goal.priority;
            const changesLinkedActivity = activityTypeId !== goal.activityTypeId && (
              state.routines.some((routine) => routine.blocks.some(
                (block) => block.goalId === goal.id
              )) ||
              state.trackingEntries.some((entry) => entry.goalId === goal.id)
            );
            if (
              !(data.name ?? goal.name).trim() ||
              !Number.isInteger(estimatedMinutes) ||
              estimatedMinutes <= 0 ||
              !Number.isInteger(loggedMinutes) ||
              !Number.isFinite(loggedMinutes) ||
              ![1, 2, 3, 4, 5].includes(priority) ||
              !state.activityTypes.some((activity) => activity.id === activityTypeId) ||
              changesLinkedActivity
            ) {
              return goal;
            }
            const explicitlyRequestedStatus = data.status;
            const merged = {
              ...goal,
              ...data,
              completedAt: goal.completedAt,
              updatedAt: now,
            };

            if (explicitlyRequestedStatus) {
              return {
                ...merged,
                loggedMinutes: Math.max(0, loggedMinutes),
                status: explicitlyRequestedStatus,
                completedAt: explicitlyRequestedStatus === 'completed'
                  ? goal.status === 'completed'
                    ? goal.completedAt ?? now
                    : now
                  : undefined,
              };
            }

            return {
              ...merged,
              ...applyGoalProgressChange(
                goal,
                loggedMinutes,
                estimatedMinutes,
                now
              ),
              name: data.name ?? goal.name,
              description: data.description ?? goal.description,
              activityTypeId,
              priority,
              createdAt: goal.createdAt,
            };
          }),
        }));
      },

      deleteGoal: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          goals: state.goals.filter((g) => g.id !== id),
          // Also update any routine blocks that reference this goal
          routines: state.routines.map((r) => ({
            ...r,
            blocks: r.blocks.map((b) =>
              b.goalId === id ? { ...b, goalId: undefined } : b
            ),
          })),
          trackingEntries: state.trackingEntries.map((entry) =>
            entry.goalId === id
              ? { ...entry, goalId: undefined, updatedAt: now }
              : entry
          ),
        }));
      },

      logMinutesToGoal: (id, minutes) => {
        if (!Number.isInteger(minutes) || minutes === 0) return;
        set((state) => ({
          goals: state.goals.map((goal) => {
            if (goal.id !== id) return goal;
            return applyGoalProgressChange(
              goal,
              goal.loggedMinutes + minutes,
              goal.estimatedMinutes,
              new Date().toISOString()
            );
          }),
        }));
      },

      setGoalStatus: (id, status) => {
        set((state) => ({
          goals: state.goals.map((goal) =>
            goal.id === id
              ? {
                  ...goal,
                  status,
                  completedAt:
                    status === 'completed'
                      ? goal.status === 'completed'
                        ? goal.completedAt ?? new Date().toISOString()
                        : new Date().toISOString()
                      : undefined,
                  updatedAt: new Date().toISOString(),
                }
              : goal
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
        set((state) => {
          const removedBlockIds = new Set(
            state.routines.find((routine) => routine.id === id)?.blocks.map((block) => block.id) ?? []
          );
          const now = new Date().toISOString();
          return {
            routines: state.routines.filter((routine) => routine.id !== id),
            trackingEntries: state.trackingEntries.map((entry) =>
              entry.routineBlockId && removedBlockIds.has(entry.routineBlockId)
                ? { ...entry, routineBlockId: undefined, updatedAt: now }
                : entry
            ),
            activeRoutineId:
              state.activeRoutineId === id ? null : state.activeRoutineId,
          };
        });
      },

      setActiveRoutine: (id) => {
        if (id !== null && !get().routines.some((routine) => routine.id === id)) return;
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
        if (
          !validateRoutineBlock(newBlock).isValid ||
          !blockReferencesAreValid(state, newBlock) ||
          findOverlappingBlocks(routine.blocks, newBlock).length > 0
        ) {
          return null;
        }

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
        const state = get();
        const routine = state.routines.find((candidate) => candidate.id === routineId);
        const block = routine?.blocks.find((candidate) => candidate.id === blockId);
        if (!routine || !block) return;
        const updatedBlock: RoutineBlock = { ...block, ...data };
        if (
          !validateRoutineBlock(updatedBlock).isValid ||
          !blockReferencesAreValid(state, updatedBlock) ||
          findOverlappingBlocks(routine.blocks, updatedBlock).length > 0
        ) {
          return;
        }

        set((state) => ({
          routines: state.routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  blocks: r.blocks.map((b) =>
                    b.id === blockId ? updatedBlock : b
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : r
          ),
        }));
      },

      deleteRoutineBlock: (routineId, blockId) => {
        set((state) => {
          const blockExists = state.routines.some(
            (routine) => routine.id === routineId && routine.blocks.some((block) => block.id === blockId)
          );
          if (!blockExists) return state;
          const now = new Date().toISOString();
          return {
            routines: state.routines.map((routine) =>
              routine.id === routineId
                ? {
                    ...routine,
                    blocks: routine.blocks.filter((block) => block.id !== blockId),
                    updatedAt: now,
                  }
                : routine
            ),
            trackingEntries: state.trackingEntries.map((entry) =>
              entry.routineBlockId === blockId
                ? { ...entry, routineBlockId: undefined, updatedAt: now }
                : entry
            ),
          };
        });
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
          const removedBlockIds = new Set(
            routine.blocks
              .filter((block) => toDays.includes(block.dayOfWeek))
              .map((block) => block.id)
          );
          const candidateBlocks = [...filteredBlocks, ...newBlocks];
          const isValid = candidateBlocks.every((block, index) =>
            validateRoutineBlock(block).isValid &&
            blockReferencesAreValid(state, block) &&
            findOverlappingBlocks(candidateBlocks.slice(0, index), block).length === 0
          );
          if (!isValid) return state;
          const now = new Date().toISOString();

          return {
            routines: state.routines.map((r) =>
              r.id === routineId
                ? {
                    ...r,
                    blocks: candidateBlocks,
                    updatedAt: now,
                  }
                : r
            ),
            trackingEntries: state.trackingEntries.map((entry) =>
              entry.routineBlockId && removedBlockIds.has(entry.routineBlockId)
                ? { ...entry, routineBlockId: undefined, updatedAt: now }
                : entry
            ),
          };
        });
      },

      // ============================================
      // Tracking Entry Actions
      // ============================================
      startTracking: (data) => {
        const state = get();
        const activityExists = state.activityTypes.some(
          (activity) => activity.id === data.activityTypeId
        );
        const goalIsValid = !data.goalId || state.goals.some(
          (goal) => goal.id === data.goalId && goal.activityTypeId === data.activityTypeId
        );
        const routineBlock = data.routineBlockId
          ? state.routines
              .flatMap((routine) => routine.blocks)
              .find((block) => block.id === data.routineBlockId)
          : undefined;
        const routineBlockIsValid = !data.routineBlockId || (
          routineBlock?.activityTypeId === data.activityTypeId &&
          (!routineBlock.goalId || routineBlock.goalId === data.goalId)
        );
        if (!activityExists || !goalIsValid || !routineBlockIsValid) return null;

        // Stop any currently running tracking
        if (state.currentTrackingEntryId) {
          get().stopTracking();
        }

        const id = generateId();
        const now = new Date().toISOString();
        const newEntry: TrackingEntry = {
          id,
          date: toLocalDateKey(new Date()),
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
        const completedEntry: TrackingEntry = {
          ...entry,
          endTime: now,
          updatedAt: now,
        };

        set((state) => ({
          trackingEntries: state.trackingEntries.map((e) =>
            e.id === entryId ? completedEntry : e
          ),
          goals: applyGoalDeltas(
            state.goals,
            contributionDelta(entry, completedEntry),
            now
          ),
          currentTrackingEntryId:
            state.currentTrackingEntryId === entryId
              ? null
              : state.currentTrackingEntryId,
        }));
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
        if (!trackingEntryIsValid(get(), newEntry)) return null;

        set((state) => ({
          trackingEntries: [...state.trackingEntries, newEntry],
          goals: applyGoalDeltas(
            state.goals,
            contributionDelta(undefined, newEntry),
            now
          ),
        }));

        return id;
      },

      updateTrackingEntry: (id, data) => {
        set((state) => {
          const entry = state.trackingEntries.find((candidate) => candidate.id === id);
          if (!entry) return state;
          const now = new Date().toISOString();
          const updatedEntry: TrackingEntry = { ...entry, ...data, updatedAt: now };
          if (entry.endTime && !updatedEntry.endTime) return state;
          if (!trackingEntryIsValid(state, updatedEntry)) return state;
          return {
            trackingEntries: state.trackingEntries.map((candidate) =>
              candidate.id === id ? updatedEntry : candidate
            ),
            goals: applyGoalDeltas(
              state.goals,
              contributionDelta(entry, updatedEntry),
              now
            ),
            currentTrackingEntryId:
              state.currentTrackingEntryId === id && updatedEntry.endTime
                ? null
                : state.currentTrackingEntryId,
          };
        });
      },

      deleteTrackingEntry: (id) => {
        set((state) => {
          const entry = state.trackingEntries.find((candidate) => candidate.id === id);
          if (!entry) return state;
          const now = new Date().toISOString();
          return {
            trackingEntries: state.trackingEntries.filter((candidate) => candidate.id !== id),
            goals: applyGoalDeltas(
              state.goals,
              contributionDelta(entry, undefined),
              now
            ),
            currentTrackingEntryId:
              state.currentTrackingEntryId === id
                ? null
                : state.currentTrackingEntryId,
          };
        });
      },

      // ============================================
      // State Management
      // ============================================
      resetState: async () => {
        const nextState = createInitializedState();
        await persistSnapshot(nextState);
        set(nextState);
      },

      initializeDefaults: () => {
        const state = get();
        const needsActivities = state.activityTypes.length === 0;
        const needsRoutine = state.routines.length === 0;
        if (!needsActivities && !needsRoutine) return;

        const defaultRoutine = needsRoutine ? createDefaultRoutine() : undefined;
        set({
          activityTypes: needsActivities
            ? createDefaultActivityTypes()
            : state.activityTypes,
          routines: defaultRoutine ? [defaultRoutine] : state.routines,
          activeRoutineId: defaultRoutine?.id ?? state.activeRoutineId,
        });
      },

      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true });
      },

      exportData: () => encodeBackup(selectPersistedAppState(get())),

      importData: async (serialized) => {
        let imported: AppState;
        try {
          imported = ensureRequiredDefaults(decodeBackup(serialized));
          await persistSnapshot(imported);
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Unable to import this backup.',
          };
        }
        set(imported);
        return { ok: true };
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
          priority: 2, // High priority
        });

        const goal2Id = get().addGoal({
          name: 'Run 100 miles',
          description: 'Cumulative running goal for the month',
          estimatedMinutes: 600,
          activityTypeId: fitnessActivity.id,
          priority: 1, // Very High priority
        });
        if (!goal1Id || !goal2Id) return;

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
          date: toLocalDateKey(yesterday),
          startTime: new Date(yesterday.setHours(9, 0, 0, 0)).toISOString(),
          endTime: new Date(yesterday.setHours(12, 0, 0, 0)).toISOString(),
          activityTypeId: workActivity.id,
          source: 'scheduled',
        });

        get().addCompletedEntry({
          date: toLocalDateKey(yesterday),
          startTime: new Date(yesterday.setHours(7, 0, 0, 0)).toISOString(),
          endTime: new Date(yesterday.setHours(8, 0, 0, 0)).toISOString(),
          activityTypeId: fitnessActivity.id,
          goalId: goal2Id,
          source: 'manual',
        });
      },
    }),
    {
      name: APP_STORAGE_KEY,
      storage: appStorage,
      version: CURRENT_SCHEMA_VERSION,
      skipHydration: true,
      partialize: selectPersistedAppState,
      migrate: migratePersistedState,
      merge: (persistedState, currentState) => {
        if (persistedState === undefined) return currentState;
        return {
          ...currentState,
          ...migratePersistedState(persistedState, CURRENT_SCHEMA_VERSION),
        };
      },
      onRehydrateStorage: () => {
        hydrationFailure = null;
        return (_state, error) => {
          hydrationFailure = error ?? null;
        };
      },
    }
  )
);

export function initializeAppStore(options?: { force?: boolean }): Promise<void> {
  if (hydrationRun) return hydrationRun;
  if (hydrationSnapshot.status === 'ready' && !options?.force) {
    return Promise.resolve();
  }

  publishHydrationSnapshot({ status: 'loading', error: null });
  hydrationRun = (async () => {
    try {
      await useAppStore.persist.rehydrate();
      if (hydrationFailure || !useAppStore.persist.hasHydrated()) {
        throw hydrationFailure instanceof Error
          ? hydrationFailure
          : new Error('ZenRoutine could not read its local data.');
      }
      const current = selectPersistedAppState(useAppStore.getState());
      const initialized = ensureRequiredDefaults(current);
      if (initialized !== current) {
        await persistSnapshot(initialized);
        useAppStore.setState(initialized);
      }
      publishHydrationSnapshot({ status: 'ready', error: null });
    } catch (error) {
      publishHydrationSnapshot({
        status: 'error',
        error: error instanceof Error
          ? error.message
          : 'ZenRoutine could not read its local data.',
      });
    }
  })().finally(() => {
    hydrationRun = null;
  });
  return hydrationRun;
}

export async function resetAppStoreAfterHydrationError(): Promise<void> {
  if (hydrationSnapshot.status !== 'error') return;
  await useAppStore.getState().resetState();
  hydrationFailure = null;
  publishHydrationSnapshot({ status: 'ready', error: null });
}

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

export const useHasCompletedOnboarding = () => useAppStore((s) => s.hasCompletedOnboarding);
