import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration } from '../../src/core/utils/time';

describe('parseDuration', () => {
  it.each([
    ['12', 720],
    ['1.5', 90],
    ['12h', 720],
    ['12H', 720],
    ['12hr', 720],
    ['12hrs', 720],
    ['12 hours', 720],
    ['1 hour', 60],
    ['  12 HOURS  ', 720],
    ['.5h', 30],
    ['1.5h', 90],
    ['90m', 90],
    ['90 min', 90],
    ['90 mins', 90],
    ['90 minutes', 90],
    ['1 minute', 1],
    ['1h30', 90],
    ['1h30m', 90],
    ['1h 30m', 90],
    ['1 hr 30 mins', 90],
    ['1:30', 90],
    ['0:45', 45],
    ['10000h', 600000],
  ])('reads %j as %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toEqual({ minutes });
  });

  it('rounds fractional results to the nearest whole minute', () => {
    expect(parseDuration('90.4m')).toEqual({ minutes: 90 });
    expect(parseDuration('90.5m')).toEqual({ minutes: 91 });
    expect(parseDuration('1.01h')).toEqual({ minutes: 61 });
  });

  it.each([
    ['', 'Enter a duration'],
    ['   ', 'Enter a duration'],
    ['0', 'greater than zero'],
    ['0h', 'greater than zero'],
    ['0:00', 'greater than zero'],
    ['0.001h', 'greater than zero'],
    ['-1', 'greater than zero'],
    ['-2h', 'greater than zero'],
    ['abc', 'Couldn\'t read "abc"'],
    ['12x', 'Couldn\'t read "12x"'],
    ['h', "Couldn't read"],
    ['1 30', "Couldn't read"],
    ['30m1h', "Couldn't read"],
    ['1.2.3', "Couldn't read"],
    ['1h70m', 'under 60'],
    ['1:70', 'under 60'],
    ['1.5h30m', 'whole hours'],
    ['10001h', "can't be more than 10,000 hours"],
    ['10000h 1m', "can't be more than 10,000 hours"],
    ['600001m', "can't be more than 10,000 hours"],
    ['99999999999999999999999', "can't be more than 10,000 hours"],
  ])('rejects %j with a readable message', (input, message) => {
    const result = parseDuration(input);
    expect(result).not.toHaveProperty('minutes');
    expect('error' in result && result.error).toContain(message);
  });

  it('echoes back in the form the goal card uses', () => {
    const echo = (input: string) => {
      const result = parseDuration(input);
      return 'minutes' in result ? `= ${formatDuration(result.minutes)}` : result.error;
    };
    expect(echo('12h')).toBe('= 12h');
    expect(echo('12')).toBe('= 12h');
    expect(echo('1h30')).toBe('= 1h 30m');
    expect(echo('90')).toBe('= 90h');
    expect(echo('45m')).toBe('= 45m');
  });
});
