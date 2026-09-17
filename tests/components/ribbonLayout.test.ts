import { describe, expect, it } from 'vitest';
import type { DayOfWeek, RoutineBlock } from '../../src/core/types';
import {
  DEFAULT_RIBBON_WINDOW,
  RibbonLabel,
  RIBBON_LABEL_DEFAULTS,
  blockSpansOnDay,
  formatRibbonEdgeLabel,
  hitTestSegment,
  layoutRibbonLabels,
  layoutRibbonOverlays,
  layoutRibbonSegments,
  layoutRibbonTicks,
  nowMarkerFraction,
  ribbonGeometry,
  ribbonSegmentLabel,
  tickLabelStep,
} from '../../src/components/ribbon/ribbonLayout';
import { msUntilNextTick } from '../../src/components/ribbon/useNow';
import { makeActivityType, makeRoutineBlock } from '../helpers/builders';

const hm = (text: string) => {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
};

const block = (id: string, start: string, end: string, dayOfWeek: DayOfWeek = 1): RoutineBlock =>
  makeRoutineBlock({ id, dayOfWeek, startMinutes: hm(start), endMinutes: hm(end) });

// DESIGN-2019 §4.2, the p24 sample Monday (times as transcribed, 24-hour).
const P24_MONDAY: ReadonlyArray<[string, string, string]> = [
  ['Morning Hygiene', '07:00', '07:30'],
  ['Breakfast', '07:30', '08:15'],
  ['Commute', '08:15', '09:00'],
  ['Morning Workout', '09:00', '09:30'],
  ['Shower', '09:30', '09:50'],
  ['Commute', '09:50', '10:15'],
  ['Work', '10:15', '13:00'],
  ['Commute', '13:00', '13:10'],
  ['Lunchtime Workout', '13:10', '13:55'],
  ['Shower', '13:55', '14:05'],
  ['Commute', '14:05', '14:20'],
  ['Lunch', '14:20', '14:35'],
  ['Work', '14:35', '17:00'],
  ['Commute', '17:00', '18:00'],
  ['Dinner', '18:00', '19:00'],
  ['Family Time', '19:00', '19:50'],
  ['Entertainment', '19:50', '22:00'],
  ['Reading', '22:00', '23:00'],
];

// Ribbon track width inside Home's card: viewport − 2×24 margin − 2×16 padding − 2 border.
const WIDE_PX = 1920 - 48 - 32 - 2;
const NARROW_PX = 400 - 48 - 32 - 2;

function p24LabelInputs(widthPx: number) {
  const blocks = P24_MONDAY.map(([, start, end], index) => block(`p24-${index}`, start, end));
  const names = new Map(blocks.map((b, index) => [b.id, P24_MONDAY[index][0]]));
  return layoutRibbonSegments(blocks, { day: 1 }).map((segment) => ({
    key: segment.key,
    text: names.get(segment.block.id)!,
    anchorPx: (segment.x + segment.width / 2) * widthPx,
  }));
}

/** Every rule a reader would call a collision, checked pairwise. */
function expectNoCollisions(labels: readonly RibbonLabel[], widthPx: number) {
  const epsilon = 1e-9;
  for (const label of labels) {
    expect(label.leftPx).toBeGreaterThanOrEqual(-epsilon);
    expect(label.leftPx + label.widthPx).toBeLessThanOrEqual(widthPx + epsilon);
    expect(label.widthPx).toBeGreaterThanOrEqual(RIBBON_LABEL_DEFAULTS.minLabelPx - epsilon);
    // The leader line starts under the label.
    expect(label.anchorPx).toBeGreaterThanOrEqual(label.leftPx - epsilon);
    expect(label.anchorPx).toBeLessThanOrEqual(label.leftPx + label.widthPx + epsilon);
  }
  for (const a of labels) {
    for (const b of labels) {
      if (a === b) continue;
      if (a.tier === b.tier) {
        const [first, second] = a.leftPx <= b.leftPx ? [a, b] : [b, a];
        expect(first.leftPx + first.widthPx + RIBBON_LABEL_DEFAULTS.gapPx).toBeLessThanOrEqual(
          second.leftPx + epsilon
        );
      } else if (a.tier > b.tier) {
        // a's leader runs down through b's tier and must miss b's box.
        const insideB = a.anchorPx >= b.leftPx && a.anchorPx <= b.leftPx + b.widthPx;
        expect(insideB, `${a.key} leader crosses ${b.key}`).toBe(false);
      }
    }
  }
}

describe('ribbon segments', () => {
  it('maps blocks to fractions of the default 7am–11pm window', () => {
    const [segment] = layoutRibbonSegments([block('work', '09:00', '10:00')], { day: 1 });
    expect(segment.x).toBeCloseTo(2 / 16);
    expect(segment.width).toBeCloseTo(1 / 16);
    expect(segment.clippedStart).toBe(false);
    expect(segment.clippedEnd).toBe(false);
  });

  it('uses a configured window', () => {
    const [segment] = layoutRibbonSegments([block('work', '09:00', '10:00')], {
      day: 1,
      window: { startMinutes: hm('08:00'), endMinutes: hm('12:00') },
    });
    expect(segment.x).toBeCloseTo(0.25);
    expect(segment.width).toBeCloseTo(0.25);
  });

  it('falls back to the default window when the configured one is empty or out of range', () => {
    for (const window of [
      { startMinutes: 600, endMinutes: 600 },
      { startMinutes: 900, endMinutes: 600 },
      { startMinutes: -10, endMinutes: 600 },
      { startMinutes: 0, endMinutes: 1441 },
    ]) {
      const [segment] = layoutRibbonSegments([block('work', '09:00', '10:00')], { day: 1, window });
      expect(segment.x).toBeCloseTo(2 / 16);
    }
    expect(DEFAULT_RIBBON_WINDOW).toEqual({ startMinutes: 420, endMinutes: 1380 });
  });

  it('clips blocks that cross the window edges and drops blocks outside it', () => {
    const segments = layoutRibbonSegments(
      [
        block('early', '05:00', '06:30'),
        block('wake', '06:00', '08:00'),
        block('late', '22:00', '23:30'),
      ],
      { day: 1 }
    );
    expect(segments.map((s) => s.key)).toEqual(['wake', 'late']);
    const [wake, late] = segments;
    expect(wake).toMatchObject({ startMinutes: 420, endMinutes: 480, x: 0, clippedStart: true, clippedEnd: false });
    expect(wake.width).toBeCloseTo(1 / 16);
    expect(late).toMatchObject({ startMinutes: 1320, endMinutes: 1380, clippedStart: false, clippedEnd: true });
    expect(late.x + late.width).toBeCloseTo(1);
  });

  it('shows only the in-window part of an overnight block on its own day', () => {
    const [segment] = layoutRibbonSegments([block('night', '22:00', '02:00', 1)], { day: 1 });
    expect(segment).toMatchObject({ startMinutes: 1320, endMinutes: 1380, clippedEnd: true, carryover: false });
    expect(segment.x).toBeCloseTo(15 / 16);
  });

  it("shows the morning tail of the previous day's overnight block, and wraps Saturday → Sunday", () => {
    const sleep = block('sleep', '23:00', '08:00', 0); // Sunday night into Monday
    const [tail] = layoutRibbonSegments([sleep], { day: 1 });
    expect(tail).toMatchObject({ key: 'sleep:carryover', startMinutes: 420, endMinutes: 480, carryover: true, clippedStart: true });
    // Sunday itself: 23:00 is the window end, so nothing is visible on 7–23.
    expect(layoutRibbonSegments([sleep], { day: 0 })).toEqual([]);

    const saturdayNight = block('sat', '22:00', '07:30', 6);
    const [sundayTail] = layoutRibbonSegments([saturdayNight], { day: 0 });
    expect(sundayTail).toMatchObject({ startMinutes: 420, endMinutes: 450, carryover: true });
  });

  it('splits an overnight block over a full-day window', () => {
    const night = block('night', '22:00', '02:00', 3);
    expect(blockSpansOnDay(night, 3)).toEqual([{ startMinutes: 1320, endMinutes: 1440, carryover: false }]);
    expect(blockSpansOnDay(night, 4)).toEqual([{ startMinutes: 0, endMinutes: 120, carryover: true }]);
    expect(blockSpansOnDay(night, 5)).toEqual([]);
    const fullDay = { startMinutes: 0, endMinutes: 1440 };
    const [thursday] = layoutRibbonSegments([night], { day: 4, window: fullDay });
    expect(thursday.x).toBe(0);
    expect(thursday.width).toBeCloseTo(120 / 1440);
  });

  it("ignores other days' blocks when a day is given, and orders segments by start", () => {
    const segments = layoutRibbonSegments(
      [block('b', '12:00', '13:00', 1), block('other', '08:00', '09:00', 2), block('a', '08:00', '09:00', 1)],
      { day: 1 }
    );
    expect(segments.map((s) => s.key)).toEqual(['a', 'b']);
    // Without a day every block is taken to be the displayed day's.
    expect(layoutRibbonSegments([block('other', '08:00', '09:00', 2)])).toHaveLength(1);
  });
});

describe('ribbon overlays', () => {
  it('positions caller-supplied spans without computing them, clipped to the window', () => {
    const overlays = layoutRibbonOverlays([
      { startMinutes: hm('10:00'), endMinutes: hm('10:30'), style: 'untracked' },
      { key: 'late', startMinutes: hm('22:30'), endMinutes: hm('01:00'), style: 'untracked' },
      { startMinutes: hm('03:00'), endMinutes: hm('04:00'), style: 'untracked' },
    ]);
    expect(overlays).toHaveLength(2);
    expect(overlays[0]).toMatchObject({ key: 'overlay-0', style: 'untracked', startMinutes: 600, endMinutes: 630 });
    expect(overlays[0].x).toBeCloseTo(3 / 16);
    expect(overlays[0].width).toBeCloseTo(0.5 / 16);
    expect(overlays[1]).toMatchObject({ key: 'late', startMinutes: 1350, endMinutes: 1380 });
  });
});

describe('ribbon hour ticks', () => {
  it('labels every interior hour 8 … 10 in 12-hour numbers when there is room (p24)', () => {
    const ticks = layoutRibbonTicks(undefined, WIDE_PX);
    expect(ticks.map((t) => t.label)).toEqual(
      ['8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    );
    expect(ticks[0].x).toBeCloseTo(1 / 16);
    expect(ticks[14].x).toBeCloseTo(15 / 16);
  });

  it('thins labels to every other hour below ~480px but keeps every tick mark', () => {
    expect(tickLabelStep(480)).toBe(1);
    expect(tickLabelStep(479)).toBe(2);
    const ticks = layoutRibbonTicks(undefined, NARROW_PX);
    expect(ticks).toHaveLength(15);
    expect(ticks.filter((t) => t.label).map((t) => t.label)).toEqual(['9', '11', '1', '3', '5', '7', '9']);
  });

  it('drops hour labels that would run into the end labels', () => {
    const window = { startMinutes: hm('07:30'), endMinutes: hm('10:00') };
    const ticks = layoutRibbonTicks(window, 100); // 8:00 sits 20px from the left end
    expect(ticks.map((t) => t.minutes)).toEqual([480, 540]);
    expect(ticks[0].label).toBe('');
    expect(ticks[1].label).toBe('9');
  });

  it('formats the end labels as the design writes them', () => {
    expect(formatRibbonEdgeLabel(420)).toBe('7am');
    expect(formatRibbonEdgeLabel(1380)).toBe('11pm');
    expect(formatRibbonEdgeLabel(450)).toBe('7:30am');
    expect(formatRibbonEdgeLabel(720)).toBe('12pm');
    expect(formatRibbonEdgeLabel(1440)).toBe('12am');
  });
});

describe('ribbon labels', () => {
  it("places all 18 of p24's labels at 1920px with no collisions", () => {
    const labels = layoutRibbonLabels(p24LabelInputs(WIDE_PX), { widthPx: WIDE_PX });
    expect(labels).toHaveLength(18);
    expectNoCollisions(labels, WIDE_PX);
    expect(labels.some((l) => l.truncated)).toBe(false);
  });

  it('alternates heights where p24 is crowded', () => {
    const labels = layoutRibbonLabels(p24LabelInputs(WIDE_PX), { widthPx: WIDE_PX });
    const tierOf = (index: number) => labels.find((l) => l.key === `p24-${index}`)!.tier;
    expect(new Set(labels.map((l) => l.tier)).size).toBeGreaterThan(1);
    // Morning Workout (9:00) is wider than the gap to Shower (9:30): it goes up, as on p24.
    expect(tierOf(3)).toBeGreaterThan(tierOf(4));
    // Lunchtime Workout, Shower, Commute (1:10–2:20) are crowded: neighbours don't share a tier.
    expect(tierOf(8)).not.toBe(tierOf(9));
    expect(tierOf(9)).not.toBe(tierOf(10));
    // Work (10:15–1:00) has room of its own and sits on the lowest tier.
    expect(tierOf(6)).toBe(0);
    // Output runs left to right.
    const anchors = labels.map((l) => l.anchorPx);
    expect(anchors).toEqual([...anchors].sort((a, b) => a - b));
  });

  it('never collides at 400px, truncating or leaving out what does not fit', () => {
    const inputs = p24LabelInputs(NARROW_PX);
    const labels = layoutRibbonLabels(inputs, { widthPx: NARROW_PX });
    expectNoCollisions(labels, NARROW_PX);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(inputs.length);
    // The long Work block always keeps a label.
    expect(labels.map((l) => l.key)).toContain('p24-6');
  });

  it('is deterministic regardless of input order', () => {
    const inputs = p24LabelInputs(NARROW_PX);
    const forward = layoutRibbonLabels(inputs, { widthPx: NARROW_PX });
    const reversed = layoutRibbonLabels([...inputs].reverse(), { widthPx: NARROW_PX });
    expect(reversed).toEqual(forward);
  });

  it('keeps a label inside the ribbon at the edges and skips empty text', () => {
    const labels = layoutRibbonLabels(
      [
        { key: 'left', text: 'Morning Hygiene', anchorPx: 2 },
        { key: 'right', text: 'Reading', anchorPx: 298 },
        { key: 'blank', text: '', anchorPx: 150 },
      ],
      { widthPx: 300 }
    );
    expect(labels.map((l) => l.key)).toEqual(['left', 'right']);
    expect(labels[0].leftPx).toBe(0);
    expect(labels[1].leftPx + labels[1].widthPx).toBe(300);
    expectNoCollisions(labels, 300);
  });

  it('chooses the label text by mode', () => {
    const types = [makeActivityType({ id: 'health', name: 'Health' })];
    const workout = makeRoutineBlock({ activityTypeId: 'health' });
    expect(ribbonSegmentLabel(workout, 'type', types)).toBe('Health');
    expect(ribbonSegmentLabel(workout, 'none', types)).toBe('');
    expect(ribbonSegmentLabel(workout, 'custom', types, () => 'Lose 10 Kg')).toBe('Lose 10 Kg');
    expect(ribbonSegmentLabel(workout, 'custom', types, () => null)).toBe('Health');
    expect(ribbonSegmentLabel(makeRoutineBlock({ activityTypeId: 'gone' }), 'type', types)).toBe('');
  });
});

describe('ribbon now marker', () => {
  it('sits at the current time inside the window', () => {
    // p74: about 10:45 on the 7–23 ribbon.
    const now = new Date(2026, 8, 15, 10, 45, 0);
    expect(nowMarkerFraction(now)).toBeCloseTo(3.75 / 16);
    expect(nowMarkerFraction(new Date(2026, 8, 15, 7, 0, 0))).toBe(0);
    expect(nowMarkerFraction(new Date(2026, 8, 15, 23, 0, 0))).toBe(1);
  });

  it('moves with seconds so a per-minute refresh visibly advances it', () => {
    const at = (seconds: number) => nowMarkerFraction(new Date(2026, 8, 15, 12, 0, seconds))!;
    expect(at(30)).toBeGreaterThan(at(0));
  });

  it('is null outside the window or without a time', () => {
    expect(nowMarkerFraction(new Date(2026, 8, 15, 6, 59, 59))).toBeNull();
    expect(nowMarkerFraction(new Date(2026, 8, 15, 23, 0, 1))).toBeNull();
    expect(nowMarkerFraction(null)).toBeNull();
    expect(nowMarkerFraction(undefined)).toBeNull();
    expect(nowMarkerFraction(new Date(Number.NaN))).toBeNull();
    expect(
      nowMarkerFraction(new Date(2026, 8, 15, 6, 0, 0), { startMinutes: 0, endMinutes: 1440 })
    ).toBeCloseTo(0.25);
  });
});

describe('ribbon hit-testing', () => {
  const segments = layoutRibbonSegments(
    [block('a', '08:00', '09:00'), block('b', '09:00', '09:05'), block('c', '22:00', '23:00')],
    { day: 1 }
  );

  it('finds the segment under a fraction, with the start inclusive and the end exclusive', () => {
    expect(hitTestSegment(segments, 1.5 / 16)?.key).toBe('a');
    expect(hitTestSegment(segments, 1 / 16)?.key).toBe('a');
    expect(hitTestSegment(segments, 2 / 16)?.key).toBe('b');
    expect(hitTestSegment(segments, 1)?.key).toBe('c');
  });

  it('returns null in a gap unless a segment is within tolerance', () => {
    const gap = 5 / 16;
    expect(hitTestSegment(segments, gap)).toBeNull();
    expect(hitTestSegment(segments, 0.5 / 16)).toBeNull();
    expect(hitTestSegment(segments, 0.5 / 16, 0.6 / 16)?.key).toBe('a');
    // Just past the five-minute block: the nearest one wins.
    const pastB = (2 + 10 / 60) / 16;
    expect(hitTestSegment(segments, pastB, 0.5 / 16)?.key).toBe('b');
    expect(hitTestSegment(segments, Number.NaN)).toBeNull();
  });

  it('prefers the segment drawn on top where two overlap', () => {
    const overlapping = layoutRibbonSegments(
      [block('under', '08:00', '10:00'), block('over', '09:00', '09:30')],
      { day: 1 }
    );
    expect(hitTestSegment(overlapping, 2.25 / 16)?.key).toBe('over');
    expect(hitTestSegment(overlapping, 1.5 / 16)?.key).toBe('under');
  });
});

describe('ribbon geometry and clock', () => {
  it('reserves label and tick space only for the full ribbon', () => {
    const full = ribbonGeometry(false);
    expect(full.labelArea).toBeGreaterThan(0);
    expect(full.total).toBeGreaterThan(full.barTop + full.bar);
    const compact = ribbonGeometry(true, 30);
    expect(compact).toMatchObject({ bar: 30, labelArea: 0, barTop: 0, total: 30 });
  });

  it('refreshes on the next whole step', () => {
    expect(msUntilNextTick(61_000, 30_000)).toBe(29_000);
    expect(msUntilNextTick(60_000, 30_000)).toBe(30_000);
    expect(msUntilNextTick(89_999, 30_000)).toBe(1);
  });
});
