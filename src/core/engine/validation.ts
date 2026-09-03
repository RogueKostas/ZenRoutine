import { RoutineBlock, Goal } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a routine block
 */
export function validateRoutineBlock(block: Partial<RoutineBlock>): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (
    block.startMinutes === undefined ||
    !Number.isInteger(block.startMinutes) ||
    block.startMinutes < 0 ||
    block.startMinutes >= 1440
  ) {
    errors.push({ field: 'startMinutes', message: 'Start time must be between 0 and 1439 minutes' });
  }
  
  if (
    block.endMinutes === undefined ||
    !Number.isInteger(block.endMinutes) ||
    block.endMinutes < 0 ||
    block.endMinutes >= 1440
  ) {
    errors.push({ field: 'endMinutes', message: 'End time must be between 0 and 1439 minutes' });
  }
  
  if (block.startMinutes !== undefined && block.endMinutes !== undefined) {
    if (block.startMinutes === block.endMinutes) {
      errors.push({ field: 'endMinutes', message: 'Block must have a duration greater than 0' });
    }
  }
  
  if (
    block.dayOfWeek === undefined ||
    !Number.isInteger(block.dayOfWeek) ||
    block.dayOfWeek < 0 ||
    block.dayOfWeek > 6
  ) {
    errors.push({ field: 'dayOfWeek', message: 'Day of week must be between 0 (Sunday) and 6 (Saturday)' });
  }
  
  if (!block.activityTypeId) {
    errors.push({ field: 'activityTypeId', message: 'Activity type is required' });
  }
  
  return { isValid: errors.length === 0, errors };
}

/**
 * Check for overlapping blocks on the same day
 */
export function findOverlappingBlocks(
  blocks: RoutineBlock[],
  newBlock: RoutineBlock
): RoutineBlock[] {
  const minutesInDay = 1440;
  const minutesInWeek = 7 * minutesInDay;
  const toWeeklyInterval = (block: RoutineBlock): [number, number] => {
    const start = block.dayOfWeek * minutesInDay + block.startMinutes;
    let end = block.dayOfWeek * minutesInDay + block.endMinutes;
    if (block.endMinutes < block.startMinutes) end += minutesInDay;
    return [start, end];
  };
  const [newStart, newEnd] = toWeeklyInterval(newBlock);

  return blocks.filter(existing => {
    if (existing.id === newBlock.id) return false;
    const [existingStart, existingEnd] = toWeeklyInterval(existing);
    return [-minutesInWeek, 0, minutesInWeek].some((shift) => {
      const shiftedStart = existingStart + shift;
      const shiftedEnd = existingEnd + shift;
      return newStart < shiftedEnd && shiftedStart < newEnd;
    });
  });
}

/**
 * Validate a goal
 */
export function validateGoal(goal: Partial<Goal>): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!goal.name || goal.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Goal name is required' });
  }
  
  if (goal.estimatedMinutes === undefined || goal.estimatedMinutes <= 0) {
    errors.push({ field: 'estimatedMinutes', message: 'Estimated time must be greater than 0' });
  }
  
  if (!goal.activityTypeId) {
    errors.push({ field: 'activityTypeId', message: 'Activity type is required' });
  }
  
  return { isValid: errors.length === 0, errors };
}
