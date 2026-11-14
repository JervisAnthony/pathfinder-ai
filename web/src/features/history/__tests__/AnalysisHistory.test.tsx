import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeCandidateJob,
  ApiError,
  compareSavedAnalyses,
  deleteSavedAnalysis,
  downloadSavedAnalysis,
  downloadApplicationPipelineCsv,
  getAnalysisHistory,
  getApplicationPipelineOverview,
  getAnalysisTracking,
  getAnalysisTrackingHistory,
  getAnalysisNote,
  getAnalysisFollowUp,
  updateAnalysisFollowUp,
  clearAnalysisFollowUp,
  updateAnalysisNote,
  clearAnalysisNote,
  getSavedAnalysis,
  updateAnalysisTracking,
} from '../../../api/pathfinder';
import { SavedAnalysisDetail, SavedAnalysisSummary, SavedAnalysisComparison } from '../../../types/api';
import { AnalysisHistory } from '../AnalysisHistory';
import { SavedAnalysisDetail as SavedDetailView } from '../SavedAnalysisDetail';
import { formatCalendarDate, formatSavedTimestamp } from '../formatting';
import { savedAnalysisDetailToAnalysisResponse } from '../mapping';
import { applicationStatuses } from '../status';
import type { ApplicationPipelineOverview as PipelineOverview } from '../../../types/api';

vi.mock('../../../api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/pathfinder')>(),
  getAnalysisHistory: vi.fn(),
  getApplicationPipelineOverview: vi.fn(),
  compareSavedAnalyses: vi.fn(),
  getSavedAnalysis: vi.fn(),
  getAnalysisTracking: vi.fn(),
  getAnalysisTrackingHistory: vi.fn(),
  getAnalysisNote: vi.fn(),
  getAnalysisFollowUp: vi.fn(),
  updateAnalysisFollowUp: vi.fn(),
  clearAnalysisFollowUp: vi.fn(),
  updateAnalysisNote: vi.fn(),
  clearAnalysisNote: vi.fn(),
  updateAnalysisTracking: vi.fn(),
  deleteSavedAnalysis: vi.fn(),
  downloadSavedAnalysis: vi.fn(),
  downloadApplicationPipelineCsv: vi.fn(),
  analyzeCandidateJob: vi.fn(),
}));

const summary: SavedAnalysisSummary = {
  analysis_id: '65a88a10-4749-4a23-8079-890220dd5997',
  created_at: '2026-09-03T10:00:00Z',
  job_title: 'Platform Engineer',
  company_name: null,
  score: null,
  ai_enriched: true,
  application_status: 'not_applied',
  status_updated_at: null,
  follow_up_on: null,
};

beforeEach(() => {
  vi.mocked(getApplicationPipelineOverview).mockReset();
  // Isolate existing list/detail tests from the independently loading overview.
  // The overview integration tests below provide their own explicit responses.
  vi.mocked(getApplicationPipelineOverview).mockReturnValue(new Promise(() => {}));
  vi.mocked(getAnalysisFollowUp).mockReset();
  vi.mocked(getAnalysisFollowUp).mockResolvedValue({ analysis_id: summary.analysis_id, follow_up_on: null, updated_at: null });
  vi.mocked(updateAnalysisFollowUp).mockReset();
  vi.mocked(clearAnalysisFollowUp).mockReset();
  vi.mocked(getAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'not_applied', updated_at: null });
  vi.mocked(getAnalysisTrackingHistory).mockReset();
  vi.mocked(getAnalysisTrackingHistory).mockResolvedValue({ items: [] });
  vi.mocked(getAnalysisNote).mockReset();
  vi.mocked(getAnalysisNote).mockResolvedValue({ analysis_id: summary.analysis_id, content: null, updated_at: null });
});

const detail: SavedAnalysisDetail = {
  analysis_id: summary.analysis_id,
  created_at: summary.created_at,
  candidate_profile: {
    skills: [{ name: 'python' }],
    experience: [{
      role_title: { title: 'Developer' },
      company_name: 'Fictional Labs',
      duration_months: 18,
      description: '<script>alert("no")</script>',
      skills: [{ name: 'python' }],
    }],
    education: [{ level: 'bachelor', field_of_study: 'Computing', institution: 'Example University' }],
    projects: [{ name: 'Portfolio', skills: [] }],
    certifications: [{ name: 'Cloud Basics' }],
    preferences: {
      target_titles: [{ title: 'Platform Engineer' }],
      preferred_locations: ['Remote'],
      acceptable_work_modes: ['remote'],
    },
  },
  job_description: {
    title: { title: 'Platform Engineer' },
    company_info: { name: 'Example Systems', industry: 'Technology', location: 'Remote' },
    responsibilities: [{ description: 'Build platforms' }],
    required_skills: [{ name: 'python' }],
    preferred_skills: [{ name: 'docker' }],
    experience_requirement: { minimum_years: 2, maximum_years: 4 },
    education_requirement: { level: 'bachelor', field_of_study: 'Computing' },
  },
  score: { value: 75 },
  explanation: {
    score: { value: 75 },
    components: [{ kind: 'required_skills', earned_points: 1, possible_points: 1 }],
    matched_skills: [],
    experience: null,
    education: null,
    gaps: { missing_required_skills: [], missing_preferred_skills: [{ name: 'docker' }], experience_gap: null, education_gap: null },
    keyword_coverage: { matched_keywords: [{ name: 'python' }], missing_keywords: [{ name: 'docker' }], percentage: 50 },
  },
  interview_preparation: {
    themes: [{ kind: 'strength', description: 'Discuss Python' }],
    talking_points: [{ description: 'Python delivery' }],
    question_categories: ['technical'],
    candidate_questions: [{ description: 'How are platforms operated?' }],
  },
  learning_recommendations: {
    items: [{
      kind: 'preferred_skill',
      priority: 'medium',
      topic: 'docker',
      title: 'Build Docker capability',
      rationale: 'Docker is preferred.',
      suggested_course_topic: 'docker fundamentals',
    }],
  },
  ai_enrichment: { provider_name: 'OpenAI', content: 'Historical insight' },
};

describe('History List timing quick filters', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 2, 12));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

  it.each([
    ['Past dates', { has_follow_up: true, follow_up_to: '2026-11-01' }, '', '2026-11-01'],
    ['Today', { has_follow_up: true, follow_up_from: '2026-11-02', follow_up_to: '2026-11-02' }, '2026-11-02', '2026-11-02'],
    ['Upcoming dates', { has_follow_up: true, follow_up_from: '2026-11-03' }, '2026-11-03', ''],
    ['Next 7 days', { has_follow_up: true, follow_up_from: '2026-11-03', follow_up_to: '2026-11-09' }, '2026-11-03', '2026-11-09'],
    ['This week', { has_follow_up: true, follow_up_from: '2026-11-02', follow_up_to: '2026-11-08' }, '2026-11-02', '2026-11-08'],
    ['Next week', { has_follow_up: true, follow_up_from: '2026-11-09', follow_up_to: '2026-11-15' }, '2026-11-09', '2026-11-15'],
    ['This month', { has_follow_up: true, follow_up_from: '2026-11-01', follow_up_to: '2026-11-30' }, '2026-11-01', '2026-11-30'],
    ['Next month', { has_follow_up: true, follow_up_from: '2026-12-01', follow_up_to: '2026-12-31' }, '2026-12-01', '2026-12-31'],
  ] as const)('applies %s immediately, synchronizes only timing drafts, and preserves all applied criteria', async (name, timing, from, to) => {
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    const changes = { 'Search job title or company': 'Engineer', 'AI enrichment': 'no', 'Application status': 'applied', 'Minimum score': '0', 'Maximum score': '0', 'Sort order': 'follow_up_asc' };
    for (const [label, value] of Object.entries(changes)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    click('Apply filters');
    const applied = { query: 'Engineer', ai_enriched: false, application_status: 'applied', min_score: 0, max_score: 0, sort: 'follow_up_asc' };
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, applied));
    for (const [label, value] of Object.entries({ 'Search job title or company': 'Designer', 'AI enrichment': 'yes', 'Application status': 'rejected', 'Minimum score': '10', 'Maximum score': '20', 'Sort order': 'created_desc', 'Follow-up status': 'no', 'Follow-up from': '2026-12-01', 'Follow-up to': '2026-01-01' })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const button = screen.getByRole('button', { name }); button.focus(); click(name);
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { ...applied, ...timing }));
    expect(button).toHaveFocus(); expect(button).toHaveAttribute('type', 'button'); expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('Designer');
    expect(screen.getByLabelText('AI enrichment')).toHaveValue('yes'); expect(screen.getByLabelText('Application status')).toHaveValue('rejected');
    expect(screen.getByLabelText('Minimum score')).toHaveValue(10); expect(screen.getByLabelText('Maximum score')).toHaveValue(20); expect(screen.getByLabelText('Sort order')).toHaveValue('created_desc');
    expect(screen.getByLabelText('Follow-up status')).toHaveValue('yes');
    expect(screen.getByLabelText('Follow-up from')).toHaveValue(from); expect(screen.getByLabelText('Follow-up to')).toHaveValue(to);
    expect(screen.getByText(`Applied: ${name}. As of: 2026-11-02.`)).toBeVisible();
    const calls = vi.mocked(getAnalysisHistory).mock.calls.length; click(name);
    await act(async () => {}); expect(getAnalysisHistory).toHaveBeenCalledTimes(calls);
    click('Clear timing filter'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, applied));
    expect(screen.getByLabelText('Follow-up status')).toHaveValue('all'); expect(screen.getByLabelText('Follow-up from')).toHaveValue(''); expect(screen.getByLabelText('Follow-up to')).toHaveValue('');
    expect(screen.queryByText(/^Applied:/)).toBeNull(); expect(screen.getByLabelText('Search job title or company')).toHaveValue('Designer');
    click('Apply filters'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'Designer', ai_enriched: true, application_status: 'rejected', min_score: 10, max_score: 20 }));
    click(name); click('Clear filters'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
    expect(screen.queryByText(/^Applied:/)).toBeNull(); expect(screen.getByLabelText('Search job title or company')).toHaveValue('');
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(clearAnalysisFollowUp).not.toHaveBeenCalled(); expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it.each([['This week', 7, '2026-11-02', '2026-11-08', '2026-11-09', '2026-11-15'], ['Next week', 14, '2026-11-16', '2026-11-22', '2026-11-23', '2026-11-29'], ['This month', 29, '2026-11-01', '2026-11-30', '2026-12-01', '2026-12-31'], ['Next month', 29, '2026-12-01', '2026-12-31', '2027-01-01', '2027-01-31']] as const)('keeps %s bounds fixed until reapplication, resetting pagination only once', async (preset, day, from, to, nextFrom, nextTo) => {
    vi.setSystemTime(new Date(2026, 10, day, 12));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, offset) => ({ items: Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `Week ${offset}-${i}` })) }));
    const view = render(<AnalysisHistory />); await screen.findByText('Week 0-0');
    click('Next'); await screen.findByText('Week 20-0');
    const before = vi.mocked(getAnalysisHistory).mock.calls.length;
    click(preset); await screen.findByText('Week 0-0');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(before + 1);
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: from, follow_up_to: to });
    click('Next'); await screen.findByText('Week 20-0');
    click(preset); await screen.findByText('Week 0-0');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(before + 3);
    vi.setSystemTime(new Date(2026, 10, day + 1, 12)); click(preset);
    await act(async () => {}); expect(getAnalysisHistory).toHaveBeenCalledTimes(before + 3);
    expect(screen.getByText(`Applied: ${preset}. As of: 2026-11-${String(day + 1).padStart(2, '0')}.`)).toBeVisible();
    vi.setSystemTime(new Date(2026, 10, day + 2, 0, 1)); view.rerender(<AnalysisHistory />);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(before + 3);
    expect(screen.getByText(`Applied: ${preset}. As of: 2026-11-${String(day + 1).padStart(2, '0')}.`)).toBeVisible();
    click(preset); await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(before + 4));
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: nextFrom, follow_up_to: nextTo });
    click('Apply filters'); expect(screen.queryByText(/^Applied:/)).toBeNull();
    await act(async () => {}); expect(getAnalysisHistory).toHaveBeenCalledTimes(before + 5);
  });

  it.each([
    { preset: 'This week', listDay: 7, boardMonth: 10, listBounds: ['2026-11-02', '2026-11-08'], boardBounds: ['2026-11-09', '2026-11-15'], bulkDates: [],
      dates: ['2026-11-01', '2026-11-02', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-15', '2026-11-16', null] },
    { preset: 'Next week', listDay: 7, boardMonth: 10, listBounds: ['2026-11-09', '2026-11-15'], boardBounds: ['2026-11-16', '2026-11-22'], bulkDates: ['2026-11-10', '2026-11-18'],
      dates: ['2026-11-08', '2026-11-09', '2026-11-12', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-22', '2026-11-23', null] },
    { preset: 'This month', listDay: 7, boardMonth: 11, listBounds: ['2026-11-01', '2026-11-30'], boardBounds: ['2026-12-01', '2026-12-31'], bulkDates: ['2026-11-10', '2026-12-18'],
      dates: ['2026-10-31', '2026-11-01', '2026-11-05', '2026-11-07', '2026-11-30', '2026-12-01', '2026-12-31', '2027-01-01', null] },
    { preset: 'Next month', listDay: 13, boardMonth: 11, listBounds: ['2026-12-01', '2026-12-31'], boardBounds: ['2027-01-01', '2027-01-31'], bulkDates: ['2026-12-15', '2027-01-18'],
      dates: ['2026-11-30', '2026-12-01', '2026-12-05', '2026-12-13', '2026-12-31', '2027-01-01', '2027-01-31', '2027-02-01', null] },
  ])('keeps List and Board ranges and exports independent while Overview remains global ($preset)', async ({ preset, listDay, boardMonth, listBounds, boardBounds, bulkDates, dates }) => {
    vi.setSystemTime(new Date(2026, 10, listDay, 12));
    const rows = dates.map((date, i) => ({ ...summary, analysis_id: String(i), job_title: `Week role ${i}`, follow_up_on: date }));
    if (bulkDates.length) rows.push(...Array.from({ length: 44 }, (_, i) => ({ ...summary, analysis_id: String(i + 9), job_title: `Week role ${i + 9}`, follow_up_on: bulkDates[i < 22 ? 0 : 1] })));
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit = 20, offset = 0, filters = {}) => ({ items: rows.filter((row) =>
      (!filters.application_status || filters.application_status === row.application_status)
      && (!filters.has_follow_up || row.follow_up_on !== null)
      && (!filters.follow_up_from || (row.follow_up_on !== null && row.follow_up_on >= filters.follow_up_from))
      && (!filters.follow_up_to || (row.follow_up_on !== null && row.follow_up_on <= filters.follow_up_to))).slice(offset, offset + limit) }));
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ total_analyses: rows.length, status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? rows.length : 0 })), scheduled_follow_up_count: rows.length - 1, unscheduled_follow_up_count: 1, earliest_follow_ups: rows.slice(0, 5) as PipelineOverview['earliest_follow_ups'] });
    vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:week'); static revokeObjectURL = vi.fn(); });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(downloadApplicationPipelineCsv).mockResolvedValue(new Blob(['metadata']));
    render(<StrictMode><AnalysisHistory /></StrictMode>); await screen.findAllByText('Week role 0'); click(preset);
    const list = () => within(document.querySelector('.history-list:not(.pipeline-follow-ups)') as HTMLElement);
    await waitFor(() => expect(list().getAllByRole('listitem')).toHaveLength(bulkDates.length > 0 ? 20 : 4));
    for (const i of [1, 2, 3, 4]) expect(list().getByText(`Week role ${i}`)).toBeVisible();
    for (const i of [0, 5, 6, 7, 8]) expect(list().queryByText(`Week role ${i}`)).toBeNull();
    const overview = within(screen.getByRole('region', { name: 'Application Pipeline Overview' }));
    expect(overview.getByText('Week role 0')).toBeVisible();
    expect(overview.getByText('Total saved analyses').nextElementSibling).toHaveTextContent(String(rows.length));
    expect(overview.getByText('Scheduled follow-ups').nextElementSibling).toHaveTextContent(String(rows.length - 1));
    expect(overview.getByText('Unscheduled follow-ups').nextElementSibling).toHaveTextContent('1');
    for (const { label, value } of applicationStatuses) expect(within(overview.getByRole('region', { name: 'Application pipeline' })).getByText(label).nextElementSibling).toHaveTextContent(value === 'not_applied' ? String(rows.length) : '0');
    expect(overview.getAllByRole('listitem')).toHaveLength(5);
    const count = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unsent List' } });
    click('Board view'); const board = within(screen.getByRole('region', { name: 'Application Pipeline Board' })); await board.findByText('Week role 8');
    expect(board.getByRole('button', { name: preset })).toHaveAttribute('aria-pressed', 'false');
    vi.setSystemTime(new Date(2026, boardMonth, 9, 12)); fireEvent.click(board.getByRole('button', { name: preset }));
    await waitFor(() => expect(board.queryByText('Week role 1')).toBeNull());
    for (const i of [5, 6]) expect(board.getByText(`Week role ${i}`)).toBeVisible();
    for (const i of [0, 1, 2, 3, 4, 7, 8]) expect(board.queryByText(`Week role ${i}`)).toBeNull();
    if (bulkDates.length > 0) {
      expect(board.getAllByRole('listitem')).toHaveLength(10);
      expect(board.queryByText('Week role 52')).toBeNull();
      expect(board.getByRole('button', { name: 'Load more Not applied' })).toBeVisible();
    }
    expect(board.getByText(`Applied Board timing: ${preset}. As of: 2026-${String(boardMonth + 1).padStart(2, '0')}-09.`)).toBeVisible();
    fireEvent.change(board.getByLabelText('Search board by job title or company'), { target: { value: 'unsent Board' } });
    fireEvent.click(board.getByText('Download Board CSV')); await waitFor(() => expect(board.getByText('Download Board CSV')).toBeEnabled());
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ has_follow_up: true, follow_up_from: boardBounds[0], follow_up_to: boardBounds[1] });
    click('Download filtered CSV'); await waitFor(() => expect(screen.getByText('Download filtered CSV')).toBeEnabled());
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ has_follow_up: true, follow_up_from: listBounds[0], follow_up_to: listBounds[1] });
    click('Download all CSV'); await waitFor(() => expect(screen.getByText('Download all CSV')).toBeEnabled()); expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({});
    click('List view');
    if (bulkDates.length > 0) { expect(list().queryByText('Week role 30')).toBeNull(); expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(); }
    expect(screen.getByText(`Applied: ${preset}. As of: 2026-11-${String(listDay).padStart(2, '0')}.`)).toBeVisible();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('unsent List');
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(count);
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(clearAnalysisFollowUp).not.toHaveBeenCalled(); expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(updateAnalysisTracking).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled(); expect(clearAnalysisNote).not.toHaveBeenCalled();
    expect(getAnalysisFollowUp).not.toHaveBeenCalled(); expect(getAnalysisTracking).not.toHaveBeenCalled();
    expect(getAnalysisNote).not.toHaveBeenCalled(); expect(getSavedAnalysis).not.toHaveBeenCalled();
  });

  it.each([
    ['list', 1, 0, 1, '0001-01-01', '0001-01-31', 'This month', '0001-01-01'],
    ['board', 1, 0, 1, '0001-01-01', '0001-01-31', 'This month', '0001-01-01'],
    ['list', 9999, 11, 31, '9999-12-01', '9999-12-31', 'This month', '9999-12-31'],
    ['list', 1, 0, 1, '0001-02-01', '0001-02-28', 'Next month', '0001-01-01'],
    ['list', 9999, 10, 30, '9999-12-01', '9999-12-31', 'Next month', '9999-11-30'],
    ['board', 9999, 11, 31, '9999-12-01', '9999-12-31', 'This month', '9999-12-31'],
    ['board', 1, 0, 1, '0001-02-01', '0001-02-28', 'Next month', '0001-01-01'],
    ['board', 9999, 10, 30, '9999-12-01', '9999-12-31', 'Next month', '9999-11-30'],
  ] as const)('supports month filters in %s at year %s and preserves applied state on an invalid click', async (mode, year, month, day, from, to, preset, asOf) => {
    const date = new Date(2026, month, day, 12); date.setFullYear(year); vi.setSystemTime(date);
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [summary] : [] }));
    const view = render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    if (mode === 'board') { click('Board view'); await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText('Platform Engineer'); }
    const group = () => within(screen.getByRole('group', { name: mode === 'board' ? 'Board follow-up timing quick filters' : 'Follow-up timing quick filters' }));
    const button = group().getByRole('button', { name: preset });
    expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: from, follow_up_to: to })));
    const feedback = mode === 'board' ? `Applied Board timing: ${preset}. As of: ${asOf}.` : `Applied: ${preset}. As of: ${asOf}.`;
    const prefix = mode === 'board' ? 'Board follow-up' : 'Follow-up';
    fireEvent.change(screen.getByLabelText(`${prefix} from`), { target: { value: '2026-04-01' } });
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    const invalid = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(NaN);
    // The already enabled button must validate again before changing any state.
    expect(button).toBeEnabled(); fireEvent.click(button);
    expect(group().getByText(/This timing preset is unavailable/)).toBeVisible();
    expect(group().getByText(feedback)).toBeVisible(); expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(`${prefix} from`)).toHaveValue('2026-04-01');
    expect(screen.getByLabelText(`${prefix} to`)).toHaveValue(to);
    expect(screen.getByLabelText(`${prefix} status`)).toHaveValue('yes');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count);
    view.rerender(<AnalysisHistory />);
    for (const name of ['Past dates', 'Today', 'Upcoming dates', 'Next 7 days', 'This week', 'Next week', 'This month', 'Next month']) expect(group().getByRole('button', { name })).toBeDisabled();
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(clearAnalysisFollowUp).not.toHaveBeenCalled();
    invalid.mockRestore();
  });

  it.each((['list', 'board'] as const).flatMap((mode) => [
    { mode, preset: 'This month', year: 2026, from: '2026-12-01', to: '2026-12-31', nextFrom: '2027-01-01', nextTo: '2027-01-31' },
    { mode, preset: 'Next month', year: 2026, from: '2027-01-01', to: '2027-01-31', nextFrom: '2027-02-01', nextTo: '2027-02-28' },
    { mode, preset: 'Next month', year: 2023, from: '2024-01-01', to: '2024-01-31', nextFrom: '2024-02-01', nextTo: '2024-02-29' },
  ]))('retains captured bounds through passive year rollover and refresh in $mode ($preset, $year)', async ({ mode, preset, year, from, to, nextFrom, nextTo }) => {
    vi.setSystemTime(new Date(year, 11, 31, 12));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [summary] : [] }));
    const view = render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    if (mode === 'board') { click('Board view'); await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText('Platform Engineer'); }
    click(preset);
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: from, follow_up_to: to })));
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    vi.setSystemTime(new Date(year + 1, 0, 1, 0, 1)); view.rerender(<AnalysisHistory />);
    expect(screen.getByText(new RegExp(`${preset}. As of: ${year}-12-31`))).toBeVisible();
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count);
    click(mode === 'board' ? 'Refresh board' : 'Refresh');
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(count + (mode === 'board' ? 7 : 1)));
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: from, follow_up_to: to }));
    expect(screen.getByText(new RegExp(`${preset}. As of: ${year}-12-31`))).toBeVisible();
    click(preset);
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: nextFrom, follow_up_to: nextTo })));
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count + (mode === 'board' ? 14 : 2));
    expect(screen.getByText(new RegExp(`${preset}. As of: ${year + 1}-01-01`))).toBeVisible();
  });

  it.each((['list', 'board'] as const).flatMap((mode) => ['unsupported month', 'invalid date'].map((reason) => ({ mode, reason }))))('preserves loaded pages, drafts and applied Next month on a rejected click in $mode ($reason)', async ({ mode, reason }) => {
    vi.setSystemTime(new Date(9999, 10, 30, 12));
    const rows = Array.from({ length: 24 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `Final month role ${i}`, follow_up_on: '9999-12-15' }));
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit = 20, offset = 0, filters = {}) => ({ items: !filters.application_status || filters.application_status === 'not_applied' ? rows.slice(offset, offset + limit) : [] }));
    const view = render(<AnalysisHistory />); await screen.findByText('Final month role 0');
    if (mode === 'board') { click('Board view'); await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText('Final month role 0'); }
    click('Next month');
    await screen.findByText(/Next month. As of: 9999-11-30/);
    const records = () => within(mode === 'board' ? screen.getByRole('region', { name: 'Application Pipeline Board' }) : document.querySelector('.history-list:not(.pipeline-follow-ups)') as HTMLElement);
    click(mode === 'board' ? 'Load more Not applied' : 'Next');
    await waitFor(() => expect(records().getByText(mode === 'board' ? 'Final month role 19' : 'Final month role 23')).toBeVisible());
    const prefix = mode === 'board' ? 'Board follow-up' : 'Follow-up';
    fireEvent.change(screen.getByLabelText(`${prefix} from`), { target: { value: '9999-12-02' } });
    fireEvent.change(screen.getByLabelText(mode === 'board' ? 'Search board by job title or company' : 'Search job title or company'), { target: { value: 'unsent search' } });
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    const button = screen.getByRole('button', { name: 'Next month' }); expect(button).toBeEnabled();
    if (reason === 'unsupported month') vi.setSystemTime(new Date(9999, 11, 1, 12));
    else vi.spyOn(Date.prototype, 'getDate').mockReturnValue(NaN);
    fireEvent.click(button);
    expect(screen.getByText(/This timing preset is unavailable/)).toBeVisible();
    expect(screen.getByText(/Next month. As of: 9999-11-30/)).toBeVisible();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(`${prefix} from`)).toHaveValue('9999-12-02');
    expect(screen.getByLabelText(`${prefix} to`)).toHaveValue('9999-12-31');
    expect(screen.getByLabelText(`${prefix} status`)).toHaveValue('yes');
    expect(screen.getByLabelText(mode === 'board' ? 'Search board by job title or company' : 'Search job title or company')).toHaveValue('unsent search');
    expect(records().getByText(mode === 'board' ? 'Final month role 19' : 'Final month role 23')).toBeVisible();
    expect(records().getAllByRole('listitem')).toHaveLength(mode === 'board' ? 20 : 4);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count);
    view.rerender(<AnalysisHistory />); expect(button).toBeDisabled();
    if (reason === 'invalid date') {
      const group = within(screen.getByRole('group', { name: mode === 'board' ? 'Board follow-up timing quick filters' : 'Follow-up timing quick filters' }));
      for (const name of ['Past dates', 'Today', 'Upcoming dates', 'Next 7 days', 'This week', 'Next week', 'This month', 'Next month']) expect(group.getByRole('button', { name })).toBeDisabled();
    } else expect(screen.getByRole('button', { name: 'This month' })).toBeEnabled();
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValue(new Promise(() => {}));
    click(mode === 'board' ? 'Download Board CSV' : 'Download filtered CSV');
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ has_follow_up: true, follow_up_from: '9999-12-01', follow_up_to: '9999-12-31' });
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(clearAnalysisFollowUp).not.toHaveBeenCalled(); expect(updateAnalysisTracking).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled();
    click('Clear timing filter');
    expect(screen.queryByText(/Next month. As of:/)).toBeNull();
    await waitFor(() => expect(screen.getByLabelText(`${prefix} from`)).toHaveValue(''));
    fireEvent.change(screen.getByLabelText(`${prefix} status`), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText(`${prefix} from`), { target: { value: '9999-12-03' } });
    fireEvent.change(screen.getByLabelText(`${prefix} to`), { target: { value: '9999-12-30' } });
    if (mode === 'board') fireEvent.submit(screen.getByRole('form', { name: 'Board follow-up filters' }));
    else click('Apply filters');
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: '9999-12-03', follow_up_to: '9999-12-30' })));
  });

  it.each(['list', 'board'] as const)('allows the final supported week and rejects invalid click-time dates in %s', async (mode) => {
    vi.setSystemTime(new Date(9999, 11, 31, 12));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [summary] : [] }));
    const view = render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    if (mode === 'board') { click('Board view'); await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText('Platform Engineer'); }
    const group = () => within(screen.getByRole('group', { name: mode === 'board' ? 'Board follow-up timing quick filters' : 'Follow-up timing quick filters' }));
    expect(group().getByText('This week')).toBeEnabled(); fireEvent.click(group().getByText('This week'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: '9999-12-27', follow_up_to: '9999-12-31' })));
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    const invalid = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(NaN);
    fireEvent.click(group().getByText('This week')); expect(group().getByText(/This timing preset is unavailable/)).toBeVisible();
    view.rerender(<AnalysisHistory />); expect(group().getByText('This week')).toBeDisabled(); expect(getAnalysisHistory).toHaveBeenCalledTimes(count); invalid.mockRestore();
  });

  it.each(['list', 'board'] as const)('clamps Next week, retaining its range and attribution on an unavailable or invalid click in %s', async (mode) => {
    vi.setSystemTime(new Date(9999, 11, 26, 12));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [summary] : [] }));
    const view = render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    if (mode === 'board') { click('Board view'); await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText('Platform Engineer'); }
    const group = () => within(screen.getByRole('group', { name: mode === 'board' ? 'Board follow-up timing quick filters' : 'Follow-up timing quick filters' }));
    const button = group().getByRole('button', { name: 'Next week' });
    fireEvent.click(button);
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: '9999-12-27', follow_up_to: '9999-12-31' })));
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    const feedback = mode === 'board' ? 'Applied Board timing: Next week. As of: 9999-12-26.' : 'Applied: Next week. As of: 9999-12-26.';
    vi.setSystemTime(new Date(9999, 11, 27, 12));
    // No intervening render: the enabled button must guard the new click date.
    expect(button).toBeEnabled(); fireEvent.click(button);
    expect(group().getByText(/This timing preset is unavailable/)).toBeVisible();
    expect(group().getByText(feedback)).toBeVisible(); expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count);
    view.rerender(<AnalysisHistory />); expect(button).toBeDisabled();
    expect(group().getByText('This week')).toBeEnabled();
    vi.setSystemTime(new Date(9999, 11, 26, 12)); view.rerender(<AnalysisHistory />);
    const invalid = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(NaN);
    fireEvent.click(button); expect(group().getByText(feedback)).toBeVisible();
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count);
    invalid.mockRestore();
    const prefix = mode === 'board' ? 'Board follow-up' : 'Follow-up';
    expect(screen.getByLabelText(`${prefix} from`)).toHaveValue('9999-12-27');
    expect(screen.getByLabelText(`${prefix} to`)).toHaveValue('9999-12-31');
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(clearAnalysisFollowUp).not.toHaveBeenCalled();
  });

  it('resets Next 7 days to page one, captures a fresh local day on reapply, and removes manual attribution', async () => {
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, offset) => ({ items: Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `Window ${offset}-${i}` })) }));
    const view = render(<AnalysisHistory />); await screen.findByText('Window 0-0'); click('Next'); await screen.findByText('Window 20-0');
    click('Next 7 days'); await screen.findByText('Window 0-0');
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: '2026-11-03', follow_up_to: '2026-11-09' });
    click('Next'); await screen.findByText('Window 20-0'); click('Next 7 days'); await screen.findByText('Window 0-0');
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    vi.setSystemTime(new Date(2026, 10, 3, 0, 1)); view.rerender(<AnalysisHistory />);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count); expect(screen.getByText(/Applied: Next 7 days. As of: 2026-11-02/)).toBeVisible();
    click('Next 7 days'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: '2026-11-04', follow_up_to: '2026-11-10' }));
    click('Apply filters'); expect(screen.queryByText(/^Applied:/)).toBeNull(); await act(async () => {});
  });

  it.each(['list', 'board'] as const)('truncates supported dates and rejects invalid click-time dates in %s', async (mode) => {
    vi.setSystemTime(new Date(9999, 11, 29, 12));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [summary] : [] }));
    const view = render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    if (mode === 'board') { click('Board view'); await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText('Platform Engineer'); }
    const group = () => within(screen.getByRole('group', { name: mode === 'board' ? 'Board follow-up timing quick filters' : 'Follow-up timing quick filters' }));
    fireEvent.click(group().getByText('Next 7 days'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(mode === 'board' ? 11 : 20, 0, expect.objectContaining({ has_follow_up: true, follow_up_from: '9999-12-30', follow_up_to: '9999-12-31' })));
    expect(group().getByText(/As of: 9999-12-29/)).toBeVisible();
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    vi.setSystemTime(new Date(9999, 11, 31, 12)); fireEvent.click(group().getByText('Next 7 days'));
    expect(group().getByText(/This timing preset is unavailable/)).toBeVisible(); expect(getAnalysisHistory).toHaveBeenCalledTimes(count);
    const invalid = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(NaN); view.rerender(<AnalysisHistory />);
    expect(group().getByText('Next 7 days')).toBeDisabled(); expect(getAnalysisHistory).toHaveBeenCalledTimes(count); invalid.mockRestore();
  });

  it('resets later pages even for the same preset, captures a changed local day only on click, and removes manual attribution', async () => {
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, offset) => ({ items: Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `Role ${offset}-${i}` })) }));
    const view = render(<AnalysisHistory />); await screen.findByText('Role 0-0'); click('Next'); await screen.findByText('Role 20-0');
    click('Past dates'); await screen.findByText('Role 0-0'); expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_to: '2026-11-01' });
    click('Next'); await screen.findByText('Role 20-0'); click('Past dates'); await screen.findByText('Role 0-0');
    const count = vi.mocked(getAnalysisHistory).mock.calls.length;
    vi.setSystemTime(new Date(2026, 10, 3, 0, 1)); view.rerender(<AnalysisHistory />);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(count); expect(screen.getByText(/Applied: Past dates. As of: 2026-11-02/)).toBeVisible();
    click('Past dates'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_to: '2026-11-02' }));
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '2026-10-01' } }); click('Apply filters');
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-11-02' })); expect(screen.queryByText(/^Applied:/)).toBeNull();
  });

  it.each(['Today', 'Next week', 'This month', 'Next month'])('clears stale validation and explicitly resets native date state even for unchanged empty drafts (%s)', async (preset) => {
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '2026-12-01' } }); fireEvent.change(screen.getByLabelText('Follow-up to'), { target: { value: '2026-01-01' } }); click('Apply filters');
    expect(screen.getByRole('alert')).toHaveTextContent('Follow-up from'); click(preset); await screen.findByText(`Applied: ${preset}. As of: 2026-11-02.`); expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '10' } });
    click('Apply filters'); expect(screen.getByRole('alert')).toHaveTextContent('minimum no greater than maximum');
    click(preset); expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Minimum score')).toHaveValue(90); expect(screen.getByLabelText('Maximum score')).toHaveValue(10);
    click('Apply filters'); expect(screen.getByRole('alert')).toHaveTextContent('minimum no greater than maximum');
    expect(screen.getByText(`Applied: ${preset}. As of: 2026-11-02.`)).toBeVisible();
    const monthFrom = screen.getByLabelText('Follow-up from') as HTMLInputElement;
    const monthTo = screen.getByLabelText('Follow-up to') as HTMLInputElement;
    const expectedFrom = monthFrom.value; const expectedTo = monthTo.value;
    // Native invalid editing can expose an empty value without a React change.
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    nativeSetter.call(monthFrom, '2026-02-30'); nativeSetter.call(monthTo, 'invalid');
    const fromWrite = vi.spyOn(monthFrom, 'value', 'set'); const toWrite = vi.spyOn(monthTo, 'value', 'set');
    click(preset);
    expect(fromWrite).toHaveBeenCalledWith(expectedFrom); expect(toWrite).toHaveBeenCalledWith(expectedTo);
    expect(monthFrom).toHaveValue(expectedFrom); expect(monthTo).toHaveValue(expectedTo);
    fromWrite.mockRestore(); toWrite.mockRestore();
    click('Clear timing filter'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
    const from = screen.getByLabelText('Follow-up from') as HTMLInputElement;
    const to = screen.getByLabelText('Follow-up to') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const fromSet = vi.spyOn(from, 'value', 'set'); const toSet = vi.spyOn(to, 'value', 'set');
    // Model a native editor's value changing without a React change event.
    setter.call(from, '2026-04-01'); setter.call(to, '2026-04-02');
    click('Clear timing filter'); expect(fromSet).toHaveBeenCalledWith(''); expect(toSet).toHaveBeenCalledWith(''); expect(from).toHaveValue(''); expect(to).toHaveValue('');
  });

  it.each([[1, 0, 1, 'Past dates'], [9999, 11, 31, 'Upcoming dates'], [9999, 11, 31, 'Next 7 days'], [10000, 0, 1, 'Today'], [0, 0, 1, 'Today'], [0, 0, 1, 'This week'], [10000, 0, 1, 'This week'], [0, 0, 1, 'Next week'], [10000, 0, 1, 'Next week'], [9999, 11, 27, 'Next week'], [0, 0, 1, 'This month'], [10000, 0, 1, 'This month'], [0, 0, 1, 'Next month'], [10000, 0, 1, 'Next month'], [9999, 11, 1, 'Next month'], [9999, 11, 15, 'Next month'], [9999, 11, 31, 'Next month']] as const)('safely disables unavailable presets at year %s', async (year, month, day, name) => {
    const date = new Date(2026, month, day, 12); date.setFullYear(year); vi.setSystemTime(date);
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    const button = screen.getByRole('button', { name }); expect(button).toBeDisabled(); click(name);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1); expect(screen.getByText(/Supported dates:/)).toBeVisible();
    if (year === 1 || year === 9999) { click('Today'); await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(2)); }
  });

  it('checks the click-time date again if the clock becomes unsupported without a rerender', async () => {
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    const date = new Date(2026, 0, 1); date.setFullYear(10000); vi.setSystemTime(date); click('Today');
    expect(screen.getByText(/This timing preset is unavailable/)).toBeVisible(); expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
  });

  it.each(['Today', 'Next 7 days', 'This week', 'Next week', 'This month', 'Next month'])('uses browser-local click components when the UTC day differs (%s)', async (preset) => {
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    vi.setSystemTime(new Date('2026-12-31T12:01:00Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2027); vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0); vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1);
    click(preset); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: preset === 'Next month' ? '2027-02-01' : preset === 'This month' ? '2027-01-01' : preset === 'Next week' ? '2027-01-04' : preset === 'This week' ? '2026-12-28' : preset === 'Today' ? '2027-01-01' : '2027-01-02', follow_up_to: preset === 'Next month' ? '2027-02-28' : preset === 'This month' ? '2027-01-31' : preset === 'Next week' ? '2027-01-10' : preset === 'This week' ? '2027-01-03' : preset === 'Today' ? '2027-01-01' : '2027-01-08' }));
  });

  it.each(['Upcoming dates', 'Next 7 days', 'Next week'])('uses server pages and exports all matches, keeping Board and Overview independent during a pending CSV (%s)', async (preset) => {
    const records = Array.from({ length: 45 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `Saved role ${i}`, follow_up_on: i < 22 ? '2026-11-01' : i < 43 ? '2026-11-02' : i === 43 ? (preset === 'Next week' ? '2026-11-09' : '2026-11-03') : null }));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit = 20, offset = 0, criteria = {}) => {
      const matches = records.filter((item) => (!criteria.has_follow_up || item.follow_up_on !== null)
        && (!criteria.follow_up_from || (item.follow_up_on !== null && item.follow_up_on >= criteria.follow_up_from))
        && (!criteria.follow_up_to || (item.follow_up_on !== null && item.follow_up_on <= criteria.follow_up_to))
        && (!criteria.application_status || criteria.application_status === item.application_status));
      return { items: matches.slice(offset, offset + _limit) };
    });
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ total_analyses: 45, status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 45 : 0 })), scheduled_follow_up_count: 44, unscheduled_follow_up_count: 1, earliest_follow_ups: records.slice(0, 5) as PipelineOverview['earliest_follow_ups'] });
    const createUrl = vi.fn(() => 'blob:timing'); const revokeUrl = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let resolveCsv!: (blob: Blob) => void;
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValueOnce(new Promise((resolve) => { resolveCsv = resolve; })).mockResolvedValue(new Blob(['metadata']));
    render(<AnalysisHistory />); await screen.findAllByText('Saved role 0'); click('Today');
    await screen.findByRole('button', { name: /Saved role 22/ }); expect(screen.queryByRole('button', { name: /Saved role 44/ })).toBeNull();
    expect(screen.getAllByText('Follow-up today')).toHaveLength(20);
    click('Next'); await screen.findByText('Saved role 42'); expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { has_follow_up: true, follow_up_from: '2026-11-02', follow_up_to: '2026-11-02' });
    click('Download filtered CSV'); click(preset); await screen.findByText('Saved role 43');
    expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(1, { has_follow_up: true, follow_up_from: '2026-11-02', follow_up_to: '2026-11-02' });
    click('Download all CSV'); await waitFor(() => expect(screen.getByText('Download all CSV')).toBeEnabled()); expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(2, {});
    await act(async () => resolveCsv(new Blob(['all 21 matching metadata rows']))); expect(revokeUrl).toHaveBeenCalledTimes(2);
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    const listCalls = vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20).length;
    click('Board view'); const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' })); await board.findByText('Saved role 0');
    for (const { value } of applicationStatuses) expect(getAnalysisHistory).toHaveBeenCalledWith(11, 0, { application_status: value });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(listCalls + 7); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    expect(within(screen.getByRole('region', { name: 'Application Pipeline Overview' })).getAllByText('Past follow-up date')).toHaveLength(5);
    fireEvent.click(board.getByRole('button', { name: 'Past dates' })); await board.findByText('Applied Board timing: Past dates. As of: 2026-11-02.');
    for (const { value } of applicationStatuses) expect(getAnalysisHistory).toHaveBeenCalledWith(11, 0, { application_status: value, has_follow_up: true, follow_up_to: '2026-11-01' });
    fireEvent.click(board.getByText('Download Board CSV')); await waitFor(() => expect(board.getByText('Download Board CSV')).toBeEnabled());
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ has_follow_up: true, follow_up_to: '2026-11-01' });
    click('Download filtered CSV'); await waitFor(() => expect(screen.getByText('Download filtered CSV')).toBeEnabled());
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ has_follow_up: true, follow_up_from: preset === 'Next week' ? '2026-11-09' : '2026-11-03', ...(preset === 'Next week' ? { follow_up_to: '2026-11-15' } : preset === 'Next 7 days' ? { follow_up_to: '2026-11-09' } : {}) });
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    click('List view'); expect(screen.getByText(`Applied: ${preset}. As of: 2026-11-02.`)).toBeVisible(); expect(screen.getByText('Saved role 43')).toBeVisible();
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(clearAnalysisFollowUp).not.toHaveBeenCalled(); expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it.each(['Today', 'Next week', 'This month', 'Next month'])('rejects stale preset responses, recovers on Refresh, and protects unmount in StrictMode (%s)', async (preset) => {
    const view = render(<StrictMode><AnalysisHistory /></StrictMode>); await screen.findByText('Platform Engineer');
    let resolveOld!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    click('Past dates'); expect(screen.getByText('Loading saved analyses…')).toBeVisible();
    vi.mocked(getAnalysisHistory).mockResolvedValueOnce({ items: [{ ...summary, job_title: 'Current', follow_up_on: preset === 'Next month' ? '2026-12-15' : '2026-11-09' }] }); click(preset); await screen.findByText('Current');
    await act(async () => resolveOld({ items: [{ ...summary, job_title: 'STALE' }] })); expect(screen.queryByText('STALE')).toBeNull();
    vi.mocked(getAnalysisHistory).mockRejectedValueOnce(new Error('PRIVATE')); click('Upcoming dates'); expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
    vi.mocked(getAnalysisHistory).mockResolvedValueOnce({ items: [] }); click('Refresh'); await screen.findByText('No saved analyses match these filters.');
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: true, follow_up_from: '2026-11-03' });
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })); click(preset); view.unmount();
    await act(async () => resolveOld({ items: [{ ...summary, job_title: 'AFTER UNMOUNT' }] })); expect(screen.queryByText('AFTER UNMOUNT')).toBeNull();
  });

  it.each([['reschedule', 'Today'], ['clear', 'Today'], ['failure', 'Today'], ['reschedule', 'Next 7 days'], ['clear', 'Next 7 days'], ['failure', 'Next 7 days'], ['reschedule', 'This week'], ['clear', 'This week'], ['failure', 'This week'], ['reschedule', 'Next week'], ['clear', 'Next week'], ['failure', 'Next week'], ['reschedule', 'This month'], ['clear', 'This month'], ['failure', 'This month'], ['reschedule', 'Next month'], ['clear', 'Next month'], ['failure', 'Next month']] as const)('preserves the preset on authoritative Board %s and lets server filtering remove changed dates (%s)', async (action, preset) => {
    let date: string | null = preset === 'Next month' ? '2026-12-15' : preset === 'Next week' ? '2026-11-09' : preset === 'Today' ? '2026-11-02' : '2026-11-03';
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, criteria = {}) => ({ items:
      (!criteria.application_status || criteria.application_status === 'not_applied')
      && (!criteria.has_follow_up || date !== null)
      && (!criteria.follow_up_to || (date !== null && date <= criteria.follow_up_to))
      && (!criteria.follow_up_from || (date !== null && date >= criteria.follow_up_from)) ? [{ ...summary, follow_up_on: date }] : [] }));
    vi.mocked(getAnalysisFollowUp).mockImplementation(async () => ({ analysis_id: summary.analysis_id, follow_up_on: date, updated_at: null }));
    vi.mocked(updateAnalysisFollowUp).mockImplementation(async (id, value) => {
      if (action === 'failure') throw Error('PRIVATE');
      date = value; return { analysis_id: id, follow_up_on: date, updated_at: null };
    });
    vi.mocked(clearAnalysisFollowUp).mockImplementation(async () => { date = null; });
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer'); click(preset); await screen.findByText(`Applied: ${preset}. As of: 2026-11-02.`);
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unsent' } });
    click('Board view'); fireEvent.click(await screen.findByRole('button', { name: 'Edit follow-up' })); const input = await screen.findByLabelText('Follow-up date');
    if (action === 'clear') {
      click('Clear follow-up'); fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear follow-up'));
      await screen.findByText('Follow-up date cleared.');
    } else {
      fireEvent.change(input, { target: { value: preset === 'Next month' ? '2027-01-01' : preset === 'This month' ? '2026-12-01' : preset === 'Next week' ? '2026-11-16' : '2026-11-10' } }); click('Save follow-up');
      if (action === 'failure') expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
      else await screen.findByText('Follow-up date saved.');
    }
    click('List view'); expect(screen.getByText(`Applied: ${preset}. As of: 2026-11-02.`)).toBeVisible(); expect(screen.getByLabelText('Search job title or company')).toHaveValue('unsent');
    if (action === 'failure') expect(screen.getByRole('button', { name: /Platform Engineer/ })).toBeVisible();
    else {
      expect(screen.getByText('No saved analyses match these filters.')).toBeVisible();
      expect(getAnalysisHistory).toHaveBeenCalledWith(20, 0, { has_follow_up: true, follow_up_from: preset === 'Next month' ? '2026-12-01' : preset === 'This month' ? '2026-11-01' : preset === 'Next week' ? '2026-11-09' : preset === 'Next 7 days' ? '2026-11-03' : '2026-11-02', follow_up_to: preset === 'Next month' ? '2026-12-31' : preset === 'This month' ? '2026-11-30' : preset === 'Next week' ? '2026-11-15' : preset === 'This week' ? '2026-11-08' : preset === 'Today' ? '2026-11-02' : '2026-11-09' });
    }
  });
});

describe('History List follow-up date cues', () => {
  const list = () => within(screen.getAllByRole('list').find((node) => node.classList.contains('history-list') && !node.classList.contains('pipeline-follow-ups'))!);
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 30, 12));
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('associates visible static cues with saved dates across statuses and preserves navigation/focus', async () => {
    const dates = ['2026-10-29', '2026-10-30', '2026-10-31', null, '2026-02-30', '2026-10-29', '2026-10-30'];
    const cues = ['Past follow-up date', 'Follow-up today', 'Upcoming follow-up', null, null, 'Past follow-up date', 'Follow-up today'];
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: applicationStatuses.map(({ value }, i) => ({ ...summary, analysis_id: String(i), job_title: `Fictional List role ${i}`, application_status: value, follow_up_on: dates[i] })) });
    render(<AnalysisHistory />); await screen.findByText('Fictional List role 0');
    const entries = list().getAllByRole('listitem'); expect(entries).toHaveLength(7);
    entries.forEach((entry, i) => {
      const row = within(entry); const button = row.getByRole('button', { name: new RegExp(`Fictional List role ${i}`) });
      expect(button).toHaveTextContent(`Status: ${applicationStatuses[i].label}`);
      if (dates[i]) expect(row.getByText(`Follow up: ${formatCalendarDate(dates[i]!)}`)).toBeVisible();
      if (cues[i]) {
        const cue = row.getByText(cues[i]!); expect(cue).toBeVisible(); expect(cue.closest('[role="alert"], [aria-live]')).toBeNull();
        expect(row.getByText(`Follow up: ${formatCalendarDate(dates[i]!)}`).nextElementSibling).toBe(cue);
      } else expect(row.queryByText(/Past follow-up date|Follow-up today|Upcoming follow-up/)).toBeNull();
      button.focus(); expect(button).toHaveFocus();
    });
    expect(getAnalysisHistory).toHaveBeenCalledExactlyOnceWith(20, 0); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
    fireEvent.click(within(entries[0]).getByRole('button')); await screen.findByRole('heading', { name: 'Candidate Profile' });
    expect(getSavedAnalysis).toHaveBeenCalledWith('0'); expect(screen.queryByText('Past follow-up date')).toBeNull();
    expect(updateAnalysisTracking).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it.each([
    [2026, 9, 1, '2026-09-30'], [2027, 0, 1, '2026-12-31'],
    [2024, 1, 29, '2024-02-28'], [2024, 2, 1, '2024-02-29'],
    [2026, 2, 8, '2026-03-07'], [2026, 10, 1, '2026-10-31'],
  ] as const)('updates on normal rerender at local calendar boundary %s/%s/%s', async (year, month, day, saved) => {
    const prior = new Date(year, month, day, 0, 0); prior.setMinutes(-1); vi.setSystemTime(prior);
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [{ ...summary, follow_up_on: saved }, { ...summary, analysis_id: 'second', job_title: 'Second role', follow_up_on: saved }] });
    const view = render(<AnalysisHistory />); await screen.findByText('Second role');
    expect(list().getAllByText('Follow-up today')).toHaveLength(2);
    vi.setSystemTime(new Date(year, month, day, 0, 1));
    expect(list().getAllByText('Follow-up today')).toHaveLength(2);
    view.rerender(<AnalysisHistory />); expect(list().getAllByText('Past follow-up date')).toHaveLength(2);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
  });

  it('uses one local-day read per List render even when UTC has a different date', async () => {
    vi.setSystemTime(new Date('2026-12-31T12:01:00Z'));
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2027); vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
    const day = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1);
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `Fictional role ${i}`, follow_up_on: '2027-01-01' })) });
    const view = render(<AnalysisHistory />); await screen.findByText('Fictional role 0');
    expect(list().getAllByText('Follow-up today')).toHaveLength(20);
    const reads = day.mock.calls.length; view.rerender(<AnalysisHistory />);
    expect(day.mock.calls.length).toBe(reads + 2); // List and the independently rendered Overview.
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
  });

  it('preserves filters/sort/page and rejects stale data across refresh, empty/error/retry and unmount', async () => {
    let resolveOld!: (value: { items: SavedAnalysisSummary[] }) => void;
    const old = new Promise<{ items: SavedAnalysisSummary[] }>((resolve) => { resolveOld = resolve; });
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, offset) => ({ items: offset ? [{ ...summary, job_title: 'Page two', follow_up_on: '2026-10-31' }] : Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: String(i), job_title: `First page ${i}`, follow_up_on: '2026-10-29' })) }));
    const view = render(<StrictMode><AnalysisHistory /></StrictMode>); await screen.findByText('First page 0');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'Engineer' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(screen.getByText('Apply filters')); await screen.findByText('First page 0');
    fireEvent.click(screen.getByText('Next')); await screen.findByText('Page two'); expect(list().getByText('Upcoming follow-up')).toBeVisible();
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { query: 'Engineer', sort: 'follow_up_asc' });
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(old);
    fireEvent.click(screen.getByText('Refresh')); fireEvent.click(screen.getByText('Clear filters'));
    await screen.findByText('First page 0'); await act(async () => resolveOld({ items: [{ ...summary, job_title: 'STALE', follow_up_on: '2026-10-30' }] }));
    expect(screen.queryByText('STALE')).toBeNull();
    vi.mocked(getAnalysisHistory).mockRejectedValueOnce(new Error('PRIVATE')); fireEvent.click(screen.getByText('Refresh'));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE'); expect(screen.queryByText('Past follow-up date')).toBeNull();
    vi.mocked(getAnalysisHistory).mockResolvedValueOnce({ items: [] }); fireEvent.click(screen.getByText('Refresh')); await screen.findByText('No saved analyses yet.');
    expect(screen.queryByText(/Past follow-up date|Follow-up today|Upcoming follow-up/)).toBeNull();
    let resolveUnmount!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((resolve) => { resolveUnmount = resolve; }));
    fireEvent.click(screen.getByText('Refresh')); view.unmount(); await act(async () => resolveUnmount({ items: [{ ...summary, follow_up_on: '2026-10-30' }] }));
    expect(screen.queryByText('Follow-up today')).toBeNull();
  });
});

describe('History follow-up date cue integration', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shares presentation semantics across List/Board/Overview while keeping details and CSV metadata unchanged', async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 29, 12));
    const dated = { ...summary, follow_up_on: '2026-10-29' };
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [dated] : [] }));
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ total_analyses: 1,
      status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 1 : 0 })),
      scheduled_follow_up_count: 1, unscheduled_follow_up_count: 0,
      earliest_follow_ups: [{ ...dated, follow_up_on: '2026-10-29' }],
    });
    const createUrl = vi.fn(() => 'blob:cue-export'); const revokeUrl = vi.fn();
    vi.stubGlobal('URL', class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revokeUrl; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(downloadApplicationPipelineCsv).mockResolvedValue(new Blob(['unchanged server metadata']));
    render(<AnalysisHistory />); await screen.findAllByText('Platform Engineer');
    expect(screen.getAllByText('Follow-up today')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'List applied' } });
    fireEvent.click(screen.getByText('Apply filters')); await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'List applied' }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'List draft' } });
    fireEvent.click(screen.getByText('Board view')); const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    expect(await board.findByText('Follow-up today')).toBeVisible();
    const overview = screen.getByRole('region', { name: 'Application Pipeline Overview' });
    expect(within(overview).getByText('Follow-up today')).toBeVisible();
    const requests = vi.mocked(getAnalysisHistory).mock.calls.length;
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    for (const name of ['Download Board CSV', 'Download filtered CSV', 'Download all CSV']) {
      fireEvent.click(screen.getByText(name)); await waitFor(() => expect(screen.getByText(name)).toBeEnabled());
    }
    expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(1, {});
    expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(2, { query: 'List applied' });
    expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(3, {});
    expect(revokeUrl).toHaveBeenCalledTimes(3);
    expect(getAnalysisHistory).toHaveBeenCalledTimes(requests); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    fireEvent.click(screen.getByText('Open details')); await screen.findByRole('heading', { name: 'Candidate Profile' });
    expect(screen.queryByText('Follow-up today')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Back to History/ }));
    expect(await within(await screen.findByRole('region', { name: 'Application Pipeline Board' })).findByText('Follow-up today')).toBeVisible();
    fireEvent.click(screen.getByText('List view')); expect(screen.getAllByText('Follow-up today')).toHaveLength(2);
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('List draft');
    expect(updateAnalysisTracking).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled();
    expect(compareSavedAnalyses).not.toHaveBeenCalled(); expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });
});

describe('History board integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({
      items: !filters?.application_status || filters.application_status === 'not_applied' ? [summary] : [],
    }));
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
  });

  it('isolates Board search from List criteria, CSV exports, and Overview, retaining search on History refresh', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('Platform Engineer');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'list applied' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'yes' } });
    fireEvent.click(screen.getByText('Apply filters'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'list applied', ai_enriched: true }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'list draft' } });
    fireEvent.click(screen.getByText('Board view'));
    const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    await board.findByText('Platform Engineer');
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    const listCalls = vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20).length;
    fireEvent.change(board.getByRole('searchbox'), { target: { value: 'board applied' } });
    fireEvent.click(board.getByText('Apply search'));
    await board.findByText('Platform Engineer');
    for (const { value } of applicationStatuses) expect(getAnalysisHistory).toHaveBeenCalledWith(11, 0, { application_status: value, query: 'board applied' });
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20)).toHaveLength(listCalls);
    // Keep downloads pending to inspect filter arguments without browser download work.
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByText('Download filtered CSV'));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ query: 'list applied', ai_enriched: true });
    fireEvent.click(screen.getByText('Download all CSV'));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({});
    fireEvent.change(board.getByRole('searchbox'), { target: { value: 'board draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await board.findByText('Platform Engineer');
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 11).slice(-7)
      .every(([, offset, filters]) => offset === 0 && filters?.query === 'board applied')).toBe(true);
    expect(board.getByRole('searchbox')).toHaveValue('board draft');
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls + 1);
    fireEvent.click(screen.getByText('List view'));
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('list draft');
    fireEvent.click(screen.getByText('Board view'));
    await screen.findByText('No board search applied.');
    expect(screen.getByLabelText('Search board by job title or company')).toHaveValue('');
    expect(getSavedAnalysis).not.toHaveBeenCalled(); expect(compareSavedAnalyses).not.toHaveBeenCalled();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it.each(['created_desc', 'follow_up_asc'] as const)('isolates combined Board sorting from List applied %s, drafts, CSV, and Overview through refresh', async (listSort) => {
    const listOrder = listSort === 'created_desc' ? {} : { sort: listSort };
    const listDraft = listSort === 'created_desc' ? 'follow_up_asc' : 'created_desc';
    render(<AnalysisHistory />); await screen.findByText('Platform Engineer');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'List query' } });
    fireEvent.change(screen.getByLabelText('Follow-up status'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: listSort } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'List query', has_follow_up: false, min_score: 15, ai_enriched: true, ...listOrder }));
    fireEvent.change(screen.getByLabelText('Follow-up status'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: listDraft } });
    fireEvent.click(screen.getByText('Board view'));
    const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    await board.findByText('Platform Engineer');
    expect(board.getByLabelText('Minimum match score (%) (Board)')).toHaveValue(null);
    expect(board.getByLabelText('Board AI enrichment')).toHaveValue('all');
    expect(board.getByLabelText('Board sort order')).toHaveValue('created_desc');
    const listCalls = vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20).length;
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    fireEvent.change(board.getByRole('searchbox'), { target: { value: 'Board query' } });
    fireEvent.click(board.getByText('Apply search'));
    fireEvent.change(board.getByLabelText('Board follow-up status'), { target: { value: 'yes' } });
    fireEvent.change(board.getByLabelText('Board follow-up from'), { target: { value: '2024-02-29' } });
    fireEvent.click(board.getByRole('button', { name: 'Apply filters' }));
    fireEvent.change(board.getByLabelText('Minimum match score (%) (Board)'), { target: { value: '72.25' } });
    fireEvent.change(board.getByLabelText('Maximum match score (%) (Board)'), { target: { value: '87.75' } });
    fireEvent.click(board.getByText('Apply score filters'));
    fireEvent.change(board.getByLabelText('Board AI enrichment'), { target: { value: 'no' } });
    fireEvent.click(board.getByText('Apply AI filter'));
    fireEvent.change(board.getByLabelText('Board sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(board.getByText('Apply sort'));
    await board.findByText('Platform Engineer');
    for (const { value } of applicationStatuses) expect(getAnalysisHistory).toHaveBeenCalledWith(11, 0, { application_status: value, query: 'Board query', has_follow_up: true, follow_up_from: '2024-02-29', min_score: 72.25, max_score: 87.75, ai_enriched: false, sort: 'follow_up_asc' });
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20)).toHaveLength(listCalls);
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByText('Download filtered CSV'));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ query: 'List query', has_follow_up: false, min_score: 15, ai_enriched: true, ...listOrder });
    fireEvent.click(screen.getByText('Download all CSV'));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({});
    fireEvent.change(board.getByLabelText('Minimum match score (%) (Board)'), { target: { value: '80' } });
    fireEvent.change(board.getByLabelText('Board AI enrichment'), { target: { value: 'yes' } });
    fireEvent.change(board.getByLabelText('Board sort order'), { target: { value: 'created_desc' } });
    fireEvent.change(board.getByLabelText('Board follow-up to'), { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await board.findByText('Platform Engineer');
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 11).slice(-7)
      .every(([, offset, filters]) => offset === 0 && filters?.sort === 'follow_up_asc' && filters.ai_enriched === false && filters.min_score === 72.25 && filters.max_score === 87.75 && filters.query === 'Board query' && filters.has_follow_up === true && filters.follow_up_from === '2024-02-29' && filters.follow_up_to === undefined)).toBe(true);
    expect(board.getByLabelText('Minimum match score (%) (Board)')).toHaveValue(80);
    expect(board.getByLabelText('Board AI enrichment')).toHaveValue('yes');
    expect(board.getByLabelText('Board sort order')).toHaveValue('created_desc');
    expect(board.getByText('Applied board sort: Earliest follow-up first.')).toBeInTheDocument();
    expect(board.getByLabelText('Board follow-up to')).toHaveValue('2026-10-31');
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls + 1);
    const resetStart = vi.mocked(getAnalysisHistory).mock.calls.length;
    fireEvent.click(board.getByRole('button', { name: 'Reset all Board criteria' }));
    await board.findByText('Platform Engineer');
    expect(vi.mocked(getAnalysisHistory).mock.calls.slice(resetStart)).toEqual(applicationStatuses.map(({ value }) => [11, 0, { application_status: value }]));
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls + 1);
    expect(screen.getByText('Board view')).toHaveAttribute('aria-pressed', 'true');
    expect(board.getByLabelText('Board sort order')).toHaveValue('created_desc');
    expect(screen.getByText('Preparing all records CSV...')).toBeInTheDocument();
    expect(screen.getByText('Preparing filtered records CSV...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await board.findByText('Platform Engineer');
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 11).slice(-7))
      .toEqual(applicationStatuses.map(({ value }) => [11, 0, { application_status: value }]));
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20).at(-1))
      .toEqual([20, 0, { query: 'List query', has_follow_up: false, min_score: 15, ai_enriched: true, ...listOrder }]);
    fireEvent.click(screen.getByText('List view'));
    expect(screen.getByLabelText('Follow-up status')).toHaveValue('all');
    expect(screen.getByLabelText('Minimum score')).toHaveValue(25);
    expect(screen.getByLabelText('AI enrichment')).toHaveValue('all');
    expect(screen.getByLabelText('Sort order')).toHaveValue(listDraft);
    fireEvent.click(screen.getByText('Board view')); await screen.findByText('Applied board follow-up filters: All.');
    expect(screen.getByLabelText('Board follow-up from')).toHaveValue('');
    expect(screen.getByLabelText('Minimum match score (%) (Board)')).toHaveValue(null);
    expect(screen.getByLabelText('Board AI enrichment')).toHaveValue('all');
    expect(screen.getByLabelText('Board sort order')).toHaveValue('created_desc');
    expect(getSavedAnalysis).not.toHaveBeenCalled(); expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it('defaults to List and preserves applied filters, drafts, page, and comparison selection across view changes', async () => {
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, _offset, filters) => ({
      items: limit === 20 ? Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: `list-${index}`, job_title: `List role ${index}` })) :
        filters?.application_status === 'not_applied' ? [summary] : [],
    }));
    render(<AnalysisHistory />);
    await screen.findByText('List role 0');
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('heading', { name: 'Application Pipeline Board' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /List role 0/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select for comparison' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'applied search' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'applied search' }));
    await screen.findByText('List role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { query: 'applied search' }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unapplied draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    await board.findByText('Platform Engineer');
    const boardCalls = vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 11);
    expect(boardCalls).toHaveLength(7);
    expect(boardCalls.every(([, offset, filters]) => offset === 0 && Object.keys(filters ?? {}).join() === 'application_status')).toBe(true);
    fireEvent.change(board.getByLabelText('Board AI enrichment'), { target: { value: 'no' } });
    fireEvent.click(board.getByText('Apply AI filter')); await board.findByText('Platform Engineer');
    fireEvent.change(board.getByLabelText('Board sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(board.getByText('Apply sort')); await board.findByText('Platform Engineer');
    fireEvent.click(board.getByRole('button', { name: 'Reset all Board criteria' })); await board.findByText('Platform Engineer');
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('unapplied draft');
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText('Selected for comparison: Platform Engineer')).toBeInTheDocument();
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20)).toHaveLength(3);
  });

  it('refreshes Board and Overview independently of a pending List request and keeps exports available', async () => {
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit) => limit === 20 ? new Promise(() => {}) : { items: [] });
    render(<AnalysisHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    await screen.findByText('No saved analyses in Applied.');
    const calls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh board' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download all CSV' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 11)).toHaveLength(14));
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(calls + 1);
  });

  it('preserves loaded Overview data and in-flight CSV state across view switches', async () => {
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({
      total_analyses: 1, status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 1 : 0 })),
      scheduled_follow_up_count: 0, unscheduled_follow_up_count: 1, earliest_follow_ups: [],
    });
    let resolve!: (blob: Blob) => void;
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { unmount } = render(<AnalysisHistory />);
    await screen.findByRole('heading', { name: 'Application totals' });
    fireEvent.click(screen.getByRole('button', { name: 'Download all CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    await screen.findByRole('button', { name: 'Open details' });
    expect(screen.getByText('Preparing all records CSV...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download all CSV' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Application totals' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'Download all CSV' })).toBeDisabled();
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
    expect(downloadApplicationPipelineCsv).toHaveBeenCalledExactlyOnceWith({});
    unmount();
    await act(async () => resolve(new Blob(['CSV'])));
  });

  it('shows safe detail navigation errors without discarding Board view', async () => {
    vi.mocked(getSavedAnalysis).mockRejectedValueOnce(new ApiError('private', 404, 'analysis_not_found'));
    render(<AnalysisHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open details' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This saved analysis could not be found.');
    expect(screen.getByRole('heading', { name: 'Application Pipeline Board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open details' })).toBeEnabled();
  });

  it('refreshes History and Overview after a confirmed drag without resetting filters, drafts, or pagination', async () => {
    let persisted = summary.application_status;
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, _offset, filters) => ({ items: limit === 20 ?
      Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: `list-${index}`, job_title: `List role ${index}` })) :
      filters?.application_status === persisted ? [{ ...summary, application_status: persisted }] : [],
    }));
    vi.mocked(updateAnalysisTracking).mockImplementation(async (id, status) => {
      persisted = status;
      return { analysis_id: id, application_status: status, updated_at: null };
    });
    render(<AnalysisHistory />);
    await screen.findByText('List role 0');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'applied criteria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'applied criteria' }));
    await screen.findByText('List role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { query: 'applied criteria' }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unapplied draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    const handle = await screen.findByRole('button', { name: 'Drag to change status for Platform Engineer' });
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    const payload: Record<string, string> = {};
    const dataTransfer = {
      get types() { return Object.keys(payload); },
      clearData: vi.fn(), setData: (type: string, value: string) => { payload[type] = value; },
      getData: (type: string) => payload[type] ?? '', effectAllowed: '',
    };
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: 'Interviewing' }), { dataTransfer });
    expect(updateAnalysisTracking).not.toHaveBeenCalled();
    expect(getAnalysisTracking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Interviewing.');
    expect(updateAnalysisTracking).toHaveBeenCalledWith(summary.analysis_id, 'interviewing');
    await waitFor(() => expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls + 1));
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { query: 'applied criteria' });
    const destination = within(screen.getByRole('region', { name: 'Interviewing' }));
    expect(await destination.findByText('Platform Engineer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('unapplied draft');
  });

  it('refreshes List and Overview after a confirmed board status update without resetting drafts or page', async () => {
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, _offset, filters) => ({ items: limit === 20 ?
      Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: `list-${index}`, job_title: `List role ${index}` })) :
      filters?.application_status === 'not_applied' ? [summary] : [],
    }));
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'applied', updated_at: null });
    render(<AnalysisHistory />);
    await screen.findByText('List role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2');
    await screen.findByText('List role 0');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'preserve draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    await screen.findByRole('combobox', { name: 'New status for Platform Engineer' });
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    fireEvent.change(screen.getByRole('combobox', { name: 'New status for Platform Engineer' }), { target: { value: 'applied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Applied.');
    await waitFor(() => expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls + 1));
    expect(getAnalysisHistory).toHaveBeenCalledWith(20, 20);
    expect(vi.mocked(getAnalysisHistory).mock.calls.filter(([limit]) => limit === 20)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('preserve draft');
  });

  it.each(['status', 'follow-up', 'deletion'] as const)('opens existing Detail from Board and reloads persisted %s on return', async (action) => {
    render(<AnalysisHistory />);
    await screen.findByText('Platform Engineer');
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open details' }));
    expect(await screen.findByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(getSavedAnalysis).toHaveBeenCalledWith(summary.analysis_id);
    if (action === 'status') {
      vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'offer', updated_at: null });
      fireEvent.change(await screen.findByLabelText('Choose application status'), { target: { value: 'offer' } });
      vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: filters?.application_status === 'offer' ? [{ ...summary, application_status: 'offer' }] : [] }));
      fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
      await screen.findByText('Application status updated.');
    } else if (action === 'follow-up') {
      vi.mocked(updateAnalysisFollowUp).mockResolvedValue({ analysis_id: summary.analysis_id, follow_up_on: '2026-10-20', updated_at: null });
      fireEvent.change(await screen.findByLabelText('Follow-up date'), { target: { value: '2026-10-20' } });
      vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: filters?.application_status === 'not_applied' ? [{ ...summary, follow_up_on: '2026-10-20' }] : [] }));
      fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
      await screen.findByText('Follow-up date saved.');
    } else {
      vi.mocked(deleteSavedAnalysis).mockResolvedValue(undefined);
      vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
      fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    }
    if (action !== 'deletion') fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'true');
    if (action === 'status') expect(await within(board.getByRole('region', { name: 'Offer' })).findByText('Platform Engineer')).toBeInTheDocument();
    if (action === 'follow-up') expect(await board.findByText(`Follow up: ${formatCalendarDate('2026-10-20')}`)).toBeInTheDocument();
    if (action === 'deletion') expect(await board.findAllByText(/No saved analyses in/)).toHaveLength(7);
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });
});

describe('Board quick follow-up integration', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('keeps List and Overview saved cues intact on unsent drafts and failed Board persistence', async () => {
    vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 30, 12));
    const dated = { ...summary, follow_up_on: '2026-10-29' };
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, _offset, filters) => ({ items: !filters?.application_status || filters.application_status === 'not_applied' ? [dated] : [] }));
    vi.mocked(getAnalysisFollowUp).mockResolvedValue({ analysis_id: summary.analysis_id, follow_up_on: dated.follow_up_on, updated_at: null });
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ total_analyses: 1,
      status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 1 : 0 })),
      scheduled_follow_up_count: 1, unscheduled_follow_up_count: 0, earliest_follow_ups: [dated],
    });
    vi.mocked(updateAnalysisFollowUp).mockRejectedValueOnce(new Error('PRIVATE'));
    render(<AnalysisHistory />); await screen.findAllByText('Past follow-up date');
    fireEvent.click(screen.getByText('Board view')); fireEvent.click(await screen.findByText('Edit follow-up'));
    fireEvent.change(await screen.findByLabelText('Follow-up date'), { target: { value: '2026-10-31' } });
    const historyCalls = vi.mocked(getAnalysisHistory).mock.calls.length;
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    const overview = within(screen.getByRole('region', { name: 'Application Pipeline Overview' }));
    expect(overview.getByText('Past follow-up date')).toBeVisible(); expect(screen.queryByText('Upcoming follow-up')).toBeNull();
    fireEvent.click(screen.getByText('Save follow-up')); expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(overview.getByText('Past follow-up date')).toBeVisible();
    expect(getAnalysisHistory).toHaveBeenCalledTimes(historyCalls); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    fireEvent.click(screen.getByText('List view'));
    expect(screen.getAllByText('Past follow-up date')).toHaveLength(2); expect(screen.queryByText('Upcoming follow-up')).toBeNull();
  });
  it.each(['set', 'reschedule', 'clear'] as const)('refreshes all surfaces after %s while preserving List state and guarding navigation', async (action) => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2024, 1, 29, 12));
    let date: string | null = action === 'set' ? null : '2026-10-20';
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, _offset, filters) => ({ items: limit === 20 ?
      Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: `list-${index}`, job_title: `List role ${index}`, follow_up_on: date })) :
      filters?.application_status === 'not_applied' ? [{ ...summary, follow_up_on: date }] : [],
    }));
    vi.mocked(getAnalysisFollowUp).mockImplementation(async () => ({ analysis_id: summary.analysis_id, follow_up_on: date, updated_at: null }));
    const overview = (): PipelineOverview => ({
      total_analyses: 1, status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 1 : 0 })),
      scheduled_follow_up_count: date ? 1 : 0, unscheduled_follow_up_count: date ? 0 : 1,
      earliest_follow_ups: date ? [{ analysis_id: summary.analysis_id, job_title: summary.job_title, company_name: null, application_status: 'not_applied', follow_up_on: date }] : [],
    });
    vi.mocked(getApplicationPipelineOverview).mockImplementation(async () => overview());
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    vi.mocked(updateAnalysisFollowUp).mockImplementation(async (id, value) => {
      await pending; date = value; return { analysis_id: id, follow_up_on: value, updated_at: null };
    });
    vi.mocked(clearAnalysisFollowUp).mockImplementation(async () => { await pending; date = null; });
    render(<AnalysisHistory />);
    await screen.findByText('List role 0');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'applied criteria' } });
    fireEvent.click(screen.getByText('Apply filters'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'applied criteria' }));
    await screen.findByText('List role 0');
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { query: 'applied criteria' }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unapplied draft' } });
    fireEvent.click(screen.getByText('Board view'));
    fireEvent.click(await screen.findByText('Edit follow-up'));
    const input = await screen.findByLabelText('Follow-up date');
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    if (action === 'clear') {
      fireEvent.click(screen.getByText('Clear follow-up'));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear follow-up'));
    } else {
      fireEvent.change(input, { target: { value: '2024-02-29' } });
      fireEvent.click(screen.getByText('Save follow-up'));
    }
    expect(screen.getByText('List view')).toBeDisabled();
    expect(screen.getByText('Open details')).toBeDisabled();
    fireEvent.click(screen.getByText('List view'));
    expect(screen.getByText('Board view')).toHaveAttribute('aria-pressed', 'true');
    const overviewRegion = within(screen.getByRole('region', { name: 'Application Pipeline Overview' }));
    expect(overviewRegion.queryByText('Follow-up today')).toBeNull();
    if (action !== 'set') {
      const detailButton = overviewRegion.getByRole('button');
      expect(detailButton).toBeDisabled();
      fireEvent.click(detailButton);
    }
    const detailCalls = vi.mocked(getSavedAnalysis).mock.calls.length;
    fireEvent.click(screen.getByText('Open details'));
    expect(getSavedAnalysis).toHaveBeenCalledTimes(detailCalls);
    await act(async () => complete());
    await screen.findByText(action === 'clear' ? 'Follow-up date cleared.' : 'Follow-up date saved.');
    const board = within(screen.getByRole('region', { name: 'Application Pipeline Board' }));
    await board.findByText(action === 'clear' ? 'No follow-up scheduled' : `Follow up: ${formatCalendarDate('2024-02-29')}`);
    await waitFor(() => expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls + 1));
    expect(getAnalysisHistory).toHaveBeenCalledWith(20, 20, { query: 'applied criteria' });
    expect(input).toHaveValue(action === 'clear' ? '' : '2024-02-29');
    if (action === 'clear') expect(overviewRegion.getByText('No scheduled follow-ups.')).toBeInTheDocument();
    else {
      expect(overviewRegion.getByText(`Follow up: ${formatCalendarDate('2024-02-29')}`)).toBeInTheDocument();
      expect(overviewRegion.getByText('Follow-up today')).toBeVisible();
    }
    fireEvent.click(screen.getByText('List view'));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('unapplied draft');
    expect(screen.getByText('Download filtered CSV')).toBeEnabled();
    const list = within(screen.getByRole('button', { name: /List role 0/ }));
    if (action === 'clear') {
      expect(list.queryByText(/Follow up:/)).not.toBeInTheDocument();
      expect(list.queryByText(/Past follow-up date|Follow-up today|Upcoming follow-up/)).toBeNull();
    } else {
      expect(list.getByText(`Follow up: ${formatCalendarDate('2024-02-29')}`)).toBeInTheDocument();
      expect(list.getByText('Follow-up today')).toBeVisible();
    }
  });

  it('distinguishes a persisted save from failed History synchronization and lets Refresh recover', async () => {
    let fail = false;
    let date: string | null = null;
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, _offset, filters) => {
      if (limit === 20 && fail) throw new Error('PRIVATE');
      return { items: limit === 20 || filters?.application_status === 'not_applied' ? [{ ...summary, follow_up_on: date }] : [] };
    });
    vi.mocked(updateAnalysisFollowUp).mockImplementation(async (id, value) => {
      date = value; fail = true; return { analysis_id: id, follow_up_on: value, updated_at: null };
    });
    render(<AnalysisHistory />);
    fireEvent.click(screen.getByText('Board view'));
    fireEvent.click(await screen.findByText('Edit follow-up'));
    fireEvent.change(await screen.findByLabelText('Follow-up date'), { target: { value: '2024-02-29' } });
    fireEvent.click(screen.getByText('Save follow-up'));
    await screen.findByText('Follow-up date was saved, but History could not refresh. Please try refreshing History.');
    expect(screen.getByText('Follow-up date saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up date')).toHaveValue(date);
    expect(screen.getByText(`Follow up: ${formatCalendarDate('2024-02-29')}`)).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await within(screen.getByRole('region', { name: 'Application Pipeline Board' })).findByText(`Follow up: ${formatCalendarDate('2024-02-29')}`);
    fireEvent.click(screen.getByText('List view'));
    expect(screen.getByText(`Follow up: ${formatCalendarDate('2024-02-29')}`)).toBeInTheDocument();
    expect(updateAnalysisFollowUp).toHaveBeenCalledOnce();
  });
});

describe('AnalysisHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
    vi.mocked(getAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'not_applied', updated_at: null });
  });

  it('shows loading then an empty state and first-page controls', async () => {
    let resolveHistory!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValue(new Promise((resolve) => { resolveHistory = resolve; }));
    render(<AnalysisHistory />);
    expect(screen.getByText(/Loading saved analyses/)).toHaveAttribute('role', 'status');
    resolveHistory({ items: [] });
    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('renders lightweight summaries without candidate content', async () => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    render(<AnalysisHistory />);
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument();
    expect(screen.getByText('Company not supplied')).toBeInTheDocument();
    expect(screen.getByText('Not scored')).toBeInTheDocument();
    expect(screen.getByText('Includes AI enrichment')).toBeInTheDocument();
    expect(screen.queryByText('python')).not.toBeInTheDocument();
  });

  it('paginates forward and back and refreshes the current page', async () => {
    const fullPage = Array.from({ length: 20 }, (_, index) => ({
      ...summary,
      analysis_id: `${summary.analysis_id}-${index}`,
      job_title: `Role ${index}`,
    }));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: fullPage });
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(20, 20));
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(20, 0));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(4));
  });

  it('shows dedicated persistence and safe generic failures', async () => {
    vi.mocked(getAnalysisHistory).mockRejectedValueOnce(
      new ApiError('hidden', 503, 'persistence_unavailable'),
    );
    const { unmount } = render(<AnalysisHistory />);
    expect(await screen.findByText(/persistence is not configured/)).toBeInTheDocument();
    unmount();

    vi.mocked(getAnalysisHistory).mockRejectedValueOnce(new ApiError('server detail', 500));
    render(<AnalysisHistory />);
    expect(await screen.findByText(/could not load analysis history/)).toBeInTheDocument();
    expect(screen.queryByText('server detail')).not.toBeInTheDocument();
  });

  it('loads authoritative detail, renders stored sections, and returns to history', async () => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [{ ...summary, score: 75 }] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));

    expect(await screen.findByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByText('Fictional Labs', { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText('Example Systems')).toHaveLength(2);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Discuss Python')).toBeInTheDocument();
    expect(screen.getByText('Build Docker capability')).toBeInTheDocument();
    expect(screen.getByText('Historical insight', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Provider: OpenAI')).toBeInTheDocument();
    expect(screen.getByText(/AI-generated enrichment may be inaccurate/)).toBeInTheDocument();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(getSavedAnalysis).toHaveBeenCalledWith(summary.analysis_id);

    fireEvent.click(screen.getByRole('button', { name: '← Back to History' }));
    expect(screen.getByRole('heading', { name: 'Analysis History' })).toBeInTheDocument();
  });

  it('confirms, cancels, and deletes exactly once before refreshing history', async () => {
    vi.mocked(getAnalysisHistory)
      .mockResolvedValueOnce({ items: [summary] })
      .mockResolvedValue({ items: [] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    let resolveDelete!: () => void;
    vi.mocked(deleteSavedAnalysis).mockReturnValue(
      new Promise<void>((resolve) => { resolveDelete = resolve; }),
    );
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete this saved analysis?');
    expect(dialog).toHaveTextContent('cannot be undone in Pathfinder');
    expect(dialog).toHaveTextContent('not a guaranteed secure erase');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    const permanent = screen.getByRole('button', { name: 'Delete permanently' });
    fireEvent.click(permanent);
    expect(await screen.findByRole('status')).toHaveTextContent('Deleting saved analysis');
    expect(permanent).toBeDisabled();
    fireEvent.click(permanent);
    expect(deleteSavedAnalysis).toHaveBeenCalledTimes(1);
    expect(deleteSavedAnalysis).toHaveBeenCalledWith(summary.analysis_id);
    resolveDelete();

    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0);
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError('private', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('private', 503, 'persistence_unavailable'), 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('private network'), 'Pathfinder could not delete this saved analysis. Please try again.'],
  ])('preserves detail and shows a safe deletion failure', async (failure, message) => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(deleteSavedAnalysis).mockRejectedValueOnce(failure);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to History' })).toBeInTheDocument();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('returns to the previous page after deleting its only item', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...summary,
      analysis_id: `${summary.analysis_id}-${index}`,
      job_title: `Role ${index}`,
    }));
    vi.mocked(getAnalysisHistory)
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: [summary] })
      .mockResolvedValue({ items: firstPage });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(await screen.findByText('Page 1')).toBeInTheDocument();
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
  });

  it('handles legacy recommendations and detail not found', async () => {
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValueOnce({ ...detail, learning_recommendations: null });
    const { unmount } = render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText(/not stored for this legacy analysis/)).toBeInTheDocument();
    unmount();

    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockRejectedValueOnce(
      new ApiError('not found', 404, 'analysis_not_found'),
    );
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText('This saved analysis could not be found.')).toBeInTheDocument();
  });
});

describe('history helpers', () => {
  it('formats valid timestamps without depending on an exact timezone and handles invalid input', () => {
    expect(formatSavedTimestamp(summary.created_at)).not.toBe('Unknown date');
    expect(formatSavedTimestamp('not-a-date')).toBe('Unknown date');
  });

  it('maps stored detail without recomputation', () => {
    const mapped = savedAnalysisDetailToAnalysisResponse(detail);
    expect(mapped.score).toBe(detail.score);
    expect(mapped.explanation).toBe(detail.explanation);
    expect(mapped.interview_preparation).toBe(detail.interview_preparation);
    expect(mapped.learning_recommendations).toBe(detail.learning_recommendations);
  });
});

describe('saved analysis downloads', () => {
  const createObjectURL = vi.fn(() => 'blob:stored-snapshot');
  const revokeObjectURL = vi.fn();
  let downloaded: Array<{ filename: string; href: string; connected: boolean }>;

  beforeEach(() => {
    vi.clearAllMocks();
    downloaded = [];
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(downloadSavedAnalysis).mockResolvedValue(new Blob(['Stored snapshot']));
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push({ filename: this.download, href: this.href, connected: this.isConnected });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function openDetail() {
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
  }

  it.each([
    ['json', 'JSON', 'json'], ['markdown', 'Markdown', 'md'],
  ] as const)('downloads %s explicitly with a UUID filename and revokes the object URL', async (format, label, extension) => {
    await openDetail();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeInTheDocument();
    expect(downloadSavedAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `Download ${label}` }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:stored-snapshot'));
    expect(downloadSavedAnalysis).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, format);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(downloaded).toEqual([{ filename: `pathfinder-analysis-${summary.analysis_id}.${extension}`, href: 'blob:stored-snapshot', connected: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByText('<script>alert("no")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete saved analysis' })).toBeEnabled();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    expect(screen.getByRole('heading', { name: 'Analysis History' })).toBeInTheDocument();
  });

  it('shows accessible progress and prevents duplicate same-format requests', async () => {
    let resolveDownload!: (value: Blob) => void;
    vi.mocked(downloadSavedAnalysis).mockReturnValueOnce(new Promise((resolve) => { resolveDownload = resolve; }));
    await openDetail();
    const button = screen.getByRole('button', { name: 'Download JSON' });
    fireEvent.click(button);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing JSON export');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(downloadSavedAnalysis).toHaveBeenCalledTimes(1);
    resolveDownload(new Blob(['Stored JSON']));
    await waitFor(() => expect(button).toBeEnabled());
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ApiError('private', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('private', 503, 'persistence_unavailable'), 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('private'), 'Pathfinder could not export this saved analysis. Please try again.'],
  ])('keeps detail and avoids partial downloads on safe export failures', async (failure, message) => {
    vi.mocked(downloadSavedAnalysis).mockRejectedValueOnce(failure);
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message as string);
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeEnabled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);
  });

  it('revokes the object URL and removes the anchor even if triggering download fails', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('download blocked'); });
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pathfinder could not export');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stored-snapshot');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
  });
});

describe('history filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
  });

  it('applies normalized combined filters explicitly and clears them', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: "  100% Data_Engineer \\ O'Connor 株式会社  " } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '80' } });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, {
      query: "100% Data_Engineer \\ O'Connor 株式会社", ai_enriched: false, min_score: 0, max_score: 80,
    }));
    expect(await screen.findByText('No saved analyses match these filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('');
    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
  });

  it('resets pagination on apply and preserves filters through detail and deletion', async () => {
    const fullPage = Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: String(index), job_title: `Role ${index}` }));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: fullPage });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'Role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'Role' }));
    fireEvent.click(await screen.findByRole('button', { name: /Role 0/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('Role 0');
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'Role' });
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
  });

  it('rejects invalid score ranges and long searches without a request', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('minimum no greater than maximum');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 200 characters');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(2);
  });

  it('ignores an older response after filters change', async () => {
    let resolveOld!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<AnalysisHistory />);
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('No saved analyses match these filters.');
    resolveOld({ items: [summary] });
    await waitFor(() => expect(screen.queryByText('Platform Engineer')).not.toBeInTheDocument());
  });
});

const secondSummary = { ...summary, analysis_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', job_title: 'Second role' };
const comparison: SavedAnalysisComparison = {
  left: { ...summary, score: 82, keyword_coverage_percentage: 50, ai_enriched: false },
  right: { ...secondSummary, score: 74, keyword_coverage_percentage: 100, company_name: 'Northwind' },
  score_delta: -8, keyword_coverage_delta: 50,
  score_components: [{ kind: 'required_skills', left_earned_points: 50, left_possible_points: 60, right_earned_points: 42, right_possible_points: 60, earned_points_delta: -8 }, { kind: 'experience', left_earned_points: null, left_possible_points: null, right_earned_points: 10, right_possible_points: 20, earned_points_delta: null }],
  matched_skills: { in_both: ['python'], left_only: ['fastapi', 'azure'], right_only: ['docker'] },
  missing_required_skills: { in_both: [], left_only: ['kubernetes'], right_only: ['mlflow'] },
  missing_preferred_skills: { in_both: [], left_only: ['docker'], right_only: ['azure'] },
  experience_gaps: { left: { required_months: 36, known_candidate_months: 24, missing_months: 12 }, right: null },
  education_gaps: { left: { level: 'master', field_of_study: 'Computing', description: 'Stored degree' }, right: null },
};

describe('saved comparison workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary, secondSummary] });
    vi.mocked(getSavedAnalysis).mockImplementation(async (id) => ({ ...detail, analysis_id: id, job_description: { ...detail.job_description, title: { title: id === summary.analysis_id ? summary.job_title : secondSummary.job_title } } }));
    vi.mocked(compareSavedAnalyses).mockResolvedValue(comparison);
  });
  async function selectFirst() {
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select for comparison' }));
    expect(compareSavedAnalyses).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Compare with selected' })).not.toBeInTheDocument();
    expect(screen.getByText('Selected for comparison')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
  }
  async function openSecond() {
    fireEvent.click(screen.getByRole('button', { name: /Second role/ }));
    await screen.findByRole('button', { name: 'Compare with selected' });
  }
  it('compares once and renders neutral stored values, gaps and AI presence without AI text', async () => {
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    expect(await screen.findByRole('heading', { name: 'Saved Analysis Comparison' })).toBeInTheDocument();
    expect(compareSavedAnalyses).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, secondSummary.analysis_id);
    expect(screen.getByText(/They do not by themselves indicate improvement or regression/)).toBeInTheDocument();
    for (const text of ['Northwind', '-8', 'Not present', 'python', 'fastapi', 'mlflow', 'kubernetes', 'Stored degree', 'No stored experience gap', 'No stored education gap', 'Stored AI enrichment: Yes', 'Stored AI enrichment: No']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Historical insight')).not.toBeInTheDocument();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open left snapshot' }));
    await screen.findByRole('button', { name: 'Download JSON' });
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: '← Back to Comparison' }));
    expect(screen.getByRole('heading', { name: 'Saved Analysis Comparison' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open right snapshot' }));
    await screen.findByRole('heading', { name: 'Second role' });
    fireEvent.click(screen.getByRole('button', { name: '← Back to Comparison' }));
    expect(screen.getByRole('heading', { name: 'Saved Analysis Comparison' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear comparison' }));
    expect(screen.queryByText(/Selected for comparison:/)).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
  });
  it('preserves selection and draft/applied filters across pagination and comparison Back', async () => {
    const page = Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: i ? `id-${i}` : summary.analysis_id, job_title: i ? `Role ${i}` : summary.job_title }));
    vi.mocked(getAnalysisHistory).mockImplementation(async (_limit, offset) => ({ items: offset ? [secondSummary] : page }));
    render(<AnalysisHistory />); await selectFirst();
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'role' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledWith(20, 0, { query: 'role', ai_enriched: true, min_score: 0 }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('button', { name: /Second role/ }); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to History' }));
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('draft');
    expect(screen.getByLabelText('AI enrichment')).toHaveValue('yes');
    expect(screen.getByLabelText('Minimum score')).toHaveValue(0);
    expect(screen.getByText(/Selected for comparison:/)).toBeInTheDocument();
  });
  it.each([
    [new ApiError('PRIVATE', 404, 'analysis_not_found'), 'One or both saved analyses no longer exist.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Saved analysis comparison is unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('PRIVATE'), 'Pathfinder could not compare these saved analyses. Please try again.'],
  ])('keeps detail usable after safe comparison failure', async (error, message) => {
    vi.mocked(compareSavedAnalyses).mockRejectedValue(error);
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    if (error instanceof ApiError && error.status === 404) expect(screen.getByRole('button', { name: 'Select for comparison' })).toBeInTheDocument();
  });
  it('guards duplicate requests and reports loading', async () => {
    let resolve!: (value: SavedAnalysisComparison) => void;
    vi.mocked(compareSavedAnalyses).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    const button = screen.getByRole('button', { name: 'Compare with selected' });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByText(/Loading saved analysis comparison/)).toBeInTheDocument();
    expect(compareSavedAnalyses).toHaveBeenCalledTimes(1);
    resolve(comparison); await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
  });
  it('clears selection when the selected snapshot is deleted and when History unmounts', async () => {
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    const view = render(<AnalysisHistory />); await selectFirst();
    fireEvent.click(screen.getByRole('button', { name: /Platform Engineer/ }));
    await screen.findByText('Selected for comparison');
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByRole('heading', { name: 'Analysis History' });
    expect(screen.queryByText(/Selected for comparison:/)).not.toBeInTheDocument();
    await selectFirst(); view.unmount(); render(<AnalysisHistory />);
    await screen.findByRole('heading', { name: 'Analysis History' });
    expect(screen.queryByText(/Selected for comparison:/)).not.toBeInTheDocument();
  });
  it('renders unavailable deltas and hostile stored text as inert React text', async () => {
    const hostile = '<script>alert(1)</script> **Café** "quote"; DROP TABLE saved_analyses;--';
    vi.mocked(compareSavedAnalyses).mockResolvedValue({ ...comparison, left: { ...comparison.left, job_title: hostile, score: null, keyword_coverage_percentage: null }, score_delta: null, keyword_coverage_delta: null, matched_skills: { in_both: [hostile], left_only: [], right_only: [] } });
    render(<AnalysisHistory />); await selectFirst(); await openSecond();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
    expect(screen.getAllByText('Not comparable').length).toBeGreaterThan(1);
    expect(screen.getAllByText(hostile)).toHaveLength(2);
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('comparison request navigation guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary, secondSummary] });
    vi.mocked(getSavedAnalysis).mockImplementation(async (id) => ({ ...detail, analysis_id: id }));
    vi.mocked(compareSavedAnalyses).mockResolvedValue(comparison);
  });
  async function openComparisonPair() {
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select for comparison' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    fireEvent.click(screen.getByRole('button', { name: /Second role/ }));
    await screen.findByRole('button', { name: 'Compare with selected' });
  }
  it('prevents an existing delete confirmation from submitting during comparison', async () => {
    let resolve!: (value: SavedAnalysisComparison) => void;
    vi.mocked(compareSavedAnalyses).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AnalysisHistory />); await openComparisonPair();
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    const deletion = screen.getByRole('button', { name: 'Delete permanently' });
    expect(deletion).toBeDisabled(); fireEvent.click(deletion);
    expect(deleteSavedAnalysis).not.toHaveBeenCalled();
    resolve(comparison); await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
  });
  it('prevents clearing or leaving comparison during side retrieval', async () => {
    render(<AnalysisHistory />); await openComparisonPair();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with selected' }));
    await screen.findByRole('heading', { name: 'Saved Analysis Comparison' });
    let resolve!: (value: SavedAnalysisDetail) => void;
    vi.mocked(getSavedAnalysis).mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Open left snapshot' }));
    expect(screen.getByRole('button', { name: 'Clear comparison' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to History' })).toBeDisabled();
    resolve(detail); await screen.findByRole('button', { name: 'Download JSON' });
  });
});

describe('application status workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
  });

  it('applies the draft filter only after submission', async () => {
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { application_status: 'applied' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
  });

  it('loads and explicitly updates status while keeping detail open', async () => {
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'applied', updated_at: '2026-09-03T11:00:00Z' });
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText('Current status: Not applied')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose application status'), { target: { value: 'applied' } });
    expect(updateAnalysisTracking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await screen.findByText('Current status: Applied');
    expect(updateAnalysisTracking).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, 'applied');
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
  });

  it('shows recorded activity, loads older events, and refreshes after a real change', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      previous_status: 'not_applied' as const,
      application_status: 'applied' as const,
      changed_at: `2026-09-03T${String(index).padStart(2, '0')}:00:00Z`,
    }));
    vi.mocked(getAnalysisTrackingHistory)
      .mockResolvedValueOnce({ items: firstPage })
      .mockResolvedValueOnce({ items: [{ previous_status: 'applied', application_status: 'interviewing', changed_at: '2026-09-02T10:00:00Z' }] })
      .mockResolvedValueOnce({ items: [{ previous_status: 'applied', application_status: 'offer', changed_at: '2026-09-04T10:00:00Z' }] });
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'offer', updated_at: '2026-09-04T10:00:00Z' });
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await waitFor(() => expect(screen.getAllByText('Not applied → Applied')).toHaveLength(20));
    expect(screen.getByText('This timeline records status changes made in Pathfinder after activity tracking became available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }));
    await waitFor(() => expect(getAnalysisTrackingHistory).toHaveBeenLastCalledWith(summary.analysis_id, 20, 20));
    expect(await screen.findByText('Applied → Interviewing')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose application status'), { target: { value: 'offer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    expect(await screen.findByText('Applied → Offer')).toBeInTheDocument();
    expect(screen.queryByText('Applied → Interviewing')).not.toBeInTheDocument();
  });

  it('keeps the saved detail usable when activity fails', async () => {
    vi.mocked(getAnalysisTrackingHistory).mockRejectedValue(new Error('network'));
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText('Pathfinder could not load application activity. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update status' })).toBeEnabled();
  });

  it('keeps activity unchanged after a same-status update', async () => {
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'not_applied', updated_at: null });
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByText('No application status changes have been recorded yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await screen.findByText('Application status updated.');
    expect(getAnalysisTrackingHistory).toHaveBeenCalledTimes(1);
  });

  it('reports activity refresh failure separately after saving status', async () => {
    vi.mocked(getAnalysisTrackingHistory)
      .mockResolvedValueOnce({ items: [] })
      .mockRejectedValueOnce(new Error('network'));
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'applied', updated_at: '2026-09-03T11:00:00Z' });
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByText('No application status changes have been recorded yet.');
    fireEvent.change(screen.getByLabelText('Choose application status'), { target: { value: 'applied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    expect(await screen.findByText('Current status: Applied')).toBeInTheDocument();
    expect(await screen.findByText('Application status was saved, but the activity timeline could not be refreshed.')).toBeInTheDocument();
    expect(screen.getByText('Application status updated.')).toBeInTheDocument();
  });
});

describe('application note workflow', () => {
  const emptyNote = { analysis_id: summary.analysis_id, content: null, updated_at: null };
  const savedNote = { analysis_id: summary.analysis_id, content: '  🐍\n<script>alert(1)</script>  ', updated_at: '2026-09-04T10:00:00Z' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(updateAnalysisNote).mockReset();
    vi.mocked(clearAnalysisNote).mockReset();
  });

  async function openDetail() {
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    return await screen.findByRole('textbox', { name: 'Application note' });
  }

  it('loads an empty note and saves exact plain text only on explicit action', async () => {
    vi.mocked(updateAnalysisNote).mockResolvedValue(savedNote);
    const textarea = await openDetail();
    expect(screen.getByRole('heading', { name: 'Application note' })).toBeInTheDocument();
    expect(screen.getByText('No application note saved.')).toBeInTheDocument();
    expect(textarea).toHaveAttribute('maxLength', '10000');
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    fireEvent.change(textarea, { target: { value: savedNote.content } });
    expect(updateAnalysisNote).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Application note saved.')).toBeInTheDocument();
    expect(updateAnalysisNote).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, savedNote.content);
    expect(textarea).toHaveValue(savedNote.content);
    expect(screen.getByText(`Last updated ${formatSavedTimestamp(savedNote.updated_at)}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    expect(screen.getByText(`${savedNote.content.length} / 10,000`)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(getAnalysisTrackingHistory).toHaveBeenCalledTimes(1);
    expect(updateAnalysisTracking).not.toHaveBeenCalled();
    vi.mocked(getAnalysisNote).mockResolvedValue(savedNote);
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await waitFor(() => expect(getAnalysisNote).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('textbox', { name: 'Application note' })).toHaveValue(savedNote.content);
  });

  it('preserves multiline hostile and Markdown-like text as inert textarea content', async () => {
    const content = '<img src=x onerror=alert(1)>\n# Heading\n[link](https://example.invalid)\n`code`\n\' OR 1=1 --';
    vi.mocked(getAnalysisNote).mockResolvedValue({ ...savedNote, content });
    const textarea = await openDetail();
    expect(textarea).toHaveValue(content);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
  });

  it('requires confirmation to clear and preserves unrelated workflow state', async () => {
    vi.mocked(getAnalysisNote).mockResolvedValue(savedNote);
    vi.mocked(clearAnalysisNote).mockResolvedValue(undefined);
    const textarea = await openDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Clear note' }));
    expect(clearAnalysisNote).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Clear this application note?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(textarea).toHaveValue(savedNote.content);
    fireEvent.click(screen.getByRole('button', { name: 'Clear note' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear note' }));
    expect(await screen.findByText('Application note cleared.')).toBeInTheDocument();
    expect(clearAnalysisNote).toHaveBeenCalledExactlyOnceWith(summary.analysis_id);
    expect(textarea).toHaveValue('');
    expect(screen.queryByText(`Last updated ${formatSavedTimestamp(savedNote.updated_at)}`)).not.toBeInTheDocument();
    expect(screen.getByText('Current status: Not applied')).toBeInTheDocument();
    expect(getAnalysisTrackingHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  });

  it('guards other mutations during save and retains a failed draft', async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(updateAnalysisNote).mockReturnValue(new Promise((_, r) => { reject = r; }));
    const textarea = await openDetail();
    fireEvent.change(textarea, { target: { value: 'Follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(screen.getByText('Saving application note…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Update status' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete saved analysis' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Back to History/ })).toBeDisabled();
    reject(new ApiError('private', 422, 'validation_error'));
    expect(await screen.findByText('The application note is invalid. Check that it contains text and is no longer than 10,000 characters.')).toBeInTheDocument();
    expect(textarea).toHaveValue('Follow up');
    expect(screen.getByRole('button', { name: 'Save note' })).toBeEnabled();
  });

  it('keeps detail usable after note load failure and retries', async () => {
    vi.mocked(getAnalysisNote).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(emptyNote);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText('Pathfinder could not load the application note. Please try again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save note' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry note' }));
    expect(await screen.findByRole('textbox', { name: 'Application note' })).toHaveValue('');
  });

  it.each([
    [new ApiError('private', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('private', 503, 'persistence_unavailable'), 'Application notes are unavailable because persistence is not configured on this Pathfinder server.'],
  ])('shows a safe note load failure without hiding detail', async (failure, text) => {
    vi.mocked(getAnalysisNote).mockRejectedValue(failure);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update status' })).toBeEnabled();
  });

  it('prevents blank or unchanged saves and disables note mutations during status updates', async () => {
    const textarea = await openDetail();
    fireEvent.change(textarea, { target: { value: ' \n ' } });
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    fireEvent.change(textarea, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    let resolve!: (value: { analysis_id: string; application_status: 'applied'; updated_at: string }) => void;
    vi.mocked(updateAnalysisTracking).mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    expect(textarea).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeDisabled();
    resolve({ analysis_id: summary.analysis_id, application_status: 'applied', updated_at: '2026-09-04T10:00:00Z' });
    await screen.findByText('Current status: Applied');
    expect(textarea).toBeEnabled();
  });

  it('retains note and draft after a failed clear', async () => {
    vi.mocked(getAnalysisNote).mockResolvedValue(savedNote);
    vi.mocked(clearAnalysisNote).mockRejectedValue(new Error('network'));
    const textarea = await openDetail();
    fireEvent.change(textarea, { target: { value: 'Unsaved edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear note' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear note' }));
    expect(await screen.findByText('Pathfinder could not clear the application note. Please try again.')).toBeInTheDocument();
    expect(textarea).toHaveValue('Unsaved edit');
    expect(screen.getByText(`Last updated ${formatSavedTimestamp(savedNote.updated_at)}`)).toBeInTheDocument();
  });
});


describe('application follow-up workflow', () => {
  const empty = { analysis_id: summary.analysis_id, follow_up_on: null, updated_at: null };
  const saved = { analysis_id: summary.analysis_id, follow_up_on: '2026-10-12', updated_at: '2026-10-03T10:00:00Z' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
  });

  async function openDetail() {
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    return await screen.findByLabelText('Follow-up date');
  }

  it('coordinates comparison and Back to Comparison with a pending follow-up', async () => {
    const onBack = vi.fn();
    const props = { detail, onBack, onDelete: vi.fn(), backLabel: 'Back to Comparison', comparisonSelectionId: 'other', onSelectComparison: vi.fn(), onClearComparison: vi.fn(), onCompare: vi.fn() };
    const { rerender } = render(<SavedDetailView {...props} comparing />);
    const input = await screen.findByLabelText('Follow-up date');
    expect(input).toBeDisabled();
    rerender(<SavedDetailView {...props} comparing={false} />);
    fireEvent.change(input, { target: { value: saved.follow_up_on } });
    let resolve!: (value: typeof saved) => void;
    vi.mocked(updateAnalysisFollowUp).mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    for (const name of ['Back to Comparison', 'Compare with selected', 'Clear comparison selection']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(onBack).not.toHaveBeenCalled();
    expect(props.onCompare).not.toHaveBeenCalled();
    resolve(saved);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to Comparison' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back to Comparison' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('distinguishes a History refresh failure from a successful save', async () => {
    vi.mocked(updateAnalysisFollowUp).mockResolvedValue(saved);
    vi.mocked(getAnalysisHistory).mockResolvedValueOnce({ items: [summary] }).mockRejectedValueOnce(new Error('PRIVATE'));
    const input = await openDetail();
    fireEvent.change(input, { target: { value: saved.follow_up_on } });
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    await screen.findByText('Follow-up date was saved, but History could not refresh. Please try refreshing History.');
    expect(input).toHaveValue(saved.follow_up_on);
    expect(screen.getByText('Follow-up date saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save follow-up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Back to History/ })).toBeEnabled();
  });

  it('loads independently and forbids saving until the date resource arrives', async () => {
    let resolve!: (value: typeof empty) => void;
    vi.mocked(getAnalysisFollowUp).mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    expect(screen.getByText('Loading follow-up date\u2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save follow-up' })).not.toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Application note' })).toBeEnabled();
    expect(screen.getByText('Loading follow-up date\u2026')).toBeInTheDocument();
    resolve(empty);
    expect(await screen.findByLabelText('Follow-up date')).toHaveValue('');
    expect(screen.getByText('No follow-up date set.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save follow-up' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear follow-up' })).not.toBeInTheDocument();
  });

  it('saves only on explicit action, uses the server response, and refreshes History', async () => {
    vi.mocked(updateAnalysisFollowUp).mockResolvedValue(saved);
    vi.mocked(getAnalysisHistory).mockResolvedValueOnce({ items: [summary] })
      .mockResolvedValue({ items: [{ ...summary, follow_up_on: saved.follow_up_on }] });
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const input = await openDetail();
    expect(input).toHaveAttribute('type', 'date');
    expect(input).not.toHaveAttribute('min');
    fireEvent.change(input, { target: { value: saved.follow_up_on } });
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    await screen.findByText('Follow-up date saved.');
    expect(updateAnalysisFollowUp).toHaveBeenCalledExactlyOnceWith(summary.analysis_id, saved.follow_up_on);
    expect(input).toHaveValue(saved.follow_up_on);
    expect(screen.getByText('Follow up on ' + formatCalendarDate(saved.follow_up_on))).toBeInTheDocument();
    expect(screen.getByText('Last updated ' + formatSavedTimestamp(saved.updated_at))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save follow-up' })).toBeDisabled();
    expect(getAnalysisTrackingHistory).toHaveBeenCalledTimes(1);
    expect(updateAnalysisTracking).not.toHaveBeenCalled();
    expect(updateAnalysisNote).not.toHaveBeenCalled();
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    expect(await screen.findByText('Follow up: ' + formatCalendarDate(saved.follow_up_on))).toBeInTheDocument();
    storage.mockRestore();
  });

  it('preserves past dates and requires confirmation before clear; cancel preserves draft', async () => {
    const past = { ...saved, follow_up_on: '2000-01-01' };
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(past);
    vi.mocked(clearAnalysisFollowUp).mockResolvedValue(undefined);
    const input = await openDetail();
    expect(input).toHaveValue(past.follow_up_on);
    expect(screen.getByText('Follow up on ' + formatCalendarDate(past.follow_up_on))).toBeInTheDocument();
    expect(screen.queryByText(/overdue|due soon|due today/i)).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear follow-up' }));
    expect(clearAnalysisFollowUp).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(input).toHaveValue('2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Clear follow-up' }));
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Clear this follow-up date?' })).getByRole('button', { name: 'Clear follow-up' }));
    await screen.findByText('Follow-up date cleared.');
    expect(input).toHaveValue('');
    expect(clearAnalysisFollowUp).toHaveBeenCalledExactlyOnceWith(summary.analysis_id);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Last updated ' + formatSavedTimestamp(saved.updated_at))).not.toBeInTheDocument();
    expect(screen.getByText('Current status: Not applied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  });

  it.each([
    [new ApiError('PRIVATE', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Follow-up dates are unavailable because persistence is not configured on this Pathfinder server.'],
    [new Error('PRIVATE'), 'Pathfinder could not load the follow-up date. Please try again.'],
  ])('keeps detail usable after load failure and retries', async (failure, message) => {
    vi.mocked(getAnalysisFollowUp).mockRejectedValueOnce(failure).mockResolvedValueOnce(empty);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Platform Engineer/ }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save follow-up' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Candidate Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update status' })).toBeEnabled();
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry follow-up' }));
    expect(await screen.findByLabelText('Follow-up date')).toHaveValue('');
  });

  it.each([
    [new ApiError('PRIVATE', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Follow-up dates are unavailable because persistence is not configured on this Pathfinder server.'],
    [new ApiError('PRIVATE', 422, 'validation_error'), 'The follow-up date is invalid.'],
    [new Error('PRIVATE'), 'Pathfinder could not save the follow-up date. Please try again.'],
  ])('retains a failed save draft and releases mutation guards', async (failure, message) => {
    let reject!: (reason: unknown) => void;
    vi.mocked(updateAnalysisFollowUp).mockReturnValue(new Promise((_, r) => { reject = r; }));
    const input = await openDetail();
    fireEvent.change(input, { target: { value: saved.follow_up_on } });
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    expect(screen.getByText('Saving follow-up\u2026')).toBeInTheDocument();
    for (const name of ['Save follow-up', 'Save note', 'Update status', 'Delete saved analysis', 'Select for comparison']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /Back to History/ })).toBeDisabled();
    expect(screen.getByLabelText('Choose application status')).toBeDisabled();
    reject(failure);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(input).toHaveValue(saved.follow_up_on);
    expect(screen.getByRole('button', { name: 'Save follow-up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Back to History/ })).toBeEnabled();
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
  });

  it.each([
    [new ApiError('PRIVATE', 404, 'analysis_not_found'), 'This saved analysis no longer exists.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Follow-up dates are unavailable because persistence is not configured on this Pathfinder server.'],
    [new ApiError('PRIVATE', 422, 'validation_error'), 'The follow-up date is invalid.'],
    [new Error('PRIVATE'), 'Pathfinder could not clear the follow-up date. Please try again.'],
  ])('retains persisted date and draft after failed clear', async (failure, message) => {
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(saved);
    let reject!: (reason: unknown) => void;
    vi.mocked(clearAnalysisFollowUp).mockReturnValue(new Promise((_, r) => { reject = r; }));
    const input = await openDetail();
    fireEvent.change(input, { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear follow-up' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear follow-up' }));
    expect(screen.getByText('Clearing follow-up\u2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update status' })).toBeDisabled();
    reject(failure);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(input).toHaveValue('2026-12-01');
    expect(screen.getByText('Follow up on ' + formatCalendarDate(saved.follow_up_on))).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
  });

  it('disables follow-up during status, note, and deletion mutations', async () => {
    const input = await openDetail();
    fireEvent.change(input, { target: { value: saved.follow_up_on } });
    let resolveStatus!: (value: { analysis_id: string; application_status: 'applied'; updated_at: string }) => void;
    vi.mocked(updateAnalysisTracking).mockReturnValue(new Promise((r) => { resolveStatus = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    expect(input).toBeDisabled();
    resolveStatus({ analysis_id: summary.analysis_id, application_status: 'applied', updated_at: saved.updated_at });
    await waitFor(() => expect(input).toBeEnabled());
    let resolveNote!: (value: { analysis_id: string; content: string; updated_at: string }) => void;
    vi.mocked(updateAnalysisNote).mockReturnValue(new Promise((r) => { resolveNote = r; }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Application note' }), { target: { value: 'Fictional note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(input).toBeDisabled();
    resolveNote({ analysis_id: summary.analysis_id, content: 'Fictional note', updated_at: saved.updated_at });
    await waitFor(() => expect(input).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    expect(input).toBeDisabled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(input).toBeEnabled();
    let rejectDelete!: (reason: unknown) => void;
    vi.mocked(deleteSavedAnalysis).mockReturnValue(new Promise((_, r) => { rejectDelete = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete permanently' }));
    expect(input).toBeDisabled();
    rejectDelete(new Error('network'));
    await screen.findByText('Pathfinder could not delete this saved analysis. Please try again.');
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
  });

  it('shows dates only when present and preserves server ordering', async () => {
    const second = { ...summary, analysis_id: 'second', job_title: 'Second role', follow_up_on: '2000-01-01' };
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary, second] });
    render(<AnalysisHistory />);
    await screen.findByText('Second role');
    expect(screen.getAllByText(/Follow up:/)).toHaveLength(1);
    expect(screen.getByText('Follow up: ' + formatCalendarDate(second.follow_up_on))).toBeInTheDocument();
    expect(screen.queryByText(/No follow-up/)).not.toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Platform Engineer');
    expect(rows[1]).toHaveTextContent('Second role');
  });
});


describe('follow-up history worklist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [] });
  });

  it('keeps drafts until Apply, combines filters, and clears every control', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    expect(screen.getByLabelText('Follow-up status')).toHaveValue('all');
    expect(screen.getByLabelText('Sort order')).toHaveValue('created_desc');
    expect(screen.getByLabelText('Follow-up from')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Follow-up to')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Follow-up status'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '2000-02-29' } });
    fireEvent.change(screen.getByLabelText('Follow-up to'), { target: { value: '2000-02-29' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'Example' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '100' } });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('No saved analyses match these filters.');
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, {
      has_follow_up: true, follow_up_from: '2000-02-29', follow_up_to: '2000-02-29',
      sort: 'follow_up_asc', query: 'Example', ai_enriched: false, application_status: 'applied',
      min_score: 0, max_score: 100,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByText('No saved analyses yet.');
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0);
    for (const label of ['Follow-up from', 'Follow-up to', 'Minimum score', 'Maximum score', 'Search job title or company']) {
      expect(screen.getByLabelText(label)).toHaveValue(label.includes('score') ? null : '');
    }
    expect(screen.getByLabelText('Follow-up status')).toHaveValue('all');
    expect(screen.getByLabelText('Sort order')).toHaveValue('created_desc');
    expect(screen.getByLabelText('Application status')).toHaveValue('all');
    expect(screen.getByLabelText('AI enrichment')).toHaveValue('all');
  });

  it.each(['Follow-up from', 'Follow-up to'])('rejects Not scheduled with %s without discarding dates', async (label) => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Follow-up status'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: '2024-02-29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose Scheduled or All follow-ups');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(label)).toHaveValue('2024-02-29');
    fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { has_follow_up: false }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rejects inverted dates and accepts a single date bound', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('Follow-up to'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('on or before');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { follow_up_to: '2026-12-31' }));
  });

  it('resets pagination on Apply and Clear and retains applied order on Next and Refresh', async () => {
    const page = Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: String(index), job_title: `Worklist ${index}` }));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: page });
    render(<AnalysisHistory />);
    await screen.findByText('Worklist 0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { sort: 'follow_up_asc' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { sort: 'follow_up_asc' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { sort: 'follow_up_asc' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0));
    expect(screen.getByText('Page 1')).toBeInTheDocument();
  });

  it('ignores an older pending response after follow-up criteria change', async () => {
    let resolveOld!: (value: { items: SavedAnalysisSummary[] }) => void;
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<AnalysisHistory />);
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '2024-02-29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('No saved analyses match these filters.');
    await act(async () => { resolveOld({ items: [summary] }); });
    expect(screen.queryByText('Platform Engineer')).not.toBeInTheDocument();
  });

  it('uses the unfiltered empty state when only the order changes', async () => {
    render(<AnalysisHistory />);
    await screen.findByText('No saved analyses yet.');
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { sort: 'follow_up_asc' }));
    expect(await screen.findByText('No saved analyses yet.')).toBeInTheDocument();
  });
});


describe('pipeline overview integration with History', () => {
  const overview: PipelineOverview = {
    total_analyses: 1,
    status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 1 : 0 })),
    scheduled_follow_up_count: 1, unscheduled_follow_up_count: 0,
    earliest_follow_ups: [{ analysis_id: summary.analysis_id, job_title: 'Pipeline role', company_name: null,
      application_status: 'not_applied', follow_up_on: '2000-02-29' }],
  };
  const changed: PipelineOverview = { ...overview, earliest_follow_ups: [{ ...overview.earliest_follow_ups[0], job_title: 'Updated pipeline role' }] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue(overview);
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
  });

  it('opens existing Detail directly from an overview entry and reloads on Back', async () => {
    vi.mocked(getApplicationPipelineOverview).mockResolvedValueOnce(overview).mockResolvedValue(changed);
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Pipeline role/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    expect(getSavedAnalysis).toHaveBeenCalledExactlyOnceWith(summary.analysis_id);
    expect(screen.queryByRole('heading', { name: 'Application Pipeline Overview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    expect(await screen.findByRole('button', { name: /Updated pipeline role/ })).toBeInTheDocument();
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(2);
  });

  it('keeps History usable while overview loads and recovers independently', async () => {
    let resolve!: (value: PipelineOverview) => void;
    vi.mocked(getApplicationPipelineOverview).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    expect(screen.getByText('Loading application pipeline overview...')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { application_status: 'applied' }));
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
    await act(async () => resolve(overview));
    expect(await screen.findByRole('button', { name: /Pipeline role/ })).toBeInTheDocument();
  });

  it('keeps overview usable while History loads or fails', async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(getAnalysisHistory).mockReturnValueOnce(new Promise((_, rejectPromise) => { reject = rejectPromise; }));
    render(<AnalysisHistory />);
    expect(await screen.findByRole('button', { name: /Pipeline role/ })).toBeEnabled();
    expect(screen.getByText(/Loading saved analyses/)).toBeInTheDocument();
    await act(async () => reject(new Error('PRIVATE list failure')));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load analysis history');
    expect(screen.getByRole('button', { name: /Pipeline role/ })).toBeEnabled();
  });

  it('recovers overview failure independently, then Refresh reloads both resources', async () => {
    vi.mocked(getApplicationPipelineOverview).mockRejectedValueOnce(new Error('PRIVATE'));
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load the application pipeline overview');
    fireEvent.click(screen.getByRole('button', { name: 'Retry overview' }));
    await screen.findByRole('button', { name: /Pipeline role/ });
    expect(getAnalysisHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole('button', { name: /Pipeline role/ })).toBeInTheDocument();
  });

  it('reloads persisted overview after an application status update', async () => {
    const after: PipelineOverview = { ...changed,
      status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'offer' ? 1 : 0 })),
      earliest_follow_ups: [{ ...changed.earliest_follow_ups[0], application_status: 'offer' }],
    };
    vi.mocked(getApplicationPipelineOverview).mockResolvedValueOnce(overview).mockResolvedValue(after);
    vi.mocked(updateAnalysisTracking).mockResolvedValue({ analysis_id: summary.analysis_id, application_status: 'offer', updated_at: '2026-01-01T00:00:00Z' });
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Pipeline role/ }));
    await screen.findByText('Current status: Not applied');
    fireEvent.change(screen.getByLabelText('Choose application status'), { target: { value: 'offer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Back to History/ })).toBeEnabled());
    expect(screen.getByText('Application status updated.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    expect(await screen.findByRole('button', { name: /Updated pipeline role/ })).toHaveTextContent('Offer');
  });

  it.each(['save', 'change', 'clear'])('reloads persisted overview after follow-up %s', async (action) => {
    const saved = { analysis_id: summary.analysis_id, follow_up_on: '2099-12-31', updated_at: '2026-01-01T00:00:00Z' };
    const after: PipelineOverview = action === 'clear' ? { ...changed, scheduled_follow_up_count: 0, unscheduled_follow_up_count: 1, earliest_follow_ups: [] }
      : { ...changed, earliest_follow_ups: [{ ...changed.earliest_follow_ups[0], follow_up_on: saved.follow_up_on }] };
    vi.mocked(getApplicationPipelineOverview).mockResolvedValueOnce(overview).mockResolvedValue(after);
    if (action !== 'save') vi.mocked(getAnalysisFollowUp).mockResolvedValue({ ...saved, follow_up_on: '2000-02-29' });
    vi.mocked(updateAnalysisFollowUp).mockResolvedValue(saved);
    vi.mocked(clearAnalysisFollowUp).mockResolvedValue();
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Pipeline role/ }));
    const input = await screen.findByLabelText('Follow-up date');
    if (action === 'clear') {
      fireEvent.click(screen.getByRole('button', { name: 'Clear follow-up' }));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear follow-up' }));
      await screen.findByText('Follow-up date cleared.');
    } else {
      fireEvent.change(input, { target: { value: saved.follow_up_on } });
      fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
      await screen.findByText('Follow-up date saved.');
    }
    await waitFor(() => expect(screen.getByRole('button', { name: /Back to History/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    if (action === 'clear') expect(await screen.findByText('No scheduled follow-ups.')).toBeInTheDocument();
    else expect(await screen.findByRole('button', { name: /Updated pipeline role/ })).toHaveTextContent(formatCalendarDate(saved.follow_up_on));
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(2);
  });

  it('reloads overview after successful deletion', async () => {
    vi.mocked(getApplicationPipelineOverview).mockResolvedValueOnce(overview).mockResolvedValue({ ...overview,
      total_analyses: 0, scheduled_follow_up_count: 0, earliest_follow_ups: [],
      status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: 0 })),
    });
    vi.mocked(getAnalysisHistory).mockResolvedValueOnce({ items: [summary] }).mockResolvedValue({ items: [] });
    vi.mocked(deleteSavedAnalysis).mockResolvedValue();
    render(<AnalysisHistory />);
    fireEvent.click(await screen.findByRole('button', { name: /Pipeline role/ }));
    await screen.findByRole('heading', { name: 'Candidate Profile' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await screen.findByText('No saved analyses yet.');
    const totals = within(await screen.findByRole('region', { name: 'Application totals' }));
    expect(totals.getAllByRole('definition').map((value) => value.textContent)).toEqual(['0', '0', '0']);
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(2);
  });
});


describe('application pipeline CSV downloads', () => {
  const createObjectURL = vi.fn(() => 'blob:pipeline-csv');
  const revokeObjectURL = vi.fn();
  let downloaded: Array<{ filename: string; href: string; connected: boolean }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(downloadApplicationPipelineCsv).mockReset();
    vi.mocked(downloadApplicationPipelineCsv).mockResolvedValue(new Blob(['CSV']));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: [summary] });
    downloaded = [];
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push({ filename: this.download, href: this.href, connected: this.isConnected });
    });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each(['success', 'failure'] as const)('keeps Board/List exports independent and discards late Board %s on view switch', async (outcome) => {
    let resolveBoard!: (blob: Blob) => void;
    let rejectBoard!: (error: Error) => void;
    let resolveList!: (blob: Blob) => void;
    const boardPromise = new Promise<Blob>((resolve, reject) => { resolveBoard = resolve; rejectBoard = reject; });
    const listPromise = new Promise<Blob>((resolve) => { resolveList = resolve; });
    vi.mocked(getSavedAnalysis).mockResolvedValue(detail);
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, offset, filters) => ({
      items: limit === 11 ? (filters?.application_status === 'not_applied' ? [summary] : [])
        : offset ? [summary] : Array.from({ length: 20 }, (_, i) => ({ ...summary, analysis_id: `page-${i}` })),
    }));
    render(<AnalysisHistory />); await screen.findAllByText('Platform Engineer');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'List applied' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(screen.getByText('Apply filters'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'List applied', sort: 'follow_up_asc' }));
    fireEvent.click(screen.getByText('Next')); await screen.findByText('Page 2');
    fireEvent.click(screen.getByRole('button', { name: /Platform Engineer/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select for comparison' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to History/ }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'List dirty' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'created_desc' } });
    fireEvent.click(screen.getByText('Board view'));
    const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    fireEvent.change(board.getByRole('searchbox'), { target: { value: 'Board applied' } });
    fireEvent.click(board.getByText('Apply search'));
    fireEvent.change(board.getByLabelText('Board AI enrichment'), { target: { value: 'no' } });
    fireEvent.click(board.getByText('Apply AI filter'));
    await board.findByText('Platform Engineer');
    fireEvent.change(board.getByRole('searchbox'), { target: { value: 'Board dirty' } });
    const historyCalls = vi.mocked(getAnalysisHistory).mock.calls.length;
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValueOnce(listPromise).mockReturnValueOnce(boardPromise);
    fireEvent.click(screen.getByText('Download filtered CSV')); fireEvent.click(board.getByText('Download Board CSV'));
    expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(1, { query: 'List applied', sort: 'follow_up_asc' });
    expect(downloadApplicationPipelineCsv).toHaveBeenNthCalledWith(2, { query: 'Board applied', ai_enriched: false });
    expect(screen.getByText('Download filtered CSV')).toBeDisabled(); expect(board.getByText('Download Board CSV')).toBeDisabled();
    expect(screen.getByText('Download all CSV')).toBeEnabled();
    expect(board.getByRole('searchbox')).toHaveValue('Board dirty');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(historyCalls); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    fireEvent.click(screen.getByText('List view'));
    await act(async () => { if (outcome === 'success') resolveBoard(new Blob(['Board'])); else rejectBoard(new Error('PRIVATE')); });
    expect(downloaded).toHaveLength(0); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Download filtered CSV')).toBeDisabled();
    await act(async () => resolveList(new Blob(['List'])));
    expect(downloaded.map(({ filename }) => filename)).toEqual(['pathfinder-application-pipeline-filtered.csv']);
    fireEvent.click(screen.getByText('Download all CSV'));
    await waitFor(() => expect(downloaded).toHaveLength(2)); expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({});
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('List dirty');
    expect(screen.getByLabelText('Sort order')).toHaveValue('created_desc');
    expect(screen.getByText('Page 2')).toBeInTheDocument(); expect(screen.getByText('Selected for comparison: Platform Engineer')).toBeInTheDocument();
    expect(compareSavedAnalyses).not.toHaveBeenCalled();
    expect(getAnalysisHistory).toHaveBeenCalledTimes(historyCalls); expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
  });

  it('keeps export errors separate while List and Board requests complete independently', async () => {
    let rejectList!: (error: Error) => void;
    const listPromise = new Promise<Blob>((_resolve, reject) => { rejectList = reject; });
    render(<AnalysisHistory />); await screen.findByRole('button', { name: /Platform Engineer/ });
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValueOnce(listPromise);
    fireEvent.click(screen.getByText('Download all CSV'));
    fireEvent.click(screen.getByText('Board view'));
    const board = within(await screen.findByRole('region', { name: 'Application Pipeline Board' }));
    vi.mocked(downloadApplicationPipelineCsv).mockRejectedValueOnce(new ApiError('PRIVATE', 413, 'export_limit_exceeded'));
    fireEvent.click(board.getByText('Download Board CSV'));
    expect(await board.findByRole('alert')).toHaveTextContent('narrower Board filters');
    expect(screen.getByText('Download all CSV')).toBeDisabled();
    fireEvent.click(board.getByText('Download Board CSV'));
    await waitFor(() => expect(downloaded).toHaveLength(1));
    expect(downloaded[0].filename).toBe('pathfinder-kanban-board.csv'); expect(board.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Download all CSV')).toBeDisabled();
    await act(async () => rejectList(new Error('PRIVATE')));
    expect(screen.getByRole('alert')).toHaveTextContent('could not export the application pipeline');
    expect(board.queryByRole('alert')).not.toBeInTheDocument(); expect(board.getByText('Download Board CSV')).toBeEnabled();
    expect(document.body).not.toHaveTextContent('PRIVATE');
  });

  it('offers explicit exports and privacy copy with no automatic download', async () => {
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    expect(screen.getByRole('button', { name: 'Download all CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeDisabled();
    expect(screen.getByText('CSV exports include every matching saved analysis, not just the current page. Downloaded files may contain job and company information; store and share them carefully.')).toBeInTheDocument();
    expect(screen.getByText(/regardless of current History filters/)).toBeInTheDocument();
    expect(downloadApplicationPipelineCsv).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'draft only' } });
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeDisabled();
  });

  it('uses applied criteria across pages, ignores drafts, and full export stays unfiltered', async () => {
    const page = Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: String(index), job_title: `Role ${index}` }));
    vi.mocked(getAnalysisHistory).mockResolvedValue({ items: page });
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<AnalysisHistory />);
    await screen.findByText('Role 0');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'Example' } });
    fireEvent.change(screen.getByLabelText('AI enrichment'), { target: { value: 'no' } });
    fireEvent.change(screen.getByLabelText('Application status'), { target: { value: 'applied' } });
    fireEvent.change(screen.getByLabelText('Minimum score'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Maximum score'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Follow-up status'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Follow-up from'), { target: { value: '2000-02-29' } });
    fireEvent.change(screen.getByLabelText('Follow-up to'), { target: { value: '2099-12-31' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, expect.any(Object)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unapplied draft' } });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'created_desc' } });
    const historyCalls = vi.mocked(getAnalysisHistory).mock.calls.length;
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Download filtered CSV' }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(1));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ query: 'Example', ai_enriched: false,
      application_status: 'applied', min_score: 0, max_score: 100, has_follow_up: true,
      follow_up_from: '2000-02-29', follow_up_to: '2099-12-31', sort: 'follow_up_asc' });
    fireEvent.click(screen.getByRole('button', { name: 'Download all CSV' }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(2));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({});
    expect(downloaded).toEqual([
      { filename: 'pathfinder-application-pipeline-filtered.csv', href: 'blob:pipeline-csv', connected: true },
      { filename: 'pathfinder-application-pipeline.csv', href: 'blob:pipeline-csv', connected: true },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('unapplied draft');
    expect(screen.getByLabelText('Sort order')).toHaveValue('created_desc');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(historyCalls);
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    expect(analyzeCandidateJob).not.toHaveBeenCalled();
    expect(updateAnalysisTracking).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
    storage.mockRestore();
  });

  it('offers filtered downloads for applied sort-only criteria and resets on Clear', async () => {
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.change(screen.getByLabelText('Sort order'), { target: { value: 'follow_up_asc' } });
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download filtered CSV' }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalled());
    expect(downloadApplicationPipelineCsv).toHaveBeenCalledExactlyOnceWith({ sort: 'follow_up_asc' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeDisabled();
    await screen.findByRole('button', { name: /Platform Engineer/ });
  });

  it('keeps modes independent and suppresses repeated clicks while downloads are pending', async () => {
    let resolveAll!: (blob: Blob) => void; let resolveFiltered!: (blob: Blob) => void;
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValueOnce(new Promise((resolve) => { resolveAll = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveFiltered = resolve; }));
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.change(screen.getByLabelText('Follow-up status'), { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const all = screen.getByRole('button', { name: 'Download all CSV' });
    const filtered = screen.getByRole('button', { name: 'Download filtered CSV' });
    fireEvent.click(all); fireEvent.click(all);
    expect(downloadApplicationPipelineCsv).toHaveBeenCalledTimes(1);
    expect(all).toBeDisabled(); expect(filtered).toBeEnabled();
    fireEvent.click(filtered); fireEvent.click(filtered);
    expect(downloadApplicationPipelineCsv).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Preparing all records CSV...')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Preparing filtered records CSV...')).toHaveAttribute('role', 'status');
    await act(async () => resolveAll(new Blob(['all'])));
    expect(all).toBeEnabled(); expect(filtered).toBeDisabled();
    await act(async () => resolveFiltered(new Blob(['filtered'])));
    expect(filtered).toBeEnabled();
    expect(downloaded).toHaveLength(2);
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ has_follow_up: false });
  });

  it.each([
    [new ApiError('PRIVATE', 413, 'export_limit_exceeded'), 'Too many records to export at once. Apply narrower filters and try again.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.'],
    [new ApiError('PRIVATE', 422, 'validation_error'), 'Pathfinder could not export the application pipeline. Please try again.'],
    [new Error('PRIVATE'), 'Pathfinder could not export the application pipeline. Please try again.'],
  ])('keeps state and supports retry after a safe export failure', async (failure, message) => {
    vi.mocked(downloadApplicationPipelineCsv).mockRejectedValueOnce(failure);
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'applied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'applied' }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'draft' } });
    const calls = vi.mocked(getAnalysisHistory).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Download filtered CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled(); expect(downloaded).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Download filtered CSV' })).toBeEnabled();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('draft');
    expect(screen.getByText('Page 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download filtered CSV' }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(1));
    expect(downloadApplicationPipelineCsv).toHaveBeenLastCalledWith({ query: 'applied' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getAnalysisHistory).toHaveBeenCalledTimes(calls);
  });

  it('cleans up the URL and anchor if the browser download fails', async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => { throw new Error('PRIVATE browser'); });
    render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.click(screen.getByRole('button', { name: 'Download all CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not export the application pipeline');
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:pipeline-csv');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download all CSV' })).toBeEnabled();
  });

  it.each(['success', 'failure'])('ignores a late export %s after unmount without downloading', async (outcome) => {
    let resolve!: (blob: Blob) => void; let reject!: (reason: unknown) => void;
    vi.mocked(downloadApplicationPipelineCsv).mockReturnValueOnce(new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; }));
    const consoleError = vi.spyOn(console, 'error');
    const { unmount } = render(<AnalysisHistory />);
    await screen.findByRole('button', { name: /Platform Engineer/ });
    fireEvent.click(screen.getByRole('button', { name: 'Download all CSV' }));
    unmount();
    await act(async () => { if (outcome === 'success') resolve(new Blob(['CSV'])); else reject(new Error('PRIVATE')); });
    expect(createObjectURL).not.toHaveBeenCalled(); expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});


describe('Board quick note integration', () => {
  it.each(['create', 'edit', 'clear'])('keeps List state and Overview stable after note %s and guards navigation immediately', async (action) => {
    vi.clearAllMocks();
    vi.mocked(getAnalysisHistory).mockImplementation(async (limit, _offset, filters) => ({ items: limit === 20
      ? Array.from({ length: 20 }, (_, index) => ({ ...summary, analysis_id: `list-${index}`, job_title: `List role ${index}` }))
      : filters?.application_status === 'not_applied' ? [summary] : [],
    }));
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({
      total_analyses: 1, status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: value === 'not_applied' ? 1 : 0 })),
      scheduled_follow_up_count: 1, unscheduled_follow_up_count: 0,
      earliest_follow_ups: [{ analysis_id: summary.analysis_id, job_title: 'Overview role', company_name: null, application_status: 'not_applied', follow_up_on: '2026-10-20' }],
    });
    vi.mocked(getAnalysisNote).mockResolvedValue({ analysis_id: summary.analysis_id, content: action === 'create' ? null : 'persisted', updated_at: null });
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    vi.mocked(updateAnalysisNote).mockImplementation(async (id, content) => { await pending; return { analysis_id: id, content, updated_at: null }; });
    vi.mocked(clearAnalysisNote).mockImplementation(async () => { await pending; });
    render(<AnalysisHistory />);
    await screen.findByText('List role 0');
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'applied criteria' } });
    fireEvent.click(screen.getByText('Apply filters'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 0, { query: 'applied criteria' }));
    await screen.findByText('List role 0');
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(getAnalysisHistory).toHaveBeenLastCalledWith(20, 20, { query: 'applied criteria' }));
    fireEvent.change(screen.getByLabelText('Search job title or company'), { target: { value: 'unapplied draft' } });
    fireEvent.click(screen.getByText('Board view'));
    fireEvent.click(await screen.findByText('Edit note'));
    const input = await screen.findByRole('textbox', { name: 'Application note' });
    const historyCalls = vi.mocked(getAnalysisHistory).mock.calls.length;
    const overviewCalls = vi.mocked(getApplicationPipelineOverview).mock.calls.length;
    const list = screen.getByText('List view');
    const refresh = screen.getByRole('button', { name: 'Refresh' });
    const detailButton = within(screen.getByRole('region', { name: 'Application Pipeline Overview' })).getByRole('button');
    let button: HTMLElement;
    if (action === 'clear') {
      fireEvent.click(screen.getByText('Clear note'));
      button = within(screen.getByRole('alertdialog')).getByText('Clear note');
    } else {
      fireEvent.change(input, { target: { value: '  exact\nnote  ' } });
      button = screen.getByText('Save note');
    }
    act(() => { button.click(); list.click(); detailButton.click(); refresh.click(); });
    expect(list).toBeDisabled(); expect(detailButton).toBeDisabled(); expect(refresh).toBeDisabled();
    expect(screen.getByText('Board view')).toHaveAttribute('aria-pressed', 'true');
    expect(getSavedAnalysis).not.toHaveBeenCalled();
    expect(screen.getByText('Open details')).toBeDisabled();
    await act(async () => complete());
    await screen.findByText(action === 'clear' ? 'Application note cleared.' : 'Application note saved.');
    expect(input).toHaveValue(action === 'clear' ? '' : '  exact\nnote  ');
    expect(getAnalysisHistory).toHaveBeenCalledTimes(historyCalls);
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(overviewCalls);
    expect(getAnalysisNote).toHaveBeenCalledOnce();
    fireEvent.click(list);
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Search job title or company')).toHaveValue('unapplied draft');
    expect(screen.getByText('Download filtered CSV')).toBeEnabled();
    expect(screen.getByRole('button', { name: /List role 0/ })).toBeInTheDocument();
  });
});
