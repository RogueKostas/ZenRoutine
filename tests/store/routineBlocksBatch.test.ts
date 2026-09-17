import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RoutineBlock } from '../../src/core/types';
import { useAppStore } from '../../src/store/useAppStore';
import { SAMPLE_ROUTINE_NAME } from '../../src/store/sampleData';
import {
  edgeDragBounds,
  edgeMoveUpdates,
  resolveEdgeMinutes,
  ribbonEdges,
} from '../../src/components/ribbon/ribbonEdit';

// updateRoutineBlocks (#58): the one write behind dragging a ribbon edge.

const hm = (text: string) => {
  const [hours, minutes] = text.split(':').map(Number);
  return hours * 60 + minutes;
};
const THURSDAY = 4;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T09:00:00.000Z'));
  await useAppStore.persist.rehydrate();
  await useAppStore.getState().resetState();
  await useAppStore.persist.clearStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

function loadExampleWeek() {
  expect(useAppStore.getState()._addSampleData()).toBe(true);
  const routine = useAppStore.getState().routines.find((r) => r.name === SAMPLE_ROUTINE_NAME)!;
  return routine.id;
}

function routine(id: string) {
  return useAppStore.getState().routines.find((r) => r.id === id)!;
}

function thursdayBlockAt(routineId: string, start: string): RoutineBlock {
  const found = routine(routineId).blocks.find(
    (b) => b.dayOfWeek === THURSDAY && b.startMinutes === hm(start)
  );
  if (!found) throw new Error(`no Thursday block at ${start}`);
  return found;
}

function typeName(block: RoutineBlock) {
  return useAppStore.getState().activityTypes.find((t) => t.id === block.activityTypeId)?.name;
}

describe('updateRoutineBlocks', () => {
  it('moves the Food | Work boundary to 1:30pm in one write (click-through step 1)', () => {
    const routineId = loadExampleWeek();
    const food = thursdayBlockAt(routineId, '12:00');
    const work = thursdayBlockAt(routineId, '13:00');
    expect([typeName(food), typeName(work)]).toEqual(['Food', 'Work']);
    const before = routine(routineId);

    vi.advanceTimersByTime(60_000);
    const edge = ribbonEdges(before.blocks, THURSDAY).find((e) => e.minutes === hm('13:00'))!;
    const target = resolveEdgeMinutes(hm('13:30'), edgeDragBounds(edge, before.blocks, THURSDAY));
    const setSpy = vi.fn();
    const unsubscribe = useAppStore.subscribe(setSpy);
    const result = useAppStore.getState().updateRoutineBlocks(routineId, edgeMoveUpdates(edge, target));
    unsubscribe();

    expect(result).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
    const after = routine(routineId);
    expect(after.blocks.find((b) => b.id === food.id)).toEqual({ ...food, endMinutes: hm('13:30') });
    expect(after.blocks.find((b) => b.id === work.id)).toEqual({ ...work, startMinutes: hm('13:30') });
    expect(after.blocks.filter((b) => b.id !== food.id && b.id !== work.id)).toEqual(
      before.blocks.filter((b) => b.id !== food.id && b.id !== work.id)
    );
    expect(after.updatedAt).toBe('2026-09-17T09:01:00.000Z');
    expect(after.capacityChangedAt?.[food.activityTypeId]).toBe('2026-09-17T09:01:00.000Z');
    expect(after.capacityChangedAt?.[work.activityTypeId]).toBe('2026-09-17T09:01:00.000Z');
  });

  it('refuses the same two edits one at a time, which is why the batch exists', () => {
    const routineId = loadExampleWeek();
    const food = thursdayBlockAt(routineId, '12:00');
    const before = routine(routineId);
    // Growing Food first overlaps Work's old start, so the single-block action writes nothing.
    useAppStore.getState().updateRoutineBlock(routineId, food.id, { endMinutes: hm('13:30') });
    expect(routine(routineId)).toEqual(before);
  });

  it('refuses an overlap with a reason and changes nothing, not even the valid half', () => {
    const routineId = loadExampleWeek();
    const side = thursdayBlockAt(routineId, '19:00');
    const food = thursdayBlockAt(routineId, '12:00');
    const before = routine(routineId);

    const result = useAppStore.getState().updateRoutineBlocks(routineId, [
      { id: food.id, data: { startMinutes: hm('12:15') } },
      { id: side.id, data: { endMinutes: hm('21:45') } }, // into Personal Development (21:30)
    ]);

    expect(result).toEqual({ ok: false, reason: 'That would overlap another activity.' });
    expect(routine(routineId)).toEqual(before);
  });

  it('refuses invalid times and unknown blocks', () => {
    const routineId = loadExampleWeek();
    const side = thursdayBlockAt(routineId, '19:00');
    const before = routine(routineId);

    expect(
      useAppStore.getState().updateRoutineBlocks(routineId, [{ id: side.id, data: { endMinutes: hm('19:00') } }])
    ).toEqual({ ok: false, reason: 'Block must have a duration greater than 0' });
    expect(useAppStore.getState().updateRoutineBlocks(routineId, [{ id: 'nope', data: {} }])).toEqual({
      ok: false,
      reason: 'That activity no longer exists.',
    });
    expect(useAppStore.getState().updateRoutineBlocks('nope', [])).toMatchObject({ ok: false });
    expect(routine(routineId)).toEqual(before);
  });

  it('writes nothing when nothing changes', () => {
    const routineId = loadExampleWeek();
    const side = thursdayBlockAt(routineId, '19:00');
    const before = routine(routineId);
    vi.advanceTimersByTime(60_000);

    const result = useAppStore.getState().updateRoutineBlocks(routineId, [
      { id: side.id, data: { endMinutes: side.endMinutes } },
    ]);

    expect(result).toEqual({ ok: true });
    expect(routine(routineId)).toBe(before);
  });

  it('extends Side Project to 9:15pm and the change survives a reload (click-through steps 2 and 5)', async () => {
    const routineId = loadExampleWeek();
    const side = thursdayBlockAt(routineId, '19:00');

    const result = useAppStore.getState().updateRoutineBlocks(routineId, [
      { id: side.id, data: { endMinutes: hm('21:15') } },
    ]);
    expect(result).toEqual({ ok: true });

    await vi.runAllTimersAsync();
    // What a reload reads back.
    const stored = JSON.parse((await AsyncStorage.getItem('zenroutine-storage'))!) as {
      state: { routines: Array<{ id: string; blocks: RoutineBlock[] }> };
    };
    const storedRoutine = stored.state.routines.find((r) => r.id === routineId)!;
    expect(storedRoutine.blocks.find((b) => b.id === side.id)).toEqual({
      ...side,
      endMinutes: hm('21:15'),
    });
  });
});
