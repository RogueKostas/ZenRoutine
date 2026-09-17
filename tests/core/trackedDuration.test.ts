import { describe, expect, it } from 'vitest';

import {
  getTrackedMilliseconds,
  getTrackedSeconds,
  getTrackedSpans,
  getTrackingEntryDurationMinutes,
  isTrackingEntryPaused,
} from '../../src/core/utils/time';
import { getTrackedBreakdown } from '../../src/core/engine/analytics';
import { getDayOverview } from '../../src/core/engine/dayOverview';
import { predictGoalCompletion } from '../../src/core/engine/prediction';
import type { TrackingEntry } from '../../src/core/types';
import {
  makeActivityType,
  makeGoal,
  makeRoutine,
  makeRoutineBlock,
  makeTrackingEntry,
} from '../helpers/builders';

const iso = (hours: number, minutes = 0) =>
  `2026-03-02T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`;
const ms = (hours: number, minutes = 0) => Date.parse(iso(hours, minutes));

/** 09:00–10:00 with a pause 09:15–09:35: 40 minutes tracked. */
const pausedEntry = makeTrackingEntry({
  startTime: iso(9),
  endTime: iso(10),
  pauses: [{ start: iso(9, 15), end: iso(9, 35) }],
});

describe('tracked time is (end − start) − paused time (#54)', () => {
  it('splits an entry at its pauses', () => {
    expect(getTrackedSpans(pausedEntry)).toEqual([
      { start: ms(9), end: ms(9, 15) },
      { start: ms(9, 35), end: ms(10) },
    ]);
    expect(getTrackingEntryDurationMinutes(pausedEntry)).toBe(40);
  });

  it('keeps an unpaused entry\'s duration, rounding and all', () => {
    const entry = makeTrackingEntry({ startTime: iso(9), endTime: '2026-03-02T10:30:30.000Z' });
    expect(getTrackingEntryDurationMinutes(entry)).toBe(91);
    expect(getTrackingEntryDurationMinutes({ ...entry, pauses: [] })).toBe(91);
    expect(getTrackingEntryDurationMinutes({ ...entry, endTime: entry.startTime })).toBe(0);
    expect(getTrackingEntryDurationMinutes({ ...entry, endTime: undefined })).toBe(0);
  });

  it('rounds the total once, not each piece', () => {
    // Two 30-second pieces: each would round to 1 or 0; together they are one minute.
    const entry = makeTrackingEntry({
      startTime: iso(9),
      endTime: '2026-03-02T09:01:00.000Z',
      pauses: [{ start: '2026-03-02T09:00:30.000Z', end: '2026-03-02T09:00:30.000Z' }],
    });
    expect(getTrackingEntryDurationMinutes(entry)).toBe(1);
  });

  it('never lets a stray pause add time', () => {
    const entry = makeTrackingEntry({
      startTime: iso(9),
      endTime: iso(10),
      pauses: [{ start: iso(8), end: iso(9, 30) }, { start: iso(9, 50), end: iso(11) }],
    });
    expect(getTrackingEntryDurationMinutes(entry)).toBe(20);
  });

  it('runs a live entry to now and an open pause to now', () => {
    const running = makeTrackingEntry({
      startTime: iso(9),
      endTime: undefined,
      pauses: [{ start: iso(9, 15), end: iso(9, 20) }, { start: iso(9, 30) }],
    });
    expect(isTrackingEntryPaused(running)).toBe(true);
    expect(getTrackedSeconds(running, ms(9, 30))).toBe(25 * 60);
    // Paused: the count stands still.
    expect(getTrackedSeconds(running, ms(9, 55))).toBe(25 * 60);
    expect(getTrackedMilliseconds(running)).toBe(0);
    expect(getTrackingEntryDurationMinutes(running)).toBe(0);
  });

  it('is not paused once the entry has ended', () => {
    expect(isTrackingEntryPaused({ endTime: iso(10), pauses: [{ start: iso(9) }] })).toBe(false);
    expect(isTrackingEntryPaused({ endTime: undefined })).toBe(false);
  });
});

describe('every duration consumer leaves paused time out', () => {
  it('analytics: the week\'s tracked breakdown', () => {
    const breakdown = getTrackedBreakdown([pausedEntry], '2026-03-02', [makeActivityType()]);
    expect(breakdown).toHaveLength(1);
    expect(breakdown[0].actualMinutes).toBe(40);
  });

  it('analytics: an entry clipped at the week\'s edge loses only its paused time inside the week', () => {
    // Local midnight at the start of the week, whatever the host zone.
    const weekStart = new Date(2026, 2, 2, 0, 0).getTime();
    const entry = makeTrackingEntry({
      startTime: new Date(weekStart - 30 * 60000).toISOString(),
      endTime: new Date(weekStart + 30 * 60000).toISOString(),
      pauses: [{
        start: new Date(weekStart - 20 * 60000).toISOString(),
        end: new Date(weekStart + 10 * 60000).toISOString(),
      }],
    });
    const breakdown = getTrackedBreakdown([entry], '2026-03-02', [makeActivityType()]);
    expect(breakdown[0].actualMinutes).toBe(20);
  });

  it('Day Overview: a past row\'s running total and a running entry\'s minutes', () => {
    // Local times on Monday 2 March 2026.
    const local = (hours: number, minutes = 0) => new Date(2026, 2, 2, hours, minutes);
    const routine = makeRoutine({
      blocks: [makeRoutineBlock({ id: 'am', dayOfWeek: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 })],
    });
    const goal = { ...makeGoal({ estimatedMinutes: 600, loggedMinutes: 40 }), name: 'Focus' };
    const done: TrackingEntry = makeTrackingEntry({
      goalId: goal.id,
      startTime: local(9).toISOString(),
      endTime: local(10).toISOString(),
      pauses: [{ start: local(9, 15).toISOString(), end: local(9, 35).toISOString() }],
    });
    const [past] = getDayOverview({ routine, goals: [goal], trackingEntries: [done], now: local(11) });
    expect(past.state).toBe('past');
    // 0 before today + 40 tracked today.
    expect(past.trackedMinutes).toBe(40);

    const running: TrackingEntry = {
      ...done,
      endTime: undefined,
      pauses: [{ start: local(9, 15).toISOString() }],
    };
    const [current] = getDayOverview({
      routine,
      goals: [{ ...goal, loggedMinutes: 0 }],
      trackingEntries: [running],
      now: local(9, 45),
    });
    expect(current.state).toBe('current');
    // Tracked so far: 15 minutes (paused since 09:15), then 15 more minutes of plan to 10:00.
    expect(current.trackedMinutes).toBe(15 + 15);
  });

  it('forecast evidence: an entry that was paused throughout is no evidence', () => {
    const routine = makeRoutine({ blocks: [makeRoutineBlock()] });
    const goal = makeGoal();
    const allPaused = makeTrackingEntry({
      startTime: iso(9),
      endTime: iso(10),
      pauses: [{ start: iso(9), end: iso(10) }],
    });
    const worked = makeTrackingEntry({ id: 'entry-worked' });
    const history = (entry: TrackingEntry) =>
      predictGoalCompletion(goal, routine, [entry], new Date('2026-03-03T12:00:00.000Z'));
    expect(history(allPaused).evidenceDays).toBe(0);
    expect(history(worked).evidenceDays).toBe(1);
  });
});
