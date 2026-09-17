import { describe, expect, it } from 'vitest';
import { parseTimeOfDay } from '../../src/core/utils/time';

describe('parseTimeOfDay', () => {
  it.each([
    ['7', 7 * 60],
    ['7am', 7 * 60],
    ['7.15am', 7 * 60 + 15],
    ['7:15', 7 * 60 + 15],
    ['07:15', 7 * 60 + 15],
    ['19:30', 19 * 60 + 30],
    ['7:30pm', 19 * 60 + 30],
    ['5pm', 17 * 60],
    ['7:07', 7 * 60 + 7],
    ['0:00', 0],
    ['23:59', 23 * 60 + 59],
    ['12am', 0],
    ['12:30am', 30],
    ['12pm', 12 * 60],
    ['noon', 12 * 60],
    ['midnight', 0],
    ['  7:15 PM ', 19 * 60 + 15],
    ['7 p', 19 * 60],
  ])('reads %j as %i minutes', (input, minutes) => {
    expect(parseTimeOfDay(input)).toEqual({ minutes });
  });

  it.each([
    ['25:00'],
    ['24:00'],
    ['7:60'],
    ['abc'],
    [''],
    ['   '],
    ['13pm'],
    ['0am'],
    ['7:5'],
    ['7:15:00'],
    ['-1'],
  ])('rejects %j with a message', (input) => {
    const result = parseTimeOfDay(input);
    expect(result).not.toHaveProperty('minutes');
    expect(result).toEqual({ error: expect.any(String) });
  });
});
