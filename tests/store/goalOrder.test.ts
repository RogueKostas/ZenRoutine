import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  moveGoalInList,
  nextGoalOrder,
  removeGoalFromList,
  sortGoalsByOrder,
} from '../../src/core/engine/goalOrder';
import { useAppStore } from '../../src/store/useAppStore';
import { selectPersistedAppState } from '../../src/store/persistence';
import { makeGoal } from '../helpers/builders';

const frozenTime = '2026-03-02T09:00:00.000Z';
const laterTime = '2026-03-02T10:00:00.000Z';

/** Goals a–e in list order, alternating two activity types: a, c, e are Work; b, d are Health. */
function listOf(...ids: string[]) {
  return ids.map((id, order) => makeGoal({
    id,
    order,
    activityTypeId: ['a', 'c', 'e'].includes(id) ? 'work' : 'health',
  }));
}

const ids = (goals: readonly { id: string }[]) => goals.map((goal) => goal.id);
const orders = (goals: readonly { order: number }[]) => goals.map((goal) => goal.order);

describe('moveGoalInList', () => {
  const goals = listOf('a', 'b', 'c', 'd', 'e');

  it('moves a goal to the top', () => {
    const moved = moveGoalInList(goals, 'd', { before: 'a' }, laterTime);
    expect(ids(moved)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(orders(moved)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves a goal to the bottom', () => {
    const moved = moveGoalInList(goals, 'a', { after: 'e' }, laterTime);
    expect(ids(moved)).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(orders(moved)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves down past one neighbour, either way of naming it', () => {
    expect(ids(moveGoalInList(goals, 'b', { after: 'c' }, laterTime)))
      .toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(ids(moveGoalInList(goals, 'b', { before: 'd' }, laterTime)))
      .toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('changes nothing, and returns the same list, when moved onto itself or where it already is', () => {
    expect(moveGoalInList(goals, 'c', { before: 'c' }, laterTime)).toBe(goals);
    expect(moveGoalInList(goals, 'c', { after: 'c' }, laterTime)).toBe(goals);
    expect(moveGoalInList(goals, 'c', { before: 'd' }, laterTime)).toBe(goals);
    expect(moveGoalInList(goals, 'c', { after: 'b' }, laterTime)).toBe(goals);
  });

  it('changes nothing for an unknown goal or target', () => {
    expect(moveGoalInList(goals, 'missing', { before: 'a' }, laterTime)).toBe(goals);
    for (const goalId of ['a', 'c', 'e']) {
      expect(moveGoalInList(goals, goalId, { after: 'missing' }, laterTime)).toBe(goals);
      expect(moveGoalInList(goals, goalId, { before: 'missing' }, laterTime)).toBe(goals);
    }
  });

  it('moves within a filtered view relative to the visible rows, leaving hidden rows in place', () => {
    // Filtered to Work, the list shows a, c, e. Dragging e to the top of that view:
    const toTop = moveGoalInList(goals, 'e', { before: 'a' }, laterTime);
    expect(ids(toTop)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(ids(toTop.filter((goal) => goal.activityTypeId === 'work'))).toEqual(['e', 'a', 'c']);
    expect(ids(toTop.filter((goal) => goal.activityTypeId === 'health'))).toEqual(['b', 'd']);

    // Dragging a below c in that view: it lands straight after c, ahead of hidden d.
    const belowC = moveGoalInList(goals, 'a', { after: 'c' }, laterTime);
    expect(ids(belowC)).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(ids(belowC.filter((goal) => goal.activityTypeId === 'work'))).toEqual(['c', 'a', 'e']);
    expect(ids(belowC.filter((goal) => goal.activityTypeId === 'health'))).toEqual(['b', 'd']);
  });

  it('stamps only the goal that was moved, and leaves the input alone', () => {
    const before = structuredClone(goals);
    const moved = moveGoalInList(goals, 'd', { before: 'b' }, laterTime);
    expect(moved.find((goal) => goal.id === 'd')!.updatedAt).toBe(laterTime);
    for (const goal of moved.filter((candidate) => candidate.id !== 'd')) {
      expect(goal.updatedAt).toBe(goals[0].updatedAt);
    }
    // A goal whose position did not change is the same object.
    expect(moved[0]).toBe(goals[0]);
    expect(goals).toEqual(before);
  });
});

describe('list helpers', () => {
  it('sorts by order, keeping array order for equal orders', () => {
    const goals = [
      makeGoal({ id: 'x', order: 2 }),
      makeGoal({ id: 'y', order: 0 }),
      makeGoal({ id: 'z', order: 2 }),
      makeGoal({ id: 'w', order: 1 }),
    ];
    expect(ids(sortGoalsByOrder(goals))).toEqual(['y', 'w', 'x', 'z']);
  });

  it('removes a goal and closes the gap without reordering the rest', () => {
    const remaining = removeGoalFromList(listOf('a', 'b', 'c', 'd'), 'b');
    expect(ids(remaining)).toEqual(['a', 'c', 'd']);
    expect(orders(remaining)).toEqual([0, 1, 2]);
  });

  it('puts the next goal at the bottom', () => {
    expect(nextGoalOrder([])).toBe(0);
    expect(nextGoalOrder(listOf('a', 'b', 'c'))).toBe(3);
  });
});

describe('store: goal order (#49)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(frozenTime));
    await useAppStore.persist.rehydrate();
    await useAppStore.getState().resetState();
    await useAppStore.persist.clearStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function addGoals(...names: string[]): string[] {
    const store = useAppStore.getState();
    const [work, health] = store.activityTypes;
    return names.map((name, index) => store.addGoal({
      name,
      description: '',
      estimatedMinutes: 60,
      activityTypeId: index % 2 === 0 ? work.id : health.id,
    })!);
  }

  const storedIds = () => useAppStore.getState().goals.map((goal) => goal.id);
  const storedOrders = () => useAppStore.getState().goals.map((goal) => goal.order);

  it('adds each new goal at the bottom of the list', () => {
    const [a, b, c] = addGoals('A', 'B', 'C');
    expect(storedIds()).toEqual([a, b, c]);
    expect(storedOrders()).toEqual([0, 1, 2]);

    useAppStore.getState().moveGoal(c, { before: a });
    const [d] = addGoals('D');
    expect(storedIds()).toEqual([c, a, b, d]);
    expect(storedOrders()).toEqual([0, 1, 2, 3]);
  });

  it('does not store a priority a caller still passes', () => {
    const store = useAppStore.getState();
    const legacyCall = {
      name: 'Old caller',
      description: '',
      estimatedMinutes: 60,
      activityTypeId: store.activityTypes[0].id,
      priority: 1,
    };
    const id = store.addGoal(legacyCall);
    expect(useAppStore.getState().goals.find((goal) => goal.id === id)).not.toHaveProperty('priority');
  });

  it('moves a goal and persists the new order', () => {
    const [a, b, c] = addGoals('A', 'B', 'C');
    vi.setSystemTime(new Date(laterTime));

    useAppStore.getState().moveGoal(c, { before: a });

    expect(storedIds()).toEqual([c, a, b]);
    expect(storedOrders()).toEqual([0, 1, 2]);
    expect(useAppStore.getState().goals[0].updatedAt).toBe(laterTime);
    expect(selectPersistedAppState(useAppStore.getState()).goals.map((goal) => goal.id))
      .toEqual([c, a, b]);
  });

  it('writes nothing for a move that moves nothing', () => {
    const [a, b] = addGoals('A', 'B');
    const before = useAppStore.getState().goals;
    useAppStore.getState().moveGoal(a, { before: a });
    useAppStore.getState().moveGoal(a, { after: 'missing' });
    useAppStore.getState().moveGoal(b, { after: 'missing' });
    expect(useAppStore.getState().goals).toBe(before);
  });

  it('keeps the others in order when a goal is deleted', () => {
    const [a, b, c, d] = addGoals('A', 'B', 'C', 'D');
    useAppStore.getState().moveGoal(d, { before: a });

    useAppStore.getState().deleteGoal(a);

    expect(storedIds()).toEqual([d, b, c]);
    expect(storedOrders()).toEqual([0, 1, 2]);
  });

  it('never moves a goal through updateGoal', () => {
    const [a, b] = addGoals('A', 'B');
    const smuggled = { name: 'A renamed', order: 5 };
    useAppStore.getState().updateGoal(a, smuggled);
    expect(storedIds()).toEqual([a, b]);
    expect(useAppStore.getState().goals[0]).toMatchObject({ name: 'A renamed', order: 0 });

    // The explicit-status path builds the goal differently, so it is checked on its own.
    const smuggledWithStatus = { status: 'paused' as const, order: 5 };
    useAppStore.getState().updateGoal(b, smuggledWithStatus);
    expect(useAppStore.getState().goals[1]).toMatchObject({ id: b, status: 'paused', order: 1 });
  });

  it('stamps no capacity change on any routine when goals are reordered', () => {
    const store = useAppStore.getState();
    const routineId = store.activeRoutineId!;
    store.addRoutineBlock(routineId, {
      dayOfWeek: 1,
      startMinutes: 540,
      endMinutes: 600,
      activityTypeId: store.activityTypes[0].id,
    });
    const [a, , c] = addGoals('A', 'B', 'C');
    const routinesBefore = useAppStore.getState().routines;
    vi.setSystemTime(new Date(laterTime));

    useAppStore.getState().moveGoal(c, { before: a });

    expect(useAppStore.getState().routines).toBe(routinesBefore);
  });

  it('puts example goals below the user\'s own, in their own order', () => {
    const [mine] = addGoals('Mine');
    expect(useAppStore.getState()._addSampleData()).toBe(true);
    const goals = useAppStore.getState().goals;
    expect(goals[0].id).toBe(mine);
    expect(goals.map((goal) => goal.name).slice(1)).toEqual([
      'Ship the analytics dashboard',
      'Half-marathon training block',
      'Finish the TypeScript course',
      'Write the Q4 planning doc',
      "Read 'Deep Work'",
      'Renew passport',
    ]);
    expect(goals.map((goal) => goal.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
