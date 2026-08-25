import { describe, expect, it } from 'vitest';

import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('formats sub-minute durations as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(1_000)).toBe('00:01');
    expect(formatDuration(59_999)).toBe('00:59');
  });

  it('formats sub-hour durations as mm:ss', () => {
    expect(formatDuration(60_000)).toBe('01:00');
    expect(formatDuration(3_599_000)).toBe('59:59');
  });

  it('formats hour-long durations as hh:mm:ss', () => {
    expect(formatDuration(3_600_000)).toBe('01:00:00');
    expect(formatDuration(45_296_000)).toBe('12:34:56');
  });

  it('rejects negative durations', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
  });

  it('rejects non-finite durations', () => {
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
    expect(() => formatDuration(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
