import { describe, expect, it } from 'vitest';
import {
  blockDurationLabel,
  findNextAvailableSlot,
  nearestTimeOptionIndex,
  timeDraftMessage,
  timeOptions,
} from '../../src/components/routine/timeFields';
import { makeRoutineBlock } from '../helpers/builders';

describe('timeOptions', () => {
  it('offers every 15 minutes of the day, midnight to 23:45', () => {
    const options = timeOptions();
    expect(options).toHaveLength(96);
    expect(options[0]).toBe(0);
    expect(options[37]).toBe(9 * 60 + 15);
    expect(options[options.length - 1]).toBe(23 * 60 + 45);
  });
});

describe('nearestTimeOptionIndex', () => {
  it('finds the exact option, or the closest one for an off-grid typed time', () => {
    const options = timeOptions();
    expect(nearestTimeOptionIndex(options, 9 * 60 + 15)).toBe(37);
    expect(nearestTimeOptionIndex(options, 9 * 60 + 22)).toBe(37);
    expect(nearestTimeOptionIndex(options, 9 * 60 + 23)).toBe(38);
    expect(nearestTimeOptionIndex(options, 23 * 60 + 59)).toBe(95);
  });
});

describe('blockDurationLabel', () => {
  it('formats with formatDuration', () => {
    expect(blockDurationLabel(9 * 60 + 15, 17 * 60)).toBe('7h 45m');
    expect(blockDurationLabel(9 * 60, 12 * 60)).toBe('3h');
    expect(blockDurationLabel(9 * 60, 9 * 60 + 30)).toBe('30m');
  });

  it('labels an end before the start as overnight', () => {
    expect(blockDurationLabel(23 * 60, 7 * 60)).toBe('8h (overnight)');
  });
});

describe('timeDraftMessage', () => {
  it('is empty when both typed times parse', () => {
    expect(timeDraftMessage({})).toBeUndefined();
    expect(timeDraftMessage({ start: { revealed: true }, end: { revealed: false } }, true)).toBeUndefined();
  });

  it('hides an error while the user is still typing, but not from Save', () => {
    const drafts = { end: { error: 'bad', revealed: false } };
    expect(timeDraftMessage(drafts)).toBeUndefined();
    expect(timeDraftMessage(drafts, true)).toBe('End: bad');
  });

  it('names each field once its error is revealed', () => {
    expect(
      timeDraftMessage({
        start: { error: 'bad start', revealed: true },
        end: { error: 'bad end', revealed: true },
      })
    ).toBe('Start: bad start\nEnd: bad end');
  });
});

describe('findNextAvailableSlot', () => {
  it('defaults a new block on an empty day to one hour, 09:00–10:00', () => {
    expect(findNextAvailableSlot([], 1)).toEqual({ start: 540, end: 600 });
  });

  it('uses the first free hour, one hour long', () => {
    const blocks = [
      makeRoutineBlock({ id: 'a', startMinutes: 0, endMinutes: 420 }),
      makeRoutineBlock({ id: 'b', startMinutes: 450, endMinutes: 600 }),
      makeRoutineBlock({ id: 'c', startMinutes: 720, endMinutes: 780 }),
    ];
    expect(findNextAvailableSlot(blocks, 1)).toEqual({ start: 600, end: 660 });
  });

  it('goes after the last block, ignoring other days', () => {
    const blocks = [
      makeRoutineBlock({ id: 'a', startMinutes: 0, endMinutes: 1000 }),
      makeRoutineBlock({ id: 'other-day', dayOfWeek: 2, startMinutes: 1000, endMinutes: 1100 }),
    ];
    expect(findNextAvailableSlot(blocks, 1)).toEqual({ start: 1000, end: 1060 });
  });

  it('never ends past 23:59 and falls back to the morning when the day is full', () => {
    const late = [makeRoutineBlock({ startMinutes: 0, endMinutes: 1379 })];
    expect(findNextAvailableSlot(late, 1)).toEqual({ start: 1379, end: 1439 });
    const full = [makeRoutineBlock({ startMinutes: 0, endMinutes: 1380 })];
    expect(findNextAvailableSlot(full, 1)).toEqual({ start: 540, end: 600 });
  });
});
