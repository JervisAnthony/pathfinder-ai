import { describe, expect, it, vi } from 'vitest';
import { classifyFollowUpDate, localCalendarDay } from '../followUpTiming';

describe('follow-up calendar classification', () => {
  it.each([null, '', 'invalid', '2026-1-01', '2026-01-1', '2026-10-29T00:00:00Z',
    '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-04-31',
    '2026-02-30', '2026-02-29', '1900-02-29', '0000-01-01', '10000-01-01', ' 2026-10-29'])('rejects invalid/unscheduled %s', (date) => {
    expect(classifyFollowUpDate(date, '2026-10-29')).toBeNull();
  });

  it.each([
    ['2026-10-28', '2026-10-29', 'past'], ['2026-10-29', '2026-10-29', 'today'],
    ['2026-10-30', '2026-10-29', 'upcoming'], ['2026-09-30', '2026-10-01', 'past'],
    ['2026-11-01', '2026-10-31', 'upcoming'], ['2026-12-31', '2027-01-01', 'past'],
    ['2027-01-01', '2026-12-31', 'upcoming'], ['2024-02-29', '2024-03-01', 'past'],
    ['2024-02-29', '2024-02-28', 'upcoming'], ['2024-02-29', '2024-02-29', 'today'],
    ['2000-02-29', '2000-03-01', 'past'], ['0001-01-01', '0001-01-01', 'today'],
    ['9999-12-31', '9999-12-31', 'today'], ['0001-01-01', '9999-12-31', 'past'],
    ['9999-12-31', '0001-01-01', 'upcoming'],
  ] as const)('classifies %s relative to %s as %s', (saved, today, expected) => {
    expect(classifyFollowUpDate(saved, today)).toBe(expected);
  });

  it.each(['', 'invalid', '2026-02-30', '0000-01-01'])('fails safely for invalid today %s', (today) => {
    expect(classifyFollowUpDate('2026-10-29', today)).toBeNull();
  });
});

describe('browser-local calendar day', () => {
  it.each([
    [2026, 9, 29, 23, 59, '2026-10-29'], [2026, 9, 30, 0, 0, '2026-10-30'],
    [2026, 9, 31, 23, 59, '2026-10-31'], [2026, 10, 1, 0, 0, '2026-11-01'],
    [2026, 11, 31, 23, 59, '2026-12-31'], [2027, 0, 1, 0, 0, '2027-01-01'],
    [2024, 1, 28, 23, 59, '2024-02-28'], [2024, 1, 29, 0, 0, '2024-02-29'],
    [2024, 2, 1, 0, 0, '2024-03-01'],
    [2026, 2, 8, 1, 59, '2026-03-08'], [2026, 2, 8, 3, 0, '2026-03-08'],
    [2026, 10, 1, 1, 30, '2026-11-01'],
  ] as const)('uses local components %s/%s/%s %s:%s', (year, month, day, hour, minute, expected) => {
    expect(localCalendarDay(new Date(year, month, day, hour, minute))).toBe(expected);
  });

  it.each([
    ['2026-10-29T00:30:00+14:00', 2026, 9, 29, '2026-10-29'],
    ['2026-10-29T23:30:00-10:00', 2026, 9, 29, '2026-10-29'],
    ['2027-01-01T00:01:00+14:00', 2027, 0, 1, '2027-01-01'],
  ] as const)('uses viewer components when UTC differs at %s', (instant, year, month, day, expected) => {
    const date = new Date(instant);
    expect(date.toISOString().slice(0, 10)).not.toBe(expected);
    // Model browser-local getters explicitly so the test is independent of host TZ.
    vi.spyOn(date, 'getFullYear').mockReturnValue(year);
    vi.spyOn(date, 'getMonth').mockReturnValue(month);
    vi.spyOn(date, 'getDate').mockReturnValue(day);
    const iso = vi.spyOn(date, 'toISOString').mockImplementation(() => { throw new Error('UTC conversion is forbidden'); });
    try {
      expect(localCalendarDay(date)).toBe(expected);
      expect(classifyFollowUpDate(expected, localCalendarDay(date))).toBe('today');
      expect(iso).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });

  it('pads supported four-digit years', () => {
    const date = new Date(2026, 0, 1);
    date.setFullYear(1);
    expect(localCalendarDay(date)).toBe('0001-01-01');
    date.setFullYear(9999); date.setMonth(11); date.setDate(31);
    expect(localCalendarDay(date)).toBe('9999-12-31');
  });
});
