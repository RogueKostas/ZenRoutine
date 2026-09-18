import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { predictAllGoals } from '../../src/core/engine/prediction';
import { makeGoal, makeRoutine, makeRoutineBlock } from '../helpers/builders';

const WEEK_MINUTES = 7 * 24 * 60;
const originalTimeZone = process.env.TZ;

/**
 * The forecast is laid out on the local wall clock, so it must read the same in any zone,
 * including across a DST change. Each case is a Monday-to-Monday week that contains its zone's
 * change: America/Los_Angeles springs forward on 8 March 2026 (a 167-hour week), and
 * Pacific/Auckland, far east of UTC, falls back on 5 April 2026 (a 169-hour week).
 */
describe.each([
  { timeZone: 'America/Los_Angeles', monday: [2026, 2, 2], nextMonday: '2026-03-09' },
  { timeZone: 'Pacific/Auckland', monday: [2026, 2, 30], nextMonday: '2026-04-06' },
] as const)('forecast in $timeZone, across its DST change', ({ timeZone, monday, nextMonday }) => {
  beforeAll(() => {
    process.env.TZ = timeZone;
  });

  afterAll(() => {
    process.env.TZ = originalTimeZone;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts weeks remaining on the wall clock, not in elapsed hours', () => {
    const [year, month, day] = monday;
    // Built inside the test, after the switch to `timeZone`: Monday 08:00 local.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(year, month, day, 8, 0));
    const routine = makeRoutine({
      updatedAt: '2026-02-01T00:00:00.000Z',
      blocks: [makeRoutineBlock({ endMinutes: 9 * 60 + 300 })],
    });

    // 300 today from 09:00, then 200 next Monday from 09:00: done 12:20, a week and 4h20m on.
    const [prediction] = predictAllGoals([makeGoal({ estimatedMinutes: 500 })], routine);

    expect(prediction.predictedCompletionDate).toBe(nextMonday);
    expect(prediction.weeksRemaining).toBe((WEEK_MINUTES + 260) / WEEK_MINUTES);
  });
});
