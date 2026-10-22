import { describe, expect, it } from 'vitest';
import { emptyBoardScoreFilters, parseBoardScoreFilters } from '../boardScoreFilters';

describe('Board score parsing', () => {
  it.each([
    ['', '', {}], ['  ', '\t', {}], ['0', '', { min: 0 }], ['', '0', { max: 0 }],
    ['', '100', { max: 100 }], ['70', '', { min: 70 }], ['', '85.5', { max: 85.5 }],
    ['0', '0', { min: 0, max: 0 }], ['100', '100', { min: 100, max: 100 }],
    ['0', '100', { min: 0, max: 100 }], ['72.25', '87.75', { min: 72.25, max: 87.75 }],
    ['1e1', '9e1', { min: 10, max: 90 }], ['.125', '99.123456789', { min: 0.125, max: 99.123456789 }],
  ])('parses %s / %s without rounding', (min, max, bounds) => {
    expect(parseBoardScoreFilters({ min: String(min), max: String(max) })).toEqual({ bounds });
  });
  it.each(['-1', '100.01', 'Infinity', '-Infinity', 'NaN', '1e309', 'no', '-', '.', '1e', '1e-', '0x10', '0b10', '1,5', '1.'])('rejects invalid %s in either bound', (value) => {
    expect(parseBoardScoreFilters({ min: value, max: '' }).error).toContain('Minimum');
    expect(parseBoardScoreFilters({ min: '', max: value }).error).toContain('Maximum');
  });
  it('rejects reversed ranges and produces independent empty drafts', () => {
    expect(parseBoardScoreFilters({ min: '90', max: '80' }).error).toContain('no greater');
    expect(emptyBoardScoreFilters()).toEqual({ min: '', max: '' });
    expect(emptyBoardScoreFilters()).not.toBe(emptyBoardScoreFilters());
  });
});
