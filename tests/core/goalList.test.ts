import { describe, expect, it } from 'vitest';

import {
  PLACEHOLDER_ESTIMATE_LABEL,
  dropIndexForDrag,
  estimateDraftStart,
  formatForecastDay,
  formatGoalEstimate,
  goalAcceptsTrackingFor,
  goalIdsWithLinkedTracking,
  goalProgressPercent,
  goalRowHint,
  goalsInList,
  isSchedulableGoal,
  moveTargetForDrop,
  moveTargetForStep,
  newGoalFromAddRow,
  readEstimateDraft,
  resolveGoalListFilter,
  rowShiftDuringDrag,
  showsTypeColumn,
  type RowLayout,
} from '../../src/core/engine/goalList';
import { moveGoalInList } from '../../src/core/engine/goalOrder';
import type { Goal } from '../../src/core/types';
import { makeGoal } from '../helpers/builders';

const LATER = '2026-03-02T10:00:00.000Z';

function untyped(overrides: Partial<Goal> = {}): Goal {
  const { activityTypeId: _type, estimatedMinutes: _estimate, ...goal } = makeGoal(overrides);
  return goal;
}

describe('adding from the add row: the filter decides the type (#51, p67)', () => {
  it('gives a goal added under a type filter that type', () => {
    expect(newGoalFromAddRow('Draft slides', 'work')).toEqual({
      ok: true,
      goal: { name: 'Draft slides', description: '', activityTypeId: 'work' },
    });
  });

  it('leaves a goal added under "All" with no type at all', () => {
    const result = newGoalFromAddRow('  Buy milk ', null);
    expect(result).toEqual({ ok: true, goal: { name: 'Buy milk', description: '' } });
    expect(result.ok && result.goal).not.toHaveProperty('activityTypeId');
  });

  it('never stores an estimate: a new row\'s 1hr is only a placeholder', () => {
    for (const filter of [null, 'work']) {
      const result = newGoalFromAddRow('x', filter);
      expect(result.ok && result.goal).not.toHaveProperty('estimatedMinutes');
    }
  });

  it('needs a name', () => {
    expect(newGoalFromAddRow('   ', 'work')).toEqual({ ok: false, error: 'Type a name, then press Enter.' });
  });

  it('falls back to "All" when the filter\'s type was deleted', () => {
    const types = [{ id: 'work' }];
    expect(resolveGoalListFilter('work', types)).toBe('work');
    expect(resolveGoalListFilter('gone', types)).toBeNull();
    expect(resolveGoalListFilter(null, types)).toBeNull();
  });
});

describe('which rows show (p60–p64)', () => {
  const goals = [
    makeGoal({ id: 'w1', activityTypeId: 'work', order: 0 }),
    untyped({ id: 'todo', order: 1 }),
    makeGoal({ id: 'h1', activityTypeId: 'health', order: 2 }),
    makeGoal({ id: 'w2', activityTypeId: 'work', order: 3, status: 'archived' }),
    makeGoal({ id: 'w3', activityTypeId: 'work', order: 4, status: 'completed' }),
  ];
  const ids = (list: readonly Goal[]) => list.map((goal) => goal.id);

  it('shows every goal but the archived ones, in list order, under "All"', () => {
    expect(ids(goalsInList(goals, null))).toEqual(['w1', 'todo', 'h1', 'w3']);
    expect(ids(goalsInList(goals, null, true))).toEqual(['w1', 'todo', 'h1', 'w2', 'w3']);
  });

  it('shows only the filter\'s type, and never an untyped goal, when filtered', () => {
    expect(ids(goalsInList(goals, 'work'))).toEqual(['w1', 'w3']);
    expect(ids(goalsInList(goals, 'work', true))).toEqual(['w1', 'w2', 'w3']);
    expect(ids(goalsInList(goals, 'health'))).toEqual(['h1']);
  });

  it('drops the type column only while filtered', () => {
    expect(showsTypeColumn(null)).toBe(true);
    expect(showsTypeColumn('work')).toBe(false);
  });
});

describe('estimates', () => {
  it.each([
    [undefined, PLACEHOLDER_ESTIMATE_LABEL, true],
    [0, '1hr', true],
    [20, '20min', false],
    [60, '1hr', false],
    [120, '2hrs', false],
    [600, '10hrs', false],
    [90, '1h 30m', false],
  ])('shows %s minutes as %s', (minutes, text, placeholder) => {
    expect(formatGoalEstimate(minutes)).toEqual({ text, placeholder });
  });

  it.each([
    ['12h', { kind: 'set', minutes: 720, echo: '= 12h' }],
    ['10', { kind: 'set', minutes: 600, echo: '= 10h' }],
    ['90m', { kind: 'set', minutes: 90, echo: '= 1h 30m' }],
    ['1h30', { kind: 'set', minutes: 90, echo: '= 1h 30m' }],
    ['', { kind: 'clear', echo: 'No estimate' }],
    ['   ', { kind: 'clear', echo: 'No estimate' }],
  ])('reads a typed %j', (text, expected) => {
    expect(readEstimateDraft(text)).toEqual(expected);
  });

  it('shows the parser\'s error inline for text it cannot read', () => {
    expect(readEstimateDraft('soon')).toEqual({
      kind: 'error',
      error: 'Couldn\'t read "soon". Try 12h, 90m or 1h30.',
    });
    expect(readEstimateDraft('0')).toMatchObject({ kind: 'error' });
  });

  it('opens the field on the stored value, or on 1 for a new row (p56)', () => {
    expect(estimateDraftStart(undefined)).toBe('1');
    expect(estimateDraftStart(720)).toBe('12h');
    expect(estimateDraftStart(90)).toBe('1h30m');
    expect(readEstimateDraft(estimateDraftStart(90))).toMatchObject({ kind: 'set', minutes: 90 });
  });

  it('measures progress only against an estimate', () => {
    expect(goalProgressPercent({ loggedMinutes: 30, estimatedMinutes: 120 })).toBe(25);
    expect(goalProgressPercent({ loggedMinutes: 300, estimatedMinutes: 120 })).toBe(100);
    expect(goalProgressPercent({ loggedMinutes: 30 })).toBeNull();
  });
});

describe('what a goal needs to be scheduled or tracked', () => {
  it('needs both a type and an estimate to be forecast', () => {
    expect(isSchedulableGoal(makeGoal())).toBe(true);
    expect(isSchedulableGoal(untyped())).toBe(false);
    expect(isSchedulableGoal({ ...untyped(), activityTypeId: 'work' })).toBe(false);
    expect(isSchedulableGoal({ ...untyped(), estimatedMinutes: 60 })).toBe(false);
  });

  it('takes tracked time only for its own type', () => {
    expect(goalAcceptsTrackingFor({ activityTypeId: 'work' }, 'work')).toBe(true);
    expect(goalAcceptsTrackingFor({ activityTypeId: 'work' }, 'health')).toBe(false);
    expect(goalAcceptsTrackingFor({}, 'work')).toBe(false);
  });

  it('knows which goals have linked tracking', () => {
    expect([...goalIdsWithLinkedTracking([{ goalId: 'a' }, {}, { goalId: 'a' }, { goalId: 'b' }])])
      .toEqual(['a', 'b']);
  });
});

describe('the line under a row', () => {
  const today = '2026-09-17';

  it('says an untyped goal is not scheduled and cannot take time', () => {
    expect(goalRowHint(untyped(), undefined, today))
      .toBe('No type: not scheduled, and time can’t be tracked to it');
  });

  it('gives a forecast date, or why there is none', () => {
    const goal = makeGoal({ loggedMinutes: 30, estimatedMinutes: 120 });
    expect(goalRowHint(goal, '2026-10-03', today)).toBe('30m / 2h · Done by 3 Oct');
    expect(goalRowHint(goal, '2027-01-05', today)).toBe('30m / 2h · Done by 5 Jan 2027');
    expect(goalRowHint(goal, null, today)).toBe('30m / 2h · No routine time for this type');
    expect(goalRowHint({ ...untyped(), activityTypeId: 'work' }, undefined, today))
      .toBe('No estimate, so no forecast');
  });

  it('marks paused and archived goals, and says nothing for a finished to-do', () => {
    expect(goalRowHint(makeGoal({ status: 'paused' }), undefined, today)).toBe('Paused');
    expect(goalRowHint(makeGoal({ status: 'archived' }), undefined, today)).toBe('Archived');
    expect(goalRowHint(untyped({ status: 'completed' }), undefined, today)).toBeNull();
  });

  it('formats a forecast day', () => {
    expect(formatForecastDay('2026-12-25', today)).toBe('25 Dec');
  });
});

describe('dragging a row (p65–p67)', () => {
  // Rows of different heights: 50, 70, 50, 50, starting at y = 0.
  const layouts: RowLayout[] = [
    { y: 0, height: 50 },
    { y: 50, height: 70 },
    { y: 120, height: 50 },
    { y: 170, height: 50 },
  ];

  it('stays put until the row\'s centre passes a neighbour\'s centre', () => {
    expect(dropIndexForDrag(layouts, 0, 0)).toBe(0);
    // Row 0's centre is at 25; row 1's at 85. 25 + 59 = 84 has not passed it.
    expect(dropIndexForDrag(layouts, 0, 59)).toBe(0);
    expect(dropIndexForDrag(layouts, 0, 61)).toBe(1);
    expect(dropIndexForDrag(layouts, 0, 1000)).toBe(3);
  });

  it('moves up past the rows whose centres it rises above', () => {
    // Row 3's centre is at 195; row 2's at 145, row 1's at 85, row 0's at 25.
    expect(dropIndexForDrag(layouts, 3, -49)).toBe(3);
    expect(dropIndexForDrag(layouts, 3, -51)).toBe(2);
    expect(dropIndexForDrag(layouts, 3, -111)).toBe(1);
    expect(dropIndexForDrag(layouts, 3, -1000)).toBe(0);
  });

  it('ignores a missing row or a bad offset', () => {
    expect(dropIndexForDrag(layouts, 9, 100)).toBe(9);
    expect(dropIndexForDrag(layouts, 1, Number.NaN)).toBe(1);
  });

  it('pushes the rows it passes out of the way by its own height (p66)', () => {
    // Row 0 (50 high) hovering at index 2: rows 1 and 2 move up.
    expect([0, 1, 2, 3].map((i) => rowShiftDuringDrag(i, 0, 2, 50))).toEqual([0, -50, -50, 0]);
    // Row 3 hovering at index 1: rows 1 and 2 move down.
    expect([0, 1, 2, 3].map((i) => rowShiftDuringDrag(i, 3, 1, 50))).toEqual([0, 50, 50, 0]);
    expect([0, 1, 2, 3].map((i) => rowShiftDuringDrag(i, 2, 2, 50))).toEqual([0, 0, 0, 0]);
  });

  it('names the landing place by a visible neighbour', () => {
    const visible = ['a', 'b', 'c', 'd'];
    expect(moveTargetForDrop(visible, 0, 2)).toEqual({ after: 'c' });
    expect(moveTargetForDrop(visible, 3, 0)).toEqual({ before: 'a' });
    expect(moveTargetForDrop(visible, 1, 1)).toBeNull();
    expect(moveTargetForDrop(visible, 1, 99)).toEqual({ after: 'd' });
    expect(moveTargetForDrop(visible, 0, -5)).toBeNull();
    expect(moveTargetForDrop(visible, 7, 0)).toBeNull();
  });

  it('moves one row at a time from the menu, and not past either end', () => {
    const visible = ['a', 'b', 'c'];
    expect(moveTargetForStep(visible, 'b', -1)).toEqual({ before: 'a' });
    expect(moveTargetForStep(visible, 'b', 1)).toEqual({ after: 'c' });
    expect(moveTargetForStep(visible, 'a', -1)).toBeNull();
    expect(moveTargetForStep(visible, 'c', 1)).toBeNull();
    expect(moveTargetForStep(visible, 'x', 1)).toBeNull();
  });
});

describe('list order after a drag in a filtered list (p65–p67)', () => {
  // The whole list, mixed types: W1 H1 W2 T W3 (T has no type).
  const all = [
    makeGoal({ id: 'W1', activityTypeId: 'work', order: 0 }),
    makeGoal({ id: 'H1', activityTypeId: 'health', order: 1 }),
    makeGoal({ id: 'W2', activityTypeId: 'work', order: 2 }),
    untyped({ id: 'T', order: 3 }),
    makeGoal({ id: 'W3', activityTypeId: 'work', order: 4 }),
  ];
  const layoutsOf = (count: number): RowLayout[] =>
    Array.from({ length: count }, (_, i) => ({ y: i * 52, height: 52 }));

  function dragInFilter(filter: string | null, goalId: string, dy: number) {
    const visible = goalsInList(all, filter).map((goal) => goal.id);
    const from = visible.indexOf(goalId);
    const to = dropIndexForDrag(layoutsOf(visible.length), from, dy);
    const target = moveTargetForDrop(visible, from, to);
    return target ? moveGoalInList(all, goalId, target, LATER) : all;
  }

  it('drags the bottom Work goal to the top of the Work list; other rows keep their places', () => {
    const moved = dragInFilter('work', 'W3', -2 * 52 - 10);
    expect(moved.map((goal) => goal.id)).toEqual(['W3', 'W1', 'H1', 'W2', 'T']);
    expect(moved.map((goal) => goal.order)).toEqual([0, 1, 2, 3, 4]);
    expect(goalsInList(moved, 'work').map((goal) => goal.id)).toEqual(['W3', 'W1', 'W2']);
  });

  it('drags the top Work goal down one Work row, past the hidden Health goal', () => {
    const moved = dragInFilter('work', 'W1', 60);
    expect(moved.map((goal) => goal.id)).toEqual(['H1', 'W2', 'W1', 'T', 'W3']);
  });

  it('drags an untyped goal to the top of the whole list', () => {
    const moved = dragInFilter(null, 'T', -3 * 52 - 10);
    expect(moved.map((goal) => goal.id)).toEqual(['T', 'W1', 'H1', 'W2', 'W3']);
  });

  it('leaves the list alone for a drag too short to pass anything', () => {
    expect(dragInFilter('work', 'W2', 10)).toBe(all);
  });
});
