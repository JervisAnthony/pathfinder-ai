import { expect, it } from 'vitest';
import { validateBoardFollowUpFilters } from '../boardFollowUpFilters';

it.each(['0001-01-01', '1900-02-28', '2000-02-29', '2024-02-29', '2026-10-21', '9999-12-31'])('accepts canonical calendar date %s without time conversion', (date) => {
  expect(validateBoardFollowUpFilters({ status: 'all', from: date, to: date })).toBeNull();
  expect(validateBoardFollowUpFilters({ status: 'yes', from: date, to: '' })).toBeNull();
});

it.each(['not a date', '2026-1-01', '20261021', '2026-10-21T00:00:00Z', '2026-10-21T05:30:00+05:30', ' 2026-10-21', '0000-01-01', '10000-01-01', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-04-31', '2026-02-29', '1900-02-29', '2100-02-29'])('rejects noncanonical or invalid calendar date %s in either bound', (date) => {
  expect(validateBoardFollowUpFilters({ status: 'all', from: date, to: '' })).toContain('YYYY-MM-DD');
  expect(validateBoardFollowUpFilters({ status: 'yes', from: '', to: date })).toContain('YYYY-MM-DD');
});

it('rejects inverted bounds and unscheduled dates without silently changing their meaning', () => {
  expect(validateBoardFollowUpFilters({ status: 'yes', from: '2026-10-22', to: '2026-10-21' })).toContain('on or before');
  for (const bounds of [{ from: '2026-10-21', to: '' }, { from: '', to: '2026-10-21' }]) {
    expect(validateBoardFollowUpFilters({ status: 'no', ...bounds })).toContain('Scheduled or All');
  }
  expect(validateBoardFollowUpFilters({ status: 'no', from: '', to: '' })).toBeNull();
});
