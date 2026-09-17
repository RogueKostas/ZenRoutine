import { describe, expect, it } from 'vitest';
import type { DayOfWeek, RoutineBlock } from '../../src/core/types';
import {
  DEFAULT_RIBBON_WINDOW,
  RibbonWindow,
  layoutRibbonTicks,
  tickIntervalForWindow,
  tickLabelStep,
} from '../../src/components/ribbon/ribbonLayout';
import {
  EDGE_HANDLE_MAX_HIT_PX,
  EDGE_HANDLE_MIN_HIT_PX,
  RibbonEdge,
  applyBlockTimeUpdates,
  clampWindow,
  dragDeltaToMinutes,
  edgeDragBounds,
  edgeHandleHitWidth,
  edgeMoveUpdates,
  edgeNudgeForKey,
  isFullDay,
  isSharedEdge,
  nextZoomSpan,
  nudgeEdgeUpdates,
  panDeltaMinutes,
  panWindow,
  pinchZoomStep,
  resolveEdgeMinutes,
  ribbonEdges,
  snapMinutes,
  wheelZoomStep,
  zoomFocusMinutes,
  zoomSpanLabel,
  zoomWindow,
} from '../../src/components/ribbon/ribbonEdit';
import { makeRoutineBlock } from '../helpers/builders';

const hm = (text: string) => {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
};

const block = (id: string, start: string, end: string, dayOfWeek: DayOfWeek = 4): RoutineBlock =>
  makeRoutineBlock({ id, dayOfWeek, startMinutes: hm(start), endMinutes: hm(end) });

const win = (start: string, end: string): RibbonWindow => ({ startMinutes: hm(start), endMinutes: hm(end) });

// src/store/sampleData.ts on a Thursday (stored day 4), plus Wednesday's evening to be ignored.
const THURSDAY: RoutineBlock[] = [
  block('work-am', '09:00', '12:00'),
  block('food', '12:00', '13:00'),
  block('work-pm', '13:00', '17:30'),
  block('side', '19:00', '21:00'),
  block('dev', '21:30', '22:00'),
  block('wed-side', '19:00', '21:00', 3),
];

function edgeAt(blocks: readonly RoutineBlock[], time: string, day: DayOfWeek = 4): RibbonEdge {
  const edge = ribbonEdges(blocks, day).find((candidate) => candidate.minutes === hm(time));
  if (!edge) throw new Error(`no edge at ${time}`);
  return edge;
}

/** Drag `edge` by `dx` pixels on a ribbon `widthPx` wide showing `window`; returns the landing minute. */
function dragTo(
  blocks: readonly RoutineBlock[],
  edge: RibbonEdge,
  dx: number,
  widthPx = 1280,
  window: RibbonWindow = DEFAULT_RIBBON_WINDOW
): number {
  const raw = dragDeltaToMinutes(edge.minutes, dx, widthPx, window);
  return resolveEdgeMinutes(raw, edgeDragBounds(edge, blocks, 4));
}

describe('snapping a drag to quarter hours', () => {
  it('rounds to the nearest 15 minutes', () => {
    expect(snapMinutes(hm('13:07'))).toBe(hm('13:00'));
    expect(snapMinutes(hm('13:08'))).toBe(hm('13:15'));
    expect(snapMinutes(hm('13:22'))).toBe(hm('13:15'));
    expect(snapMinutes(hm('13:23'))).toBe(hm('13:30'));
  });

  it('turns pixels into minutes at the current window scale', () => {
    // Full day 7–23 on 1280px: 80px an hour.
    expect(dragDeltaToMinutes(hm('13:00'), 40, 1280, DEFAULT_RIBBON_WINDOW)).toBe(hm('13:30'));
    expect(dragDeltaToMinutes(hm('13:00'), -20, 1280, DEFAULT_RIBBON_WINDOW)).toBe(hm('12:45'));
    // Zoomed to 2h on the same width: 10.67px a minute, so 40px is 3.75 minutes.
    expect(dragDeltaToMinutes(hm('20:00'), 40, 1280, win('19:00', '21:00'))).toBeCloseTo(hm('20:00') + 3.75);
    // No width yet: no movement.
    expect(dragDeltaToMinutes(hm('13:00'), 40, 0, DEFAULT_RIBBON_WINDOW)).toBe(hm('13:00'));
  });

  it('lands a small drag on the nearest quarter hour, and a tiny one back where it started', () => {
    const boundary = edgeAt(THURSDAY, '13:00');
    expect(dragTo(THURSDAY, boundary, 9)).toBe(hm('13:00')); // 6.75 min
    expect(dragTo(THURSDAY, boundary, 11)).toBe(hm('13:15')); // 8.25 min
  });
});

describe('finding the edges and shared boundaries', () => {
  it("lists the day's edges in order and merges touching ends and starts", () => {
    const edges = ribbonEdges(THURSDAY, 4);
    expect(edges.map((edge) => [edge.minutes / 60, edge.endOf?.id ?? null, edge.startOf?.id ?? null])).toEqual([
      [9, null, 'work-am'],
      [12, 'work-am', 'food'],
      [13, 'food', 'work-pm'],
      [17.5, 'work-pm', null],
      [19, null, 'side'],
      [21, 'side', null],
      [21.5, null, 'dev'],
      [22, 'dev', null],
    ]);
    expect(edges.map(isSharedEdge)).toEqual([false, true, true, false, false, false, false, false]);
  });

  it('ignores other days and gives overnight blocks no handles', () => {
    const blocks = [block('wed', '10:00', '11:00', 3), block('late', '23:00', '01:00')];
    expect(ribbonEdges(blocks, 4)).toEqual([]);
  });

  it('puts the end of a block that finishes at midnight at 24:00', () => {
    const edges = ribbonEdges([block('late', '22:00', '00:00')], 4);
    expect(edges.map((edge) => edge.minutes)).toEqual([hm('22:00'), 1440]);
  });
});

describe('moving a shared boundary (p34–p35)', () => {
  it('moves Food’s end and Work’s start together: 13:00 → 13:30', () => {
    const boundary = edgeAt(THURSDAY, '13:00');
    const minutes = dragTo(THURSDAY, boundary, 40);
    expect(minutes).toBe(hm('13:30'));
    expect(edgeMoveUpdates(boundary, minutes)).toEqual([
      { id: 'food', data: { endMinutes: hm('13:30') } },
      { id: 'work-pm', data: { startMinutes: hm('13:30') } },
    ]);
  });

  it('stops 15 minutes short of either block’s far end', () => {
    const boundary = edgeAt(THURSDAY, '13:00');
    expect(edgeDragBounds(boundary, THURSDAY, 4)).toEqual({ min: hm('12:15'), max: hm('17:15') });
    expect(dragTo(THURSDAY, boundary, -400)).toBe(hm('12:15'));
    expect(dragTo(THURSDAY, boundary, 1000)).toBe(hm('17:15'));
  });

  it('writes nothing when the boundary ends where it started', () => {
    expect(edgeMoveUpdates(edgeAt(THURSDAY, '13:00'), hm('13:00'))).toEqual([]);
  });
});

describe('moving a free edge', () => {
  it('moves only its own block: Side Project’s end 21:00 → 21:15', () => {
    const end = edgeAt(THURSDAY, '21:00');
    const minutes = dragTo(THURSDAY, end, 20);
    expect(minutes).toBe(hm('21:15'));
    expect(edgeMoveUpdates(end, minutes)).toEqual([{ id: 'side', data: { endMinutes: hm('21:15') } }]);
  });

  it('clamps at the next activity’s start (Personal Development, 21:30)', () => {
    const end = edgeAt(THURSDAY, '21:00');
    expect(edgeDragBounds(end, THURSDAY, 4)).toEqual({ min: hm('19:15'), max: hm('21:30') });
    expect(dragTo(THURSDAY, end, 300)).toBe(hm('21:30'));
  });

  it('clamps a start at the previous activity’s end, and keeps 15 minutes', () => {
    const start = edgeAt(THURSDAY, '19:00');
    expect(edgeDragBounds(start, THURSDAY, 4)).toEqual({ min: hm('17:30'), max: hm('20:45') });
    expect(dragTo(THURSDAY, start, -800)).toBe(hm('17:30'));
    expect(dragTo(THURSDAY, start, 800)).toBe(hm('20:45'));
  });

  it('runs to the ends of the day when nothing is in the way', () => {
    const blocks = [block('only', '10:00', '11:00')];
    expect(edgeDragBounds(edgeAt(blocks, '10:00'), blocks, 4)).toEqual({ min: 0, max: hm('10:45') });
    expect(edgeDragBounds(edgeAt(blocks, '11:00'), blocks, 4)).toEqual({ min: hm('10:15'), max: 1440 });
  });

  it('respects overnight neighbours on both sides of the day', () => {
    const blocks = [
      block('wed-late', '23:00', '01:30', 3), // runs into Thursday until 1:30
      block('early', '02:00', '03:00'),
      block('evening', '20:00', '22:00'),
      block('thu-late', '23:00', '01:00'), // Thursday night into Friday
    ];
    expect(edgeDragBounds(edgeAt(blocks, '02:00'), blocks, 4).min).toBe(hm('01:30'));
    expect(edgeDragBounds(edgeAt(blocks, '22:00'), blocks, 4).max).toBe(hm('23:00'));
  });

  it('lets a block already under 15 minutes grow but not shrink', () => {
    const blocks = [block('short', '10:00', '10:10')];
    expect(edgeDragBounds(edgeAt(blocks, '10:10'), blocks, 4)).toEqual({ min: hm('10:10'), max: 1440 });
    expect(edgeDragBounds(edgeAt(blocks, '10:00'), blocks, 4)).toEqual({ min: 0, max: hm('10:00') });
  });

  it('stores an end dragged to midnight as 0', () => {
    const blocks = [block('late', '22:00', '23:00')];
    const end = edgeAt(blocks, '23:00');
    expect(edgeMoveUpdates(end, 1440)).toEqual([{ id: 'late', data: { endMinutes: 0 } }]);
  });
});

describe('the live preview', () => {
  it('applies updates to copies and leaves other blocks alone', () => {
    const updates = edgeMoveUpdates(edgeAt(THURSDAY, '13:00'), hm('13:30'));
    const preview = applyBlockTimeUpdates(THURSDAY, updates);
    expect(preview.find((b) => b.id === 'food')).toMatchObject({ startMinutes: hm('12:00'), endMinutes: hm('13:30') });
    expect(preview.find((b) => b.id === 'work-pm')).toMatchObject({ startMinutes: hm('13:30'), endMinutes: hm('17:30') });
    expect(preview.find((b) => b.id === 'side')).toBe(THURSDAY.find((b) => b.id === 'side'));
    expect(THURSDAY.find((b) => b.id === 'food')!.endMinutes).toBe(hm('13:00'));
  });
});

describe('handle size', () => {
  it('keeps the middle of short segments tappable', () => {
    // Full day on 1280px: 4/3 px a minute. A 30-minute block is 40px, so 16px handles.
    expect(edgeHandleHitWidth(edgeAt(THURSDAY, '21:30'), 1280 / 960)).toBe(16);
    expect(edgeHandleHitWidth(edgeAt(THURSDAY, '13:00'), 1280 / 960)).toBe(EDGE_HANDLE_MAX_HIT_PX);
    // 400px wide: a 30-minute block is 12.5px.
    expect(edgeHandleHitWidth(edgeAt(THURSDAY, '21:30'), 400 / 960)).toBe(EDGE_HANDLE_MIN_HIT_PX);
  });
});

describe('keyboard nudges', () => {
  it('maps [ ] { } to the start and end of the focused block', () => {
    expect(edgeNudgeForKey('[')).toEqual({ side: 'start', delta: -15 });
    expect(edgeNudgeForKey(']')).toEqual({ side: 'start', delta: 15 });
    expect(edgeNudgeForKey('{')).toEqual({ side: 'end', delta: -15 });
    expect(edgeNudgeForKey('}')).toEqual({ side: 'end', delta: 15 });
    expect(edgeNudgeForKey('a')).toBeNull();
  });

  it('moves a shared boundary as a drag would', () => {
    expect(nudgeEdgeUpdates(THURSDAY, 4, 'food', 'start', 15)).toEqual([
      { id: 'work-am', data: { endMinutes: hm('12:15') } },
      { id: 'food', data: { startMinutes: hm('12:15') } },
    ]);
  });

  it('clamps at a neighbour, after which the two share a boundary', () => {
    expect(nudgeEdgeUpdates(THURSDAY, 4, 'side', 'end', 15)).toEqual([
      { id: 'side', data: { endMinutes: hm('21:15') } },
    ]);
    const moved = applyBlockTimeUpdates(THURSDAY, nudgeEdgeUpdates(THURSDAY, 4, 'side', 'end', 30));
    expect(moved.find((b) => b.id === 'side')!.endMinutes).toBe(hm('21:30'));
    expect(nudgeEdgeUpdates(moved, 4, 'side', 'end', 15)).toEqual([
      { id: 'side', data: { endMinutes: hm('21:45') } },
      { id: 'dev', data: { startMinutes: hm('21:45') } },
    ]);
  });

  it('does nothing when the edge cannot move', () => {
    const blocks = [block('short', '10:00', '10:10')];
    expect(nudgeEdgeUpdates(blocks, 4, 'short', 'end', -15)).toEqual([]);
    expect(nudgeEdgeUpdates(THURSDAY, 4, 'missing', 'end', 15)).toEqual([]);
  });
});

describe('zoom levels', () => {
  it('steps 16h → 8h → 4h → 2h and back, stopping at each end', () => {
    expect(nextZoomSpan(960, 'in')).toBe(480);
    expect(nextZoomSpan(480, 'in')).toBe(240);
    expect(nextZoomSpan(240, 'in')).toBe(120);
    expect(nextZoomSpan(120, 'in')).toBe(120);
    expect(nextZoomSpan(120, 'out')).toBe(240);
    expect(nextZoomSpan(480, 'out')).toBe(960);
    expect(nextZoomSpan(960, 'out')).toBe(960);
    // An odd span (after a custom window) goes to the nearest level.
    expect(nextZoomSpan(300, 'in')).toBe(240);
    expect(nextZoomSpan(300, 'out')).toBe(480);
  });

  it('uses the bounds’ span as the widest level', () => {
    const wholeDay = win('00:00', '24:00');
    expect(nextZoomSpan(960, 'out', wholeDay)).toBe(1440);
    expect(nextZoomSpan(1440, 'in', wholeDay)).toBe(960);
  });

  it('names spans', () => {
    expect(zoomSpanLabel(960)).toBe('16h');
    expect(zoomSpanLabel(120)).toBe('2h');
    expect(zoomSpanLabel(90)).toBe('90m');
  });
});

describe('zooming around a focus point', () => {
  it('keeps the focus at the same place on screen (to the quarter hour)', () => {
    // 8pm is 13/16 of the way along 7–23; on a 4h window that puts the start at 4:45pm.
    expect(zoomWindow(DEFAULT_RIBBON_WINDOW, 240, hm('20:00'))).toEqual(win('16:45', '20:45'));
    // 8pm is 13/16 along 4:45–8:45 too; 8pm − 97.5 min rounds to 6:30pm.
    expect(zoomWindow(win('16:45', '20:45'), 120, hm('20:00'))).toEqual(win('18:30', '20:30'));
  });

  it('zooms the evening in and back out to the full day', () => {
    let window = DEFAULT_RIBBON_WINDOW;
    for (const span of [480, 240, 120]) window = zoomWindow(window, span, hm('21:00'));
    expect(window.endMinutes - window.startMinutes).toBe(120);
    expect(window.startMinutes).toBeLessThanOrEqual(hm('21:00'));
    expect(window.endMinutes).toBeGreaterThanOrEqual(hm('21:00'));
    expect(zoomWindow(window, 960, hm('21:00'))).toEqual(DEFAULT_RIBBON_WINDOW);
  });

  it('is clamped to the day', () => {
    expect(zoomWindow(DEFAULT_RIBBON_WINDOW, 120, hm('23:00'))).toEqual(win('21:00', '23:00'));
    expect(zoomWindow(DEFAULT_RIBBON_WINDOW, 120, hm('07:00'))).toEqual(win('07:00', '09:00'));
    expect(zoomWindow(win('07:00', '09:00'), 480, hm('07:15'))).toEqual(win('07:00', '15:00'));
    // A focus outside the window is treated as the nearest edge.
    expect(zoomWindow(win('07:00', '09:00'), 120, hm('22:00'))).toEqual(win('07:00', '09:00'));
  });

  it('zooms buttons around the selected activity when it is in view', () => {
    const side = THURSDAY.find((b) => b.id === 'side')!;
    expect(zoomFocusMinutes(DEFAULT_RIBBON_WINDOW, side)).toBe(hm('20:00'));
    expect(zoomFocusMinutes(win('07:00', '09:00'), side)).toBe(hm('08:00'));
    expect(zoomFocusMinutes(DEFAULT_RIBBON_WINDOW, null)).toBe(hm('15:00'));
  });

  it('knows when it is showing the full day', () => {
    expect(isFullDay(DEFAULT_RIBBON_WINDOW)).toBe(true);
    expect(isFullDay(win('19:00', '21:00'))).toBe(false);
  });
});

describe('panning', () => {
  it('moves by whole minutes and stops at the ends of the day', () => {
    expect(panWindow(win('19:00', '21:00'), -90)).toEqual(win('17:30', '19:30'));
    expect(panWindow(win('19:00', '21:00'), 60)).toEqual(win('20:00', '22:00'));
    expect(panWindow(win('21:00', '23:00'), 60)).toEqual(win('21:00', '23:00'));
    expect(panWindow(win('08:00', '10:00'), -600)).toEqual(win('07:00', '09:00'));
    expect(panWindow(win('19:00', '21:00'), 10.4)).toEqual(win('19:10', '21:10'));
  });

  it('pans the other way to the drag: dragging right shows earlier time', () => {
    // 2h on 1280px: dragging 320px right is half an hour earlier.
    expect(panDeltaMinutes(320, 1280, win('19:00', '21:00'))).toBe(-30);
    expect(panDeltaMinutes(-640, 1280, win('19:00', '21:00'))).toBe(60);
    expect(panDeltaMinutes(100, 0, win('19:00', '21:00'))).toBe(0);
  });

  it('never lets a window outgrow the bounds', () => {
    expect(clampWindow(win('06:00', '23:30'))).toEqual(DEFAULT_RIBBON_WINDOW);
  });
});

describe('wheel and pinch', () => {
  it('needs a notch of wheel travel per zoom step, and wheel up zooms in', () => {
    expect(wheelZoomStep(0, -100)).toEqual({ step: 1, remaining: 0 });
    expect(wheelZoomStep(0, 100)).toEqual({ step: -1, remaining: 0 });
    // A trackpad's small deltas add up.
    let total = 0;
    const steps: number[] = [];
    for (let i = 0; i < 12; i++) {
      const result = wheelZoomStep(total, -10);
      total = result.remaining;
      steps.push(result.step);
    }
    expect(steps.filter((step) => step === 1)).toHaveLength(2);
    expect(steps.slice(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('steps once the fingers have spread or closed by 40%', () => {
    expect(pinchZoomStep(100, 130)).toBe(0);
    expect(pinchZoomStep(100, 140)).toBe(1);
    expect(pinchZoomStep(100, 72)).toBe(0);
    expect(pinchZoomStep(100, 70)).toBe(-1);
    expect(pinchZoomStep(0, 70)).toBe(0);
  });
});

describe('tick density per zoom level', () => {
  it('uses hours down to 8h, half hours at 4h and quarter hours at 2h', () => {
    expect(tickIntervalForWindow(DEFAULT_RIBBON_WINDOW)).toBe(60);
    expect(tickIntervalForWindow(win('13:00', '21:00'))).toBe(60);
    expect(tickIntervalForWindow(win('17:00', '21:00'))).toBe(30);
    expect(tickIntervalForWindow(win('19:00', '21:00'))).toBe(15);
  });

  it('draws and labels quarter-hour ticks on a zoomed evening', () => {
    const ticks = layoutRibbonTicks(win('19:00', '21:00'), 1280, { intervalMinutes: 15 });
    expect(ticks.map((tick) => tick.label)).toEqual(['7:15', '7:30', '7:45', '8', '8:15', '8:30', '8:45']);
    expect(ticks[3].x).toBe(0.5);
  });

  it('draws half-hour ticks at 4h', () => {
    const ticks = layoutRibbonTicks(win('17:00', '21:00'), 1280, { intervalMinutes: 30 });
    expect(ticks.map((tick) => tick.minutes / 60)).toEqual([17.5, 18, 18.5, 19, 19.5, 20, 20.5]);
    expect(ticks.map((tick) => tick.label)).toEqual(['5:30', '6', '6:30', '7', '7:30', '8', '8:30']);
  });

  it('thins sub-hour labels on narrow ribbons and keeps them clear of wide end labels', () => {
    expect(tickLabelStep(400, win('19:00', '21:00'), 15)).toBe(1); // 50px each
    expect(tickLabelStep(200, win('19:00', '21:00'), 15)).toBe(2); // 25px each
    const narrow = layoutRibbonTicks(win('19:00', '21:00'), 200, { intervalMinutes: 15 });
    expect(narrow.map((tick) => tick.label)).toEqual(['', '7:30', '', '8', '', '8:30', '']);
    const cleared = layoutRibbonTicks(win('19:15', '21:15'), 400, { intervalMinutes: 15, edgeClearancePx: 54 });
    expect(cleared[0]).toMatchObject({ minutes: hm('19:30'), label: '' });
    expect(cleared[1]).toMatchObject({ minutes: hm('19:45'), label: '7:45' });
  });

  it('leaves the default hourly ticks unchanged', () => {
    const hourly = layoutRibbonTicks(DEFAULT_RIBBON_WINDOW, 1280);
    expect(hourly).toEqual(layoutRibbonTicks(DEFAULT_RIBBON_WINDOW, 1280, { intervalMinutes: 60 }));
    expect(hourly.map((tick) => tick.label)).toEqual([
      '8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    ]);
  });
});
