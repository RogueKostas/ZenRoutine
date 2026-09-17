import type { ValidationError } from '../../core/engine/validation';

/** Inline error text for the Block Editor, by the section it is shown under. */
export interface BlockEditorErrors {
  time?: string;
  activity?: string;
  /** Errors with no field on screen to anchor to (e.g. the day, which the editor does not edit). */
  other?: string;
}

const TIME_FIELDS = new Set(['startMinutes', 'endMinutes']);

/**
 * Sorts validateRoutineBlock's errors under the field they belong to, so the editor can show them
 * next to that field instead of in a modal. Messages for the same section are joined by newlines.
 */
export function blockEditorErrors(errors: readonly ValidationError[]): BlockEditorErrors {
  const time: string[] = [];
  const activity: string[] = [];
  const other: string[] = [];
  for (const error of errors) {
    if (TIME_FIELDS.has(error.field)) time.push(error.message);
    else if (error.field === 'activityTypeId') activity.push(error.message);
    else other.push(error.message);
  }
  const result: BlockEditorErrors = {};
  if (time.length) result.time = time.join('\n');
  if (activity.length) result.activity = activity.join('\n');
  if (other.length) result.other = other.join('\n');
  return result;
}
