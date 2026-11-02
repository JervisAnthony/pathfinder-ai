import type { AnalysisHistoryFilters } from '../../api/pathfinder';
import { isCalendarDate } from './boardFollowUpFilters';
import type { FollowUpTiming } from './followUpTiming';

export const timingPresetLabels: Record<FollowUpTiming, string> = {
  past: 'Past dates', today: 'Today', upcoming: 'Upcoming dates',
};

type TimingCriteria = Pick<AnalysisHistoryFilters, 'has_follow_up' | 'follow_up_from' | 'follow_up_to'>;

function calendarDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Date-only arithmetic within the server's supported Gregorian calendar. */
export function adjacentCalendarDay(value: string, direction: -1 | 1): string | null {
  if (!isCalendarDate(value)) return null;
  let [year, month, day] = value.split('-').map(Number);
  day += direction;
  if (day === 0) {
    month -= 1;
    if (month === 0) { year -= 1; month = 12; }
    if (year < 1) return null;
    day = 31;
    while (!isCalendarDate(calendarDay(year, month, day))) day -= 1;
  } else if (!isCalendarDate(calendarDay(year, month, day))) {
    day = 1; month += 1;
    if (month === 13) { year += 1; month = 1; }
    if (year > 9999) return null;
  }
  return calendarDay(year, month, day);
}

export function historyTimingCriteria(preset: FollowUpTiming, today: string): TimingCriteria | null {
  if (!isCalendarDate(today)) return null;
  if (preset === 'today') return { has_follow_up: true, follow_up_from: today, follow_up_to: today };
  const boundary = adjacentCalendarDay(today, preset === 'past' ? -1 : 1);
  if (boundary === null) return null;
  return preset === 'past'
    ? { has_follow_up: true, follow_up_to: boundary }
    : { has_follow_up: true, follow_up_from: boundary };
}

/** Replace only timing criteria, retaining identity when no request change is needed. */
export function replaceHistoryTiming(current: AnalysisHistoryFilters, timing: TimingCriteria): AnalysisHistoryFilters {
  if (current.has_follow_up === timing.has_follow_up
    && current.follow_up_from === timing.follow_up_from && current.follow_up_to === timing.follow_up_to) return current;
  const next = { ...current };
  delete next.has_follow_up; delete next.follow_up_from; delete next.follow_up_to;
  return { ...next, ...timing };
}
