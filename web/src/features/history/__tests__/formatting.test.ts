import { describe, expect, it, vi } from 'vitest';
import { formatCalendarDate } from '../formatting';

describe('calendar date display', () => {
  it.each(['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Kolkata', 'Pacific/Kiritimati'])('preserves the calendar day in %s', (timeZone) => {
    const Formatter = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((_, options) => new Formatter('en-US', { timeZone, ...options }));
    try {
      expect(formatCalendarDate('2026-10-12')).toBe('Oct 12, 2026');
      expect(formatCalendarDate('2000-01-01')).toBe('Jan 1, 2000');
      expect(formatCalendarDate('2024-02-29')).toBe('Feb 29, 2024');
      expect(spy).toHaveBeenCalledWith(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
    } finally { spy.mockRestore(); }
  });

  it.each(['', 'invalid', '2026-02-30', '2026-13-01', '2026-1-01', '2026-10-12T00:00:00Z'])('handles invalid input %s', (value) => {
    expect(formatCalendarDate(value)).toBe('Unknown date');
  });
});
