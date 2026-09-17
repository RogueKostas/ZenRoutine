import { describe, expect, it } from 'vitest';
import { blockEditorErrors } from '../../src/components/routine/blockEditorErrors';
import { validateRoutineBlock } from '../../src/core/engine/validation';

describe('blockEditorErrors', () => {
  it('is empty for a valid block', () => {
    const result = validateRoutineBlock({
      dayOfWeek: 1,
      startMinutes: 540,
      endMinutes: 600,
      activityTypeId: 'work',
    });
    expect(blockEditorErrors(result.errors)).toEqual({});
  });

  it('puts a zero-length block under Time and a missing activity under Activity Type', () => {
    const result = validateRoutineBlock({ dayOfWeek: 1, startMinutes: 540, endMinutes: 540 });
    expect(blockEditorErrors(result.errors)).toEqual({
      time: 'Block must have a duration greater than 0',
      activity: 'Activity type is required',
    });
  });

  it('joins several time errors and keeps field-less errors separate', () => {
    expect(
      blockEditorErrors([
        { field: 'startMinutes', message: 'bad start' },
        { field: 'endMinutes', message: 'bad end' },
        { field: 'dayOfWeek', message: 'bad day' },
      ])
    ).toEqual({ time: 'bad start\nbad end', other: 'bad day' });
  });
});
