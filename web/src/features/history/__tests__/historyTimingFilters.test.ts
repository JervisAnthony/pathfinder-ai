import { describe, expect, it, vi } from 'vitest';
import { adjacentCalendarDay, historyTimingCriteria, replaceHistoryTiming } from '../historyTimingFilters';
import { classifyFollowUpDate, followUpTimingLabels, localCalendarDay } from '../followUpTiming';

describe('date-only timing ranges', () => {
  it('retains filter identity when backward windows coincide near the minimum', () => {
    const current = Object.freeze({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-07', ai_enriched: false, min_score: 0 });
    for (const preset of ['last_7_days', 'last_30_days'] as const) {
      expect(historyTimingCriteria(preset, '0001-01-08')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-07' });
      expect(replaceHistoryTiming(current, historyTimingCriteria(preset, '0001-01-08')!)).toBe(current);
    }
  });

  it.each([
    ['2026-11-23', '2026-10-24', '2026-11-22'],
    ['2026-11-24', '2026-10-25', '2026-11-23'],
    ['2026-11-25', '2026-10-26', '2026-11-24'],
    ['2026-11-26', '2026-10-27', '2026-11-25'],
    ['2026-11-27', '2026-10-28', '2026-11-26'],
    ['2026-11-28', '2026-10-29', '2026-11-27'],
    ['2026-11-29', '2026-10-30', '2026-11-28'],
    ['2026-11-30', '2026-10-31', '2026-11-29'],
    ['2026-12-01', '2026-11-01', '2026-11-30'],
    ['2026-12-27', '2026-11-27', '2026-12-26'],
    ['2026-12-31', '2026-12-01', '2026-12-30'],
    ['2027-01-01', '2026-12-02', '2026-12-31'],
    ['2026-01-31', '2026-01-01', '2026-01-30'],
    ['2026-02-01', '2026-01-02', '2026-01-31'],
    ['2024-03-01', '2024-01-31', '2024-02-29'],
    ['2026-03-01', '2026-01-30', '2026-02-28'],
    ['1900-03-01', '1900-01-30', '1900-02-28'],
    ['2000-03-01', '2000-01-31', '2000-02-29'],
    ['2100-03-01', '2100-01-30', '2100-02-28'],
    ['2026-03-31', '2026-03-01', '2026-03-30'],
    ['2026-05-01', '2026-04-01', '2026-04-30'],
    ['2026-03-09', '2026-02-07', '2026-03-08'],
    ['2026-11-02', '2026-10-03', '2026-11-01'],
    ['0001-01-02', '0001-01-01', '0001-01-01'],
    ['0001-01-08', '0001-01-01', '0001-01-07'],
    ['0001-01-15', '0001-01-01', '0001-01-14'],
    ['0001-01-30', '0001-01-01', '0001-01-29'],
    ['0001-01-31', '0001-01-01', '0001-01-30'],
    ['0001-02-01', '0001-01-02', '0001-01-31'],
    ['0099-01-01', '0098-12-02', '0098-12-31'],
    ['0099-01-15', '0098-12-16', '0099-01-14'],
    ['9999-12-31', '9999-12-01', '9999-12-30'],
  ])('selects the preceding thirty calendar dates from %s, truncating only at the minimum', (today, from, to) => {
    expect(historyTimingCriteria('last_30_days', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each([
    ['0001-01-02', '0001-01-01'],
    ['0001-01-03', '0001-01-02'],
    ['0001-01-04', '0001-01-03'],
    ['0001-01-05', '0001-01-04'],
    ['0001-01-06', '0001-01-05'],
    ['0001-01-07', '0001-01-06'],
    ['0001-01-08', '0001-01-07'],
    ['0001-01-09', '0001-01-08'],
    ['0001-01-10', '0001-01-09'],
    ['0001-01-11', '0001-01-10'],
    ['0001-01-12', '0001-01-11'],
    ['0001-01-13', '0001-01-12'],
    ['0001-01-14', '0001-01-13'],
    ['0001-01-15', '0001-01-14'],
    ['0001-01-16', '0001-01-15'],
    ['0001-01-17', '0001-01-16'],
    ['0001-01-18', '0001-01-17'],
    ['0001-01-19', '0001-01-18'],
    ['0001-01-20', '0001-01-19'],
    ['0001-01-21', '0001-01-20'],
    ['0001-01-22', '0001-01-21'],
    ['0001-01-23', '0001-01-22'],
    ['0001-01-24', '0001-01-23'],
    ['0001-01-25', '0001-01-24'],
    ['0001-01-26', '0001-01-25'],
    ['0001-01-27', '0001-01-26'],
    ['0001-01-28', '0001-01-27'],
    ['0001-01-29', '0001-01-28'],
    ['0001-01-30', '0001-01-29'],
  ])('includes every supported preceding date for the partial first-month window at %s', (today, to) => {
    expect(historyTimingCriteria('last_30_days', today)).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: to });
  });

  it('requires supported yesterday and preserves available minimum-day presets', () => {
    expect(historyTimingCriteria('last_30_days', '0001-01-01')).toBeNull();
    expect(historyTimingCriteria('this_week', '0001-01-01')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-07' });
    expect(historyTimingCriteria('this_month', '0001-01-01')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-31' });
  });

  it('includes day minus thirty, an interior date and yesterday with factual past cues', () => {
    const timing = historyTimingCriteria('last_30_days', '2026-11-27')!;
    const dates = [null, '2026-10-27', '2026-10-28', '2026-11-10', '2026-11-26', '2026-11-27', '2026-11-28', '2026-12-01'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-10-28', '2026-11-10', '2026-11-26']);
    for (const date of ['2026-10-28', '2026-11-10', '2026-11-26']) expect(classifyFollowUpDate(date, '2026-11-27')).toBe('past');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
    expect(historyTimingCriteria('last_month', '2026-11-27')).toEqual({ has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31' });
  });

  it.each([
    [1, 0, 2, '0001-01-02', '0001-01-01', '0001-01-01'],
    [99, 0, 1, '0099-01-01', '0098-12-02', '0098-12-31'],
    [99, 0, 15, '0099-01-15', '0098-12-16', '0099-01-14'],
  ] as const)('captures browser-local early year %s for preceding thirty-date ranges', (year, month, day, today, from, to) => {
    const date = new Date(2026, month, day, 12); date.setFullYear(year);
    expect(localCalendarDay(date)).toBe(today);
    expect(historyTimingCriteria('last_30_days', localCalendarDay(date))).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each([
    ['2026-11-23', '2026-11-24', '2026-12-23'],
    ['2026-11-24', '2026-11-25', '2026-12-24'],
    ['2026-11-25', '2026-11-26', '2026-12-25'],
    ['2026-11-26', '2026-11-27', '2026-12-26'],
    ['2026-11-27', '2026-11-28', '2026-12-27'],
    ['2026-11-28', '2026-11-29', '2026-12-28'],
    ['2026-11-29', '2026-11-30', '2026-12-29'],
    ['2026-11-30', '2026-12-01', '2026-12-30'],
    ['2026-12-01', '2026-12-02', '2026-12-31'],
    ['2026-12-02', '2026-12-03', '2027-01-01'],
    ['2026-12-26', '2026-12-27', '2027-01-25'],
    ['2026-12-31', '2027-01-01', '2027-01-30'],
    ['2027-01-01', '2027-01-02', '2027-01-31'],
    ['2026-01-31', '2026-02-01', '2026-03-02'],
    ['2024-01-31', '2024-02-01', '2024-03-01'],
    ['2024-02-28', '2024-02-29', '2024-03-29'],
    ['2024-02-29', '2024-03-01', '2024-03-30'],
    ['2026-02-28', '2026-03-01', '2026-03-30'],
    ['1900-01-31', '1900-02-01', '1900-03-02'],
    ['2000-01-31', '2000-02-01', '2000-03-01'],
    ['2100-01-31', '2100-02-01', '2100-03-02'],
    ['2026-03-08', '2026-03-09', '2026-04-07'],
    ['2026-11-01', '2026-11-02', '2026-12-01'],
    ['0001-01-01', '0001-01-02', '0001-01-31'],
    ['0001-01-31', '0001-02-01', '0001-03-02'],
    ['0099-12-15', '0099-12-16', '0100-01-14'],
    ['9999-11-30', '9999-12-01', '9999-12-30'],
    ['9999-12-01', '9999-12-02', '9999-12-31'],
    ['9999-12-02', '9999-12-03', '9999-12-31'],
    ['9999-12-24', '9999-12-25', '9999-12-31'],
    ['9999-12-25', '9999-12-26', '9999-12-31'],
    ['9999-12-29', '9999-12-30', '9999-12-31'],
    ['9999-12-30', '9999-12-31', '9999-12-31'],
  ])('selects the next thirty calendar dates from %s, truncating only at the maximum', (today, from, to) => {
    expect(historyTimingCriteria('next_30_days', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it('rejects Next 30 days when tomorrow is unsupported, preserving available final-day presets', () => {
    expect(historyTimingCriteria('next_30_days', '9999-12-31')).toBeNull();
    expect(historyTimingCriteria('last_7_days', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-24', follow_up_to: '9999-12-30' });
    expect(historyTimingCriteria('this_week', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-27', follow_up_to: '9999-12-31' });
    expect(historyTimingCriteria('this_month', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-01', follow_up_to: '9999-12-31' });
  });

  it('includes tomorrow, an interior date and day thirty with factual upcoming cues', () => {
    const timing = historyTimingCriteria('next_30_days', '2026-11-26')!;
    const dates = [null, '2026-11-25', '2026-11-26', '2026-11-27', '2026-12-11', '2026-12-26', '2026-12-27', '2027-01-01'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-11-27', '2026-12-11', '2026-12-26']);
    for (const date of ['2026-11-27', '2026-12-11', '2026-12-26']) expect(classifyFollowUpDate(date, '2026-11-26')).toBe('upcoming');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
    expect(historyTimingCriteria('next_month', '2026-11-26')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-01', follow_up_to: '2026-12-31' });
  });

  it('captures the local year 0099 for a thirty-date window into 0100', () => {
    const date = new Date(2026, 11, 15, 12); date.setFullYear(99);
    expect(localCalendarDay(date)).toBe('0099-12-15');
    expect(historyTimingCriteria('next_30_days', localCalendarDay(date))).toEqual({ has_follow_up: true, follow_up_from: '0099-12-16', follow_up_to: '0100-01-14' });
  });

  it.each([
    ['2026-11-23', '2026-11-16', '2026-11-22'],
    ['2026-11-24', '2026-11-17', '2026-11-23'],
    ['2026-11-25', '2026-11-18', '2026-11-24'],
    ['2026-11-26', '2026-11-19', '2026-11-25'],
    ['2026-11-27', '2026-11-20', '2026-11-26'],
    ['2026-11-28', '2026-11-21', '2026-11-27'],
    ['2026-11-29', '2026-11-22', '2026-11-28'],
    ['2026-11-30', '2026-11-23', '2026-11-29'],
    ['2026-12-03', '2026-11-26', '2026-12-02'],
    ['2026-12-31', '2026-12-24', '2026-12-30'],
    ['2027-01-01', '2026-12-25', '2026-12-31'],
    ['2027-01-04', '2026-12-28', '2027-01-03'],
    ['2024-02-29', '2024-02-22', '2024-02-28'],
    ['2024-03-01', '2024-02-23', '2024-02-29'],
    ['2026-03-01', '2026-02-22', '2026-02-28'],
    ['1900-03-01', '1900-02-22', '1900-02-28'],
    ['2000-03-01', '2000-02-23', '2000-02-29'],
    ['2100-03-01', '2100-02-22', '2100-02-28'],
    ['2026-03-09', '2026-03-02', '2026-03-08'],
    ['2026-11-02', '2026-10-26', '2026-11-01'],
    ['0001-01-02', '0001-01-01', '0001-01-01'],
    ['0001-01-03', '0001-01-01', '0001-01-02'],
    ['0001-01-04', '0001-01-01', '0001-01-03'],
    ['0001-01-05', '0001-01-01', '0001-01-04'],
    ['0001-01-06', '0001-01-01', '0001-01-05'],
    ['0001-01-07', '0001-01-01', '0001-01-06'],
    ['0001-01-08', '0001-01-01', '0001-01-07'],
    ['0001-01-09', '0001-01-02', '0001-01-08'],
    ['0099-01-01', '0098-12-25', '0098-12-31'],
    ['0099-12-31', '0099-12-24', '0099-12-30'],
    ['9999-12-25', '9999-12-18', '9999-12-24'],
    ['9999-12-30', '9999-12-23', '9999-12-29'],
    ['9999-12-31', '9999-12-24', '9999-12-30'],
  ])('selects the preceding seven calendar dates from %s, truncating only at the minimum', (today, from, to) => {
    expect(historyTimingCriteria('last_7_days', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it('rejects Last 7 days only when supported yesterday is absent and preserves other minimum-boundary presets', () => {
    expect(historyTimingCriteria('last_7_days', '0001-01-01')).toBeNull();
    expect(historyTimingCriteria('this_week', '0001-01-01')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-07' });
    expect(historyTimingCriteria('this_month', '0001-01-01')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-31' });
  });

  it('includes yesterday, day minus seven and interior dates with factual past cues', () => {
    const timing = historyTimingCriteria('last_7_days', '2026-11-26')!;
    const dates = [null, '2026-11-18', '2026-11-19', '2026-11-22', '2026-11-25', '2026-11-26', '2026-11-27', '2026-12-01'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-11-19', '2026-11-22', '2026-11-25']);
    for (const date of ['2026-11-19', '2026-11-22', '2026-11-25']) expect(classifyFollowUpDate(date, '2026-11-26')).toBe('past');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
  });

  it.each([
    [1, 0, 2, '0001-01-02', '0001-01-01', '0001-01-01'],
    [99, 0, 1, '0099-01-01', '0098-12-25', '0098-12-31'],
    [99, 11, 31, '0099-12-31', '0099-12-24', '0099-12-30'],
  ] as const)('extracts browser-local early year %s without constructor-year remapping', (year, month, day, today, from, to) => {
    const date = new Date(2026, month, day, 12); date.setFullYear(year);
    expect(localCalendarDay(date)).toBe(today);
    expect(historyTimingCriteria('last_7_days', localCalendarDay(date))).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each([
    ['2026-11-23', '2026-11-16', '2026-11-22'],
    ['2026-11-24', '2026-11-16', '2026-11-22'],
    ['2026-11-25', '2026-11-16', '2026-11-22'],
    ['2026-11-26', '2026-11-16', '2026-11-22'],
    ['2026-11-27', '2026-11-16', '2026-11-22'],
    ['2026-11-28', '2026-11-16', '2026-11-22'],
    ['2026-11-29', '2026-11-16', '2026-11-22'],
    ['2026-11-30', '2026-11-23', '2026-11-29'],
    ['2026-11-01', '2026-10-19', '2026-10-25'],
    ['2026-12-31', '2026-12-21', '2026-12-27'],
    ['2027-01-01', '2026-12-21', '2026-12-27'],
    ['2027-01-04', '2026-12-28', '2027-01-03'],
    ['2024-02-29', '2024-02-19', '2024-02-25'],
    ['2024-03-04', '2024-02-26', '2024-03-03'],
    ['2026-03-02', '2026-02-23', '2026-03-01'],
    ['1900-03-05', '1900-02-26', '1900-03-04'],
    ['2000-03-06', '2000-02-28', '2000-03-05'],
    ['2100-03-01', '2100-02-22', '2100-02-28'],
    ['0001-01-08', '0001-01-01', '0001-01-07'],
    ['0001-01-14', '0001-01-01', '0001-01-07'],
    ['0001-01-15', '0001-01-08', '0001-01-14'],
    ['0099-01-01', '0098-12-22', '0098-12-28'],
    ['0099-12-31', '0099-12-21', '0099-12-27'],
    ['9999-12-20', '9999-12-13', '9999-12-19'],
    ['9999-12-26', '9999-12-13', '9999-12-19'],
    ['9999-12-27', '9999-12-20', '9999-12-26'],
    ['9999-12-31', '9999-12-20', '9999-12-26'],
  ])('selects the entire preceding Monday-Sunday week from %s', (today, from, to) => {
    expect(historyTimingCriteria('last_week', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each(['01', '02', '03', '04', '05', '06', '07'])('rejects Last week throughout the first supported week (%s), preserving This week', (day) => {
    expect(historyTimingCriteria('last_week', `0001-01-${day}`)).toBeNull();
    expect(historyTimingCriteria('this_week', `0001-01-${day}`)).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-07' });
  });

  it('includes only scheduled preceding-week endpoints and interior dates with factual past cues', () => {
    const timing = historyTimingCriteria('last_week', '2026-11-25')!;
    const dates = [null, '2026-11-15', '2026-11-16', '2026-11-19', '2026-11-22', '2026-11-23', '2026-11-25', '2026-11-29', '2026-11-30'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-11-16', '2026-11-19', '2026-11-22']);
    for (const date of ['2026-11-16', '2026-11-19', '2026-11-22']) expect(classifyFollowUpDate(date, '2026-11-25')).toBe('past');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
  });

  it.each([
    ['2026-02-15', '2026-01-01', '2026-01-31'],
    ['2026-03-31', '2026-02-01', '2026-02-28'],
    ['2026-04-30', '2026-03-01', '2026-03-31'],
    ['2026-05-31', '2026-04-01', '2026-04-30'],
    ['2026-06-30', '2026-05-01', '2026-05-31'],
    ['2026-07-31', '2026-06-01', '2026-06-30'],
    ['2026-08-31', '2026-07-01', '2026-07-31'],
    ['2026-09-30', '2026-08-01', '2026-08-31'],
    ['2026-10-31', '2026-09-01', '2026-09-30'],
    ['2026-11-01', '2026-10-01', '2026-10-31'],
    ['2026-11-24', '2026-10-01', '2026-10-31'],
    ['2026-11-30', '2026-10-01', '2026-10-31'],
    ['2026-12-31', '2026-11-01', '2026-11-30'],
    ['2027-01-01', '2026-12-01', '2026-12-31'],
    ['2027-01-15', '2026-12-01', '2026-12-31'],
    ['2027-01-31', '2026-12-01', '2026-12-31'],
    ['2024-03-31', '2024-02-01', '2024-02-29'],
    ['1900-03-01', '1900-02-01', '1900-02-28'],
    ['2000-03-01', '2000-02-01', '2000-02-29'],
    ['2100-03-31', '2100-02-01', '2100-02-28'],
    ['0001-02-01', '0001-01-01', '0001-01-31'],
    ['0002-01-01', '0001-12-01', '0001-12-31'],
    ['0099-01-31', '0098-12-01', '0098-12-31'],
    ['0100-01-01', '0099-12-01', '0099-12-31'],
    ['9999-12-31', '9999-11-01', '9999-11-30'],
  ])('selects the full preceding calendar month from %s', (today, from, to) => {
    expect(historyTimingCriteria('last_month', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each(['01', '15', '31'])('rejects Last month throughout January 0001 (%s), preserving This month', (day) => {
    expect(historyTimingCriteria('last_month', `0001-01-${day}`)).toBeNull();
    expect(historyTimingCriteria('this_month', `0001-01-${day}`)).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-31' });
  });

  it('includes only scheduled preceding-month endpoints and interior dates with factual past cues', () => {
    const timing = historyTimingCriteria('last_month', '2026-11-24')!;
    const dates = [null, '2026-09-30', '2026-10-01', '2026-10-15', '2026-10-31', '2026-11-01', '2026-11-24', '2026-12-01'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-10-01', '2026-10-15', '2026-10-31']);
    for (const date of ['2026-10-01', '2026-10-15', '2026-10-31']) expect(classifyFollowUpDate(date, '2026-11-24')).toBe('past');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
  });

  it.each([
    ['2025-12-31', '2026-01-01', '2026-01-31'],
    ['2026-01-15', '2026-02-01', '2026-02-28'],
    ['2026-02-28', '2026-03-01', '2026-03-31'],
    ['2026-03-15', '2026-04-01', '2026-04-30'],
    ['2026-04-30', '2026-05-01', '2026-05-31'],
    ['2026-05-15', '2026-06-01', '2026-06-30'],
    ['2026-06-30', '2026-07-01', '2026-07-31'],
    ['2026-07-15', '2026-08-01', '2026-08-31'],
    ['2026-08-31', '2026-09-01', '2026-09-30'],
    ['2026-09-15', '2026-10-01', '2026-10-31'],
    ['2026-10-31', '2026-11-01', '2026-11-30'],
    ['2026-11-01', '2026-12-01', '2026-12-31'],
    ['2026-11-13', '2026-12-01', '2026-12-31'],
    ['2026-11-30', '2026-12-01', '2026-12-31'],
    ['2026-12-31', '2027-01-01', '2027-01-31'],
    ['2024-01-31', '2024-02-01', '2024-02-29'],
    ['2024-02-29', '2024-03-01', '2024-03-31'],
    ['1900-01-31', '1900-02-01', '1900-02-28'],
    ['2000-01-31', '2000-02-01', '2000-02-29'],
    ['2100-01-31', '2100-02-01', '2100-02-28'],
    ['0001-01-01', '0001-02-01', '0001-02-28'],
    ['0099-01-15', '0099-02-01', '0099-02-28'],
    ['0099-12-31', '0100-01-01', '0100-01-31'],
    ['9999-11-30', '9999-12-01', '9999-12-31'],
  ])('selects the full following calendar month from %s', (today, from, to) => {
    expect(historyTimingCriteria('next_month', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each(['01', '15', '31'])('rejects Next month throughout December 9999 (%s), preserving This month', (day) => {
    expect(historyTimingCriteria('next_month', `9999-12-${day}`)).toBeNull();
    expect(historyTimingCriteria('this_month', `9999-12-${day}`)).toEqual({ has_follow_up: true, follow_up_from: '9999-12-01', follow_up_to: '9999-12-31' });
  });

  it('includes only scheduled target-month endpoints and interior dates with unchanged factual cues', () => {
    const timing = historyTimingCriteria('next_month', '2026-11-13')!;
    const dates = [null, '2026-11-13', '2026-11-30', '2026-12-01', '2026-12-15', '2026-12-31', '2027-01-01'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-12-01', '2026-12-15', '2026-12-31']);
    for (const date of ['2026-12-01', '2026-12-15', '2026-12-31']) expect(classifyFollowUpDate(date, '2026-11-13')).toBe('upcoming');
    expect(classifyFollowUpDate('2026-11-12', '2026-11-13')).toBe('past');
    expect(classifyFollowUpDate('2026-11-13', '2026-11-13')).toBe('today');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
  });

  it.each([
    ['2026-01-15', '2026-01-01', '2026-01-31'],
    ['2026-02-15', '2026-02-01', '2026-02-28'],
    ['2026-03-15', '2026-03-01', '2026-03-31'],
    ['2026-04-15', '2026-04-01', '2026-04-30'],
    ['2026-05-15', '2026-05-01', '2026-05-31'],
    ['2026-06-15', '2026-06-01', '2026-06-30'],
    ['2026-07-15', '2026-07-01', '2026-07-31'],
    ['2026-08-15', '2026-08-01', '2026-08-31'],
    ['2026-09-15', '2026-09-01', '2026-09-30'],
    ['2026-10-15', '2026-10-01', '2026-10-31'],
    ['2026-11-01', '2026-11-01', '2026-11-30'],
    ['2026-11-12', '2026-11-01', '2026-11-30'],
    ['2026-11-30', '2026-11-01', '2026-11-30'],
    ['2026-12-31', '2026-12-01', '2026-12-31'],
    ['2027-01-01', '2027-01-01', '2027-01-31'],
    ['2024-02-29', '2024-02-01', '2024-02-29'],
    ['1900-02-28', '1900-02-01', '1900-02-28'],
    ['2000-02-29', '2000-02-01', '2000-02-29'],
    ['2100-02-28', '2100-02-01', '2100-02-28'],
    ['0001-01-01', '0001-01-01', '0001-01-31'],
    ['0099-02-15', '0099-02-01', '0099-02-28'],
    ['9999-12-31', '9999-12-01', '9999-12-31'],
  ])('selects the entire supported calendar month containing %s', (today, from, to) => {
    expect(historyTimingCriteria('this_month', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it('includes earlier dates, today and both month endpoints without changing factual cues', () => {
    const timing = historyTimingCriteria('this_month', '2026-11-12')!;
    const dates = [null, '2026-10-31', '2026-11-01', '2026-11-05', '2026-11-12', '2026-11-30', '2026-12-01'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-11-01', '2026-11-05', '2026-11-12', '2026-11-30']);
    expect(classifyFollowUpDate('2026-11-01', '2026-11-12')).toBe('past');
    expect(classifyFollowUpDate('2026-11-12', '2026-11-12')).toBe('today');
    expect(classifyFollowUpDate('2026-11-30', '2026-11-12')).toBe('upcoming');
    expect(historyTimingCriteria('next_week', '9999-12-31')).toBeNull();
    expect(historyTimingCriteria('this_week', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-27', follow_up_to: '9999-12-31' });
  });

  it.each([
    ...['09', '10', '11', '12', '13', '14', '15'].map((day) => [`2026-11-${day}`, '2026-11-16', '2026-11-22']),
    ['2026-11-16', '2026-11-23', '2026-11-29'],
    ['2026-11-30', '2026-12-07', '2026-12-13'],
    ['2026-12-31', '2027-01-04', '2027-01-10'],
    ['2027-01-01', '2027-01-04', '2027-01-10'],
    ['2024-02-25', '2024-02-26', '2024-03-03'],
    ['2024-02-29', '2024-03-04', '2024-03-10'],
    ['2026-02-22', '2026-02-23', '2026-03-01'],
    ['1900-02-25', '1900-02-26', '1900-03-04'],
    ['2000-02-27', '2000-02-28', '2000-03-05'],
    ['2100-02-28', '2100-03-01', '2100-03-07'],
    ['0001-01-01', '0001-01-08', '0001-01-14'],
    ['0001-01-07', '0001-01-08', '0001-01-14'],
    ['0099-01-01', '0099-01-05', '0099-01-11'],
    ['0099-12-31', '0100-01-04', '0100-01-10'],
    ['9999-12-19', '9999-12-20', '9999-12-26'],
    ...['20', '21', '22', '23', '24', '25', '26'].map((day) => [`9999-12-${day}`, '9999-12-27', '9999-12-31']),
  ])('selects the following Monday-Sunday week from %s, clamping only Sunday', (today, from, to) => {
    expect(historyTimingCriteria('next_week', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it.each(['27', '28', '29', '30', '31'])('has no next week on 9999-12-%s', (day) => {
    expect(historyTimingCriteria('next_week', `9999-12-${day}`)).toBeNull();
    expect(historyTimingCriteria('this_week', `9999-12-${day}`)).toEqual({ has_follow_up: true, follow_up_from: '9999-12-27', follow_up_to: '9999-12-31' });
  });

  it('includes only scheduled next-week endpoints, preserving current inputs and false/zero criteria', () => {
    const timing = historyTimingCriteria('next_week', '2026-11-15')!;
    const dates = [null, '2026-11-09', '2026-11-15', '2026-11-16', '2026-11-22', '2026-11-23'];
    expect(dates.filter((date) => date !== null && date >= timing.follow_up_from! && date <= timing.follow_up_to!))
      .toEqual(['2026-11-16', '2026-11-22']);
    const current = Object.freeze({ query: 'Engineer', min_score: 0, max_score: 0, ai_enriched: false, has_follow_up: false });
    const next = replaceHistoryTiming(current, timing);
    expect(next).toEqual({ ...current, ...timing });
    expect(replaceHistoryTiming(next, timing)).toBe(next);
    expect(replaceHistoryTiming(next, {})).toEqual({ query: 'Engineer', min_score: 0, max_score: 0, ai_enriched: false });
    expect(current.has_follow_up).toBe(false);
  });


  it.each([
    ...['02', '03', '04', '05', '06', '07', '08'].map((day) => [`2026-11-${day}`, '2026-11-02', '2026-11-08']),
    ['2026-11-09', '2026-11-09', '2026-11-15'],
    ['2026-11-01', '2026-10-26', '2026-11-01'],
    ['2026-12-31', '2026-12-28', '2027-01-03'],
    ['2024-02-29', '2024-02-26', '2024-03-03'],
    ['2026-02-28', '2026-02-23', '2026-03-01'],
    ['1900-02-28', '1900-02-26', '1900-03-04'],
    ['2000-02-29', '2000-02-28', '2000-03-05'],
    ['2100-03-01', '2100-03-01', '2100-03-07'],
    ['0001-01-01', '0001-01-01', '0001-01-07'],
    ['0001-01-07', '0001-01-01', '0001-01-07'],
    ['0099-01-01', '0098-12-29', '0099-01-04'],
    ['9999-12-27', '9999-12-27', '9999-12-31'],
    ['9999-12-31', '9999-12-27', '9999-12-31'],
  ])('selects the inclusive Monday-Sunday week containing %s', (today, from, to) => {
    const criteria = historyTimingCriteria('this_week', today)!;
    expect(criteria).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
    expect(from <= today && today <= to).toBe(true);
    const current = replaceHistoryTiming({ query: 'Engineer', ai_enriched: false, min_score: 0 }, criteria);
    expect(replaceHistoryTiming(current, criteria)).toBe(current);
  });

  it('includes past, present and future dates in the week without changing factual date cues', () => {
    const criteria = historyTimingCriteria('this_week', '2026-11-07')!;
    const dates = [null, '2026-11-01', '2026-11-02', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'];
    expect(dates.filter((date) => date !== null && date >= criteria.follow_up_from! && date <= criteria.follow_up_to!))
      .toEqual(['2026-11-02', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(classifyFollowUpDate('2026-11-02', '2026-11-07')).toBe('past');
    expect(classifyFollowUpDate('2026-11-07', '2026-11-07')).toBe('today');
    expect(classifyFollowUpDate('2026-11-08', '2026-11-07')).toBe('upcoming');
    expect(Object.keys(followUpTimingLabels)).toEqual(['past', 'today', 'upcoming']);
  });

  it.each([
    ['2026-11-05', '2026-11-06', '2026-11-12'],
    ['2026-11-27', '2026-11-28', '2026-12-04'],
    ['2026-12-29', '2026-12-30', '2027-01-05'],
    ['2024-02-25', '2024-02-26', '2024-03-03'],
    ['2026-02-25', '2026-02-26', '2026-03-04'],
    ['1900-02-25', '1900-02-26', '1900-03-04'],
    ['2000-02-25', '2000-02-26', '2000-03-03'],
    ['2100-02-25', '2100-02-26', '2100-03-04'],
    ['0001-01-01', '0001-01-02', '0001-01-08'],
    ['9999-12-24', '9999-12-25', '9999-12-31'],
    ['9999-12-25', '9999-12-26', '9999-12-31'],
    ['9999-12-29', '9999-12-30', '9999-12-31'],
    ['9999-12-30', '9999-12-31', '9999-12-31'],
  ])('bounds Next 7 days at %s, truncating only at the supported maximum', (today, from, to) => {
    expect(historyTimingCriteria('next_7_days', today)).toEqual({ has_follow_up: true, follow_up_from: from, follow_up_to: to });
  });

  it('includes tomorrow and day seven, excluding today, day eight and unscheduled dates', () => {
    const criteria = historyTimingCriteria('next_7_days', '2026-11-05')!;
    const matches = [null, '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-12', '2026-11-13']
      .filter((date) => date !== null && date >= criteria.follow_up_from! && date <= criteria.follow_up_to!);
    expect(matches).toEqual(['2026-11-06', '2026-11-12']);
    expect(historyTimingCriteria('next_7_days', '9999-12-31')).toBeNull();
    const current = { query: 'Engineer', ai_enriched: false, min_score: 0, max_score: 0 };
    const next = replaceHistoryTiming(current, criteria);
    expect(next).toEqual({ ...current, ...criteria });
    expect(replaceHistoryTiming(next, criteria)).toBe(next);
    expect(replaceHistoryTiming(next, {})).toEqual(current);
  });
  it.each([
    ['2026-11-02', '2026-11-01', '2026-11-03'],
    ['2026-11-01', '2026-10-31', '2026-11-02'],
    ['2026-12-31', '2026-12-30', '2027-01-01'],
    ['2027-01-01', '2026-12-31', '2027-01-02'],
    ['2024-02-28', '2024-02-27', '2024-02-29'],
    ['2024-02-29', '2024-02-28', '2024-03-01'],
    ['2024-03-01', '2024-02-29', '2024-03-02'],
    ['2026-02-28', '2026-02-27', '2026-03-01'],
    ['2026-03-01', '2026-02-28', '2026-03-02'],
    ['1900-02-28', '1900-02-27', '1900-03-01'],
    ['1900-03-01', '1900-02-28', '1900-03-02'],
    ['2000-02-28', '2000-02-27', '2000-02-29'],
    ['2000-03-01', '2000-02-29', '2000-03-02'],
    ['2100-03-01', '2100-02-28', '2100-03-02'],
    ['2026-04-30', '2026-04-29', '2026-05-01'],
    ['2026-05-01', '2026-04-30', '2026-05-02'],
    ['0001-01-01', null, '0001-01-02'],
    ['9999-12-31', '9999-12-30', null],
  ])('builds strict/inclusive ranges at %s', (today, previous, next) => {
    expect(adjacentCalendarDay(today, -1)).toBe(previous);
    expect(adjacentCalendarDay(today, 1)).toBe(next);
    expect(historyTimingCriteria('past', today)).toEqual(previous ? { has_follow_up: true, follow_up_to: previous } : null);
    expect(historyTimingCriteria('today', today)).toEqual({ has_follow_up: true, follow_up_from: today, follow_up_to: today });
    expect(historyTimingCriteria('upcoming', today)).toEqual(next ? { has_follow_up: true, follow_up_from: next } : null);
  });

  it.each(['', 'invalid', '0000-01-01', '10000-01-01', '-001-01-01', '2026-1-01',
    '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-11-02T00:00:00Z', ' 2026-11-02', '2026-11-02 ', '2026-011-02', '2100-02-29'])('rejects invalid reference %s', (value) => {
    expect(adjacentCalendarDay(value, -1)).toBeNull();
    expect(adjacentCalendarDay(value, 1)).toBeNull();
    for (const preset of ['past', 'today', 'upcoming', 'last_7_days', 'next_7_days', 'last_30_days', 'next_30_days', 'last_week', 'this_week', 'next_week', 'last_month', 'this_month', 'next_month'] as const) expect(historyTimingCriteria(preset, value)).toBeNull();
  });

  it('needs no timestamps or UTC conversion', () => {
    const iso = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => { throw Error('UTC'); });
    const time = vi.spyOn(Date.prototype, 'getTime').mockImplementation(() => { throw Error('timestamp'); });
    const parse = vi.spyOn(Date, 'parse').mockImplementation(() => { throw Error('parse'); });
    const utc = (['getUTCFullYear', 'getUTCMonth', 'getUTCDate'] as const).map((method) => vi.spyOn(Date.prototype, method).mockImplementation(() => { throw Error('UTC getter'); }));
    try {
      expect(historyTimingCriteria('last_30_days', '0001-01-01')).toBeNull();
      expect(historyTimingCriteria('last_30_days', '0001-01-02')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-01' });
      expect(historyTimingCriteria('last_30_days', '2027-01-01')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-02', follow_up_to: '2026-12-31' });
      expect(historyTimingCriteria('last_30_days', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-01', follow_up_to: '9999-12-30' });
      expect(historyTimingCriteria('next_30_days', '0001-01-01')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-02', follow_up_to: '0001-01-31' });
      expect(historyTimingCriteria('next_30_days', '2026-12-31')).toEqual({ has_follow_up: true, follow_up_from: '2027-01-01', follow_up_to: '2027-01-30' });
      expect(historyTimingCriteria('next_30_days', '9999-12-30')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-31', follow_up_to: '9999-12-31' });
      expect(historyTimingCriteria('next_30_days', '9999-12-31')).toBeNull();
      expect(historyTimingCriteria('last_7_days', '0001-01-01')).toBeNull();
      expect(historyTimingCriteria('last_7_days', '0001-01-02')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-01' });
      expect(historyTimingCriteria('last_7_days', '2027-01-01')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-25', follow_up_to: '2026-12-31' });
      expect(historyTimingCriteria('last_7_days', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-24', follow_up_to: '9999-12-30' });
      expect(historyTimingCriteria('last_week', '2027-01-04')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-28', follow_up_to: '2027-01-03' });
      expect(historyTimingCriteria('last_week', '0001-01-01')).toBeNull();
      expect(historyTimingCriteria('last_week', '0001-01-08')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-07' });
      expect(historyTimingCriteria('last_week', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-20', follow_up_to: '9999-12-26' });
      expect(historyTimingCriteria('last_month', '2027-01-31')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-01', follow_up_to: '2026-12-31' });
      expect(historyTimingCriteria('last_month', '0001-02-01')).toEqual({ has_follow_up: true, follow_up_from: '0001-01-01', follow_up_to: '0001-01-31' });
      expect(historyTimingCriteria('last_month', '0001-01-31')).toBeNull();
      expect(historyTimingCriteria('last_month', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-11-01', follow_up_to: '9999-11-30' });
      expect(historyTimingCriteria('past', '2026-03-08')).toEqual({ has_follow_up: true, follow_up_to: '2026-03-07' });
      expect(historyTimingCriteria('upcoming', '2026-11-01')).toEqual({ has_follow_up: true, follow_up_from: '2026-11-02' });
      expect(historyTimingCriteria('next_7_days', '2026-12-29')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-30', follow_up_to: '2027-01-05' });
      expect(historyTimingCriteria('this_week', '2026-12-31')).toEqual({ has_follow_up: true, follow_up_from: '2026-12-28', follow_up_to: '2027-01-03' });
      expect(historyTimingCriteria('next_week', '2026-12-31')).toEqual({ has_follow_up: true, follow_up_from: '2027-01-04', follow_up_to: '2027-01-10' });
      expect(historyTimingCriteria('this_month', '9999-12-31')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-01', follow_up_to: '9999-12-31' });
      expect(historyTimingCriteria('next_month', '2026-12-31')).toEqual({ has_follow_up: true, follow_up_from: '2027-01-01', follow_up_to: '2027-01-31' });
      expect(historyTimingCriteria('next_month', '9999-11-30')).toEqual({ has_follow_up: true, follow_up_from: '9999-12-01', follow_up_to: '9999-12-31' });
    } finally { iso.mockRestore(); time.mockRestore(); parse.mockRestore(); utc.forEach((spy) => spy.mockRestore()); }
  });

  it.each([0, -1, 10000])('rejects out-of-range browser year %s', (year) => {
    const date = new Date(2026, 0, 1); date.setFullYear(year);
    expect(historyTimingCriteria('today', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('this_week', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('next_week', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('last_week', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('last_7_days', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('last_30_days', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('next_30_days', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('this_month', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('next_month', localCalendarDay(date))).toBeNull();
    expect(historyTimingCriteria('last_month', localCalendarDay(date))).toBeNull();
  });

  it.each(['today', 'last_30_days', 'next_30_days', 'last_7_days', 'last_week', 'next_week', 'last_month', 'this_month', 'next_month'] as const)('replaces only timing and retains identity for equivalent parameters (%s)', (preset) => {
    const unrelated = { query: 'Engineer', ai_enriched: false, min_score: 0, max_score: 0, application_status: 'applied' as const, sort: 'follow_up_asc' as const };
    const current = Object.freeze({ ...unrelated, has_follow_up: false, follow_up_from: '2026-01-01' });
    const today = historyTimingCriteria(preset, '2026-11-02')!;
    const result = replaceHistoryTiming(current, today);
    expect(result).toEqual({ ...unrelated, ...today });
    expect(replaceHistoryTiming(result, today)).toBe(result);
    expect(replaceHistoryTiming(result, {})).toEqual(unrelated);
    expect(current.has_follow_up).toBe(false);
  });
});
