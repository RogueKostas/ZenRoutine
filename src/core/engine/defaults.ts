import { ActivityType } from '../types';
import { generateId } from '../utils/id';

export const DEFAULT_ACTIVITY_TYPES: Omit<ActivityType, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Work',                 color: '#E53935', icon: 'briefcase',   isDefault: true, sortOrder: 0 },
  { name: 'Side Project',         color: '#FF9800', icon: 'rocket',      isDefault: true, sortOrder: 1 },
  { name: 'Family Time',          color: '#E91E63', icon: 'heart',       isDefault: true, sortOrder: 2 },
  { name: 'Fitness',              color: '#4CAF50', icon: 'dumbbell',    isDefault: true, sortOrder: 3 },
  { name: 'Personal Development', color: '#FFEB3B', icon: 'book',        isDefault: true, sortOrder: 4 },
  { name: 'Entertainment',        color: '#2196F3', icon: 'tv',          isDefault: true, sortOrder: 5 },
  { name: 'Social',               color: '#9C27B0', icon: 'users',       isDefault: true, sortOrder: 6 },
  { name: 'Commute',              color: '#607D8B', icon: 'car',         isDefault: true, sortOrder: 7 },
  { name: 'Food',                 color: '#795548', icon: 'utensils',    isDefault: true, sortOrder: 8 },
  { name: 'Hygiene',              color: '#00BCD4', icon: 'droplet',     isDefault: true, sortOrder: 9 },
  { name: 'Sleep',                color: '#3F51B5', icon: 'moon',        isDefault: true, sortOrder: 10 },
];

export function createDefaultActivityTypes(): ActivityType[] {
  const now = new Date().toISOString();
  return DEFAULT_ACTIVITY_TYPES.map(at => ({
    ...at,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  }));
}
