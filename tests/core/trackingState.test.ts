import { describe, expect, it } from 'vitest';

import {
  describeUntrackedRow,
  findCurrentOccurrence,
  getBlockRing,
  getBlockTrackingState,
  getTodayOccurrences,
  getUntrackedOverlays,
  type ScheduledSpan,
  type TrackingStateEntry,
} from '../../src/core/engine/trackingState';
import { makeRoutineBlock } from '../helpers/builders';

const WORK = 'activity-work';
const HEALTH = 'activity-health';

// 22 Sep 2026 is a Tuesday, the day on p73–p77. Local time, built inside functions.
const tue = (hours: number, minutes = 0, seconds = 0) => new Date(2026, 8, 22, hours, minutes, seconds);
const t = (hours: number, minutes = 0) => tue(hours, minutes).getTime();
const isoAt = (hours: number, minutes = 0) => tue(hours, minutes).toISOString();

/** p73's first row: Work, 10.15–12.45. */
function workBlock(overrides: Partial<ScheduledSpan> = {}): ScheduledSpan {
  return { blockId: 'work-am', activityTypeId: WORK, start: t(10, 15), end: t(12, 45), ...overrides };
}

function entry(overrides: Partial<TrackingStateEntry> = {}): TrackingStateEntry {
  return { activityTypeId: WORK, startTime: isoAt(10, 40), ...overrides };
}

const minutes = (spans: { start: number; end: number }[]) =>
  spans.map((span) => [(span.start - t(0)) / 60000, (span.end - t(0)) / 60000]);

describe('getBlockTrackingState (#54, p77)', () => {
  it('p77: started some time after the scheduled start, and later paused', () => {
    // Scheduled 10:15. Tracking confirmed at 10:40, paused at 11:30; it is now 11:50.
    const running = entry({ pauses: [{ start: isoAt(11, 30) }] });
    const result = getBlockTrackingState(workBlock(), [running], tue(11, 50));
    expect(result.state).toBe('paused');
    // "Time spent not tracking": the late start and the pause, as two grey wedges.
    expect(minutes(result.untrackedSpans)).toEqual([[615, 640], [690, 710]]);
    expect(result.trackedMs).toBe(50 * 60000);
  });

  it('p77 resumed: tracking again, the pause stays grey', () => {
    const running = entry({ pauses: [{ start: isoAt(11, 30), end: isoAt(11, 50) }] });
    const result = getBlockTrackingState(workBlock(), [running], tue(12, 0));
    expect(result.state).toBe('tracking');
    expect(minutes(result.untrackedSpans)).toEqual([[615, 640], [690, 710]]);
  });

  it('never confirmed: started, and all of it so far is untracked', () => {
    const result = getBlockTrackingState(workBlock(), [], tue(11, 0));
    expect(result.state).toBe('started');
    expect(minutes(result.untrackedSpans)).toEqual([[615, 660]]);
    expect(result.trackedMs).toBe(0);
  });

  it('never confirmed and over: the whole block is untracked', () => {
    const result = getBlockTrackingState(workBlock(), [], tue(13, 0));
    expect(result.state).toBe('ended');
    expect(minutes(result.untrackedSpans)).toEqual([[615, 765]]);
  });

  it('stopped early: back to started, and the time after the stop is untracked', () => {
    const stopped = entry({ startTime: isoAt(10, 15), endTime: isoAt(11, 15) });
    const during = getBlockTrackingState(workBlock(), [stopped], tue(11, 45));
    expect(during.state).toBe('started');
    expect(minutes(during.untrackedSpans)).toEqual([[675, 705]]);
    const after = getBlockTrackingState(workBlock(), [stopped], tue(14, 0));
    expect(after.state).toBe('ended');
    expect(minutes(after.untrackedSpans)).toEqual([[675, 765]]);
  });

  it('upcoming: nothing is untracked yet', () => {
    const result = getBlockTrackingState(workBlock(), [], tue(9, 0));
    expect(result).toEqual({ state: 'upcoming', untrackedSpans: [], trackedMs: 0 });
  });

  it('tracking the whole block leaves no grey, even from an entry started before it', () => {
    const early = entry({ startTime: isoAt(10, 0) });
    const result = getBlockTrackingState(workBlock(), [early], tue(12, 0));
    expect(result.state).toBe('tracking');
    expect(result.untrackedSpans).toEqual([]);
    expect(result.trackedMs).toBe(105 * 60000);
  });

  it('only counts entries of the block\'s type', () => {
    const other = entry({ activityTypeId: HEALTH, startTime: isoAt(10, 15) });
    const result = getBlockTrackingState(workBlock(), [other], tue(11, 0));
    expect(result.state).toBe('started');
    expect(minutes(result.untrackedSpans)).toEqual([[615, 660]]);
  });

  it('merges overlapping entries of the type', () => {
    const one = entry({ startTime: isoAt(10, 15), endTime: isoAt(11, 0) });
    const two = entry({ startTime: isoAt(10, 45), endTime: isoAt(11, 30) });
    const result = getBlockTrackingState(workBlock(), [one, two], tue(12, 45));
    expect(minutes(result.untrackedSpans)).toEqual([[690, 765]]);
    expect(result.trackedMs).toBe(75 * 60000);
  });

  it('overnight: a 23:00–01:00 block, tracked from 23:30, is still running after midnight', () => {
    const night: ScheduledSpan = {
      blockId: 'night', activityTypeId: WORK, start: t(23, 0), end: new Date(2026, 8, 23, 1, 0).getTime(),
    };
    const running = entry({ startTime: isoAt(23, 30) });
    const result = getBlockTrackingState(night, [running], new Date(2026, 8, 23, 0, 30));
    expect(result.state).toBe('tracking');
    expect(minutes(result.untrackedSpans)).toEqual([[1380, 1410]]);
  });
});

describe('dated blocks for today', () => {
  const blocks = [
    makeRoutineBlock({ id: 'am', dayOfWeek: 2, startMinutes: 615, endMinutes: 765, activityTypeId: WORK }),
    makeRoutineBlock({ id: 'mon-night', dayOfWeek: 1, startMinutes: 1380, endMinutes: 60, activityTypeId: HEALTH }),
    makeRoutineBlock({ id: 'tue-night', dayOfWeek: 2, startMinutes: 1380, endMinutes: 90, activityTypeId: HEALTH }),
    makeRoutineBlock({ id: 'wed', dayOfWeek: 3, startMinutes: 600, endMinutes: 660, activityTypeId: WORK }),
  ];

  it('includes yesterday\'s overnight tail and today\'s blocks, in order', () => {
    const occurrences = getTodayOccurrences(blocks, tue(12, 0));
    expect(occurrences.map((occurrence) => [occurrence.blockId, occurrence.start, occurrence.end])).toEqual([
      ['mon-night', new Date(2026, 8, 21, 23, 0).getTime(), t(1, 0)],
      ['am', t(10, 15), t(12, 45)],
      ['tue-night', t(23, 0), new Date(2026, 8, 23, 1, 30).getTime()],
    ]);
  });

  it('finds the running entry\'s own block, else one of its type, else what is on now', () => {
    const occurrences = getTodayOccurrences(blocks, tue(11, 0));
    expect(findCurrentOccurrence(occurrences, tue(11, 0), { activityTypeId: WORK, routineBlockId: 'am' })?.blockId).toBe('am');
    expect(findCurrentOccurrence(occurrences, tue(11, 0), { activityTypeId: WORK })?.blockId).toBe('am');
    expect(findCurrentOccurrence(occurrences, tue(11, 0), { activityTypeId: HEALTH })).toBeUndefined();
    expect(findCurrentOccurrence(occurrences, tue(11, 0), null)?.blockId).toBe('am');
    expect(findCurrentOccurrence(occurrences, tue(13, 0), null)).toBeUndefined();
  });
});

describe('getUntrackedOverlays (Wave C exit criterion 5)', () => {
  const blocks = [
    makeRoutineBlock({ id: 'breakfast', dayOfWeek: 2, startMinutes: 480, endMinutes: 540, activityTypeId: HEALTH }),
    makeRoutineBlock({ id: 'am', dayOfWeek: 2, startMinutes: 615, endMinutes: 765, activityTypeId: WORK }),
    makeRoutineBlock({ id: 'pm', dayOfWeek: 2, startMinutes: 870, endMinutes: 1020, activityTypeId: WORK }),
    makeRoutineBlock({ id: 'mon-night', dayOfWeek: 1, startMinutes: 1380, endMinutes: 60, activityTypeId: HEALTH }),
  ];

  it('greys a past block that was never confirmed and the untracked part of the current one', () => {
    const running = entry({ pauses: [{ start: isoAt(11, 30) }] });
    const overlays = getUntrackedOverlays(blocks, [running], tue(11, 50));
    expect(overlays.map((overlay) => [overlay.startMinutes, overlay.endMinutes])).toEqual([
      [0, 60],      // yesterday's overnight block, from midnight
      [480, 540],   // breakfast, never confirmed
      [615, 640],   // late start
      [690, 710],   // the pause, up to now
    ]);
    expect(overlays.every((overlay) => overlay.style === 'untracked')).toBe(true);
    expect(new Set(overlays.map((overlay) => overlay.key)).size).toBe(overlays.length);
  });

  it('draws nothing for a fully tracked past block or a future one', () => {
    const tracked = [
      entry({ activityTypeId: HEALTH, startTime: new Date(2026, 8, 21, 23, 0).toISOString(), endTime: isoAt(9, 0) }),
      entry({ startTime: isoAt(10, 15), endTime: isoAt(12, 45) }),
    ];
    expect(getUntrackedOverlays(blocks, tracked, tue(13, 0))).toEqual([]);
  });

  it('keeps today\'s overnight block to today', () => {
    const late = [makeRoutineBlock({ id: 'tue-night', dayOfWeek: 2, startMinutes: 1380, endMinutes: 60 })];
    const overlays = getUntrackedOverlays(late, [], tue(23, 30));
    expect(overlays.map((overlay) => [overlay.startMinutes, overlay.endMinutes])).toEqual([[1380, 1410]]);
  });
});

describe('getBlockRing (the pie\'s grey wedges, p77)', () => {
  it('reads clockwise from the block\'s start: grey, tracked, grey, then what is ahead', () => {
    const running = entry({ pauses: [{ start: isoAt(11, 30) }] });
    const ring = getBlockRing(workBlock(), [running], tue(11, 50));
    expect(ring.map((segment) => [segment.kind, segment.ms / 60000])).toEqual([
      ['untracked', 25],
      ['tracked', 50],
      ['untracked', 20],
      ['ahead', 55],
    ]);
    expect(ring.reduce((total, segment) => total + segment.ms, 0)).toBe(150 * 60000);
  });

  it('is all ahead before the block and has no ahead part after it', () => {
    expect(getBlockRing(workBlock(), [], tue(9, 0))).toEqual([{ kind: 'ahead', ms: 150 * 60000 }]);
    expect(getBlockRing(workBlock(), [], tue(13, 0))).toEqual([{ kind: 'untracked', ms: 150 * 60000 }]);
  });
});

describe('describeUntrackedRow (Day Overview)', () => {
  const row = { activityTypeId: WORK, blockId: 'am', startMinutes: 615, endMinutes: 765, state: 'past' };

  it('says "Not tracked" for a past row nobody confirmed', () => {
    expect(describeUntrackedRow(row, [], tue(13, 0))).toBe('Not tracked');
  });

  it('says how much was missed when part was tracked', () => {
    const partial = entry({ startTime: isoAt(10, 15), endTime: isoAt(11, 0) });
    expect(describeUntrackedRow(row, [partial], tue(13, 0))).toBe('1h 45m not tracked');
  });

  it('says nothing when all of it was tracked, or the row is not past', () => {
    const full = entry({ startTime: isoAt(10, 15), endTime: isoAt(12, 45) });
    expect(describeUntrackedRow(row, [full], tue(13, 0))).toBe('');
    expect(describeUntrackedRow({ ...row, state: 'current' }, [], tue(11, 0))).toBe('');
  });
});
