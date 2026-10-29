import { isCalendarDate } from './boardFollowUpFilters';

export type FollowUpTiming = 'past' | 'today' | 'upcoming';

export const followUpTimingLabels: Record<FollowUpTiming, string> = {
  past: 'Past follow-up date',
  today: 'Follow-up today',
  upcoming: 'Upcoming follow-up',
};

export function localCalendarDay(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function classifyFollowUpDate(savedDate: string | null, localToday: string): FollowUpTiming | null {
  if (savedDate === null || !isCalendarDate(savedDate) || !isCalendarDate(localToday)) return null;
  if (savedDate === localToday) return 'today';
  return savedDate < localToday ? 'past' : 'upcoming';
}
