export interface BoardFollowUpFilters {
  status: 'all' | 'yes' | 'no';
  from: string;
  to: string;
}

export const emptyBoardFollowUpFilters = (): BoardFollowUpFilters => ({ status: 'all', from: '', to: '' });

function isCalendarDate(value: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

export function validateBoardFollowUpFilters({ status, from, to }: BoardFollowUpFilters): string | null {
  if ([from, to].some((value) => value !== '' && !isCalendarDate(value))) {
    return 'Use valid follow-up calendar dates in YYYY-MM-DD format, from 0001-01-01 to 9999-12-31.';
  }
  if (status === 'no' && (from || to)) return 'Choose Scheduled or All when using follow-up date bounds.';
  if (from && to && from > to) return 'Follow-up from must be on or before Follow-up to.';
  return null;
}
