import { StrictMode } from 'react';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeCandidateJob, ApiError, getAnalysisHistory, getAnalysisTracking, updateAnalysisTracking, getAnalysisFollowUp, updateAnalysisFollowUp, clearAnalysisFollowUp, getAnalysisNote, updateAnalysisNote, clearAnalysisNote } from '../../../api/pathfinder';
import type { AnalysisNote, AnalysisFollowUp, AnalysisHistoryResponse, AnalysisTracking, ApplicationStatus, SavedAnalysisSummary } from '../../../types/api';
import type { AnalysisHistorySort } from '../../../api/pathfinder';
import { ApplicationPipelineBoard } from '../ApplicationPipelineBoard';
import { applicationStatuses } from '../status';
import { formatCalendarDate, formatSavedTimestamp } from '../formatting';
import type { BoardFollowUpFilters } from '../boardFollowUpFilters';

vi.mock('../../../api/pathfinder', async (original) => ({
  ...await original<typeof import('../../../api/pathfinder')>(),
  analyzeCandidateJob: vi.fn(), getAnalysisHistory: vi.fn(), getAnalysisTracking: vi.fn(), updateAnalysisTracking: vi.fn(),
  getAnalysisNote: vi.fn(), updateAnalysisNote: vi.fn(), clearAnalysisNote: vi.fn(),
  getAnalysisFollowUp: vi.fn(), updateAnalysisFollowUp: vi.fn(), clearAnalysisFollowUp: vi.fn(),
}));

const record = (id = 'record', status: ApplicationStatus = 'not_applied'): SavedAnalysisSummary => ({
  analysis_id: id, job_title: `Fictional Engineer ${id}`, company_name: null, score: null,
  created_at: '2026-10-01T10:00:00Z', ai_enriched: false, application_status: status,
  status_updated_at: null, follow_up_on: null,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const onOpen = vi.fn();
const onStatusChanged = vi.fn();
const props = { onOpen, onStatusChanged, opening: false, refreshKey: 0 };
const searchInput = () => screen.getByRole('searchbox', { name: 'Search board by job title or company' });
function searchBoard(query: string) {
  fireEvent.change(searchInput(), { target: { value: query } });
  fireEvent.click(screen.getByText('Apply search'));
}
const sortInput = () => screen.getByRole('combobox', { name: 'Board sort order' });
const sortForm = () => screen.getByRole('form', { name: 'Board sorting' });
function draftSort(value: AnalysisHistorySort) {
  fireEvent.change(sortInput(), { target: { value } });
}
function applySort(value: AnalysisHistorySort = 'follow_up_asc') {
  draftSort(value); fireEvent.submit(sortForm());
}
const aiInput = () => screen.getByRole('combobox', { name: 'Board AI enrichment' });
const aiForm = () => screen.getByRole('form', { name: 'Board AI enrichment filter' });
function draftAiFilter(value: 'all' | 'yes' | 'no') {
  fireEvent.change(aiInput(), { target: { value } });
}
function applyAiFilter(value: 'all' | 'yes' | 'no') {
  draftAiFilter(value); fireEvent.submit(aiForm());
}
const scoreForm = () => screen.getByRole('form', { name: 'Board match score filters' });
const minScore = () => screen.getByLabelText('Minimum match score (%) (Board)');
const maxScore = () => screen.getByLabelText('Maximum match score (%) (Board)');
function draftScoreFilters(min = '', max = '') {
  fireEvent.change(minScore(), { target: { value: min } });
  fireEvent.change(maxScore(), { target: { value: max } });
}
function applyScoreFilters(min = '', max = '') {
  draftScoreFilters(min, max);
  fireEvent.submit(scoreForm());
}
const followUpForm = () => screen.getByRole('form', { name: 'Board follow-up filters' });
function draftFollowUpFilters(status: BoardFollowUpFilters['status'] = 'all', from = '', to = '') {
  fireEvent.change(screen.getByLabelText('Board follow-up status'), { target: { value: status } });
  fireEvent.change(screen.getByLabelText('Board follow-up from'), { target: { value: from } });
  fireEvent.change(screen.getByLabelText('Board follow-up to'), { target: { value: to } });
}
function applyFollowUpFilters(status: BoardFollowUpFilters['status'] = 'all', from = '', to = '') {
  draftFollowUpFilters(status, from, to);
  fireEvent.click(within(followUpForm()).getByText('Apply filters'));
}
const followUpValue = (date: string | null = null, id = 'record'): AnalysisFollowUp => ({ analysis_id: id, follow_up_on: date, updated_at: null });
async function openFollowUp(index = 0) {
  fireEvent.click((await screen.findAllByRole('button', { name: 'Edit follow-up' }))[index]);
  return await screen.findByLabelText('Follow-up date');
}
const lane = (name = 'Not applied') => within(screen.getByRole('region', { name }));
const history = vi.mocked(getAnalysisHistory);
const tracking = vi.mocked(getAnalysisTracking);
const update = vi.mocked(updateAnalysisTracking);

function dragData(initial: Record<string, string> = {}) {
  let values = { ...initial };
  return {
    get types() { return Object.keys(values); },
    clearData: vi.fn(() => { values = {}; }),
    setData: vi.fn((type: string, value: string) => { values[type] = value; }),
    getData: vi.fn((type: string) => values[type] ?? ''),
    effectAllowed: 'uninitialized', dropEffect: 'none',
  };
}

async function startDrag(id = 'record') {
  const handle = await screen.findByRole('button', { name: `Drag to change status for Fictional Engineer ${id}` });
  const dataTransfer = dragData();
  fireEvent.dragStart(handle, { dataTransfer });
  return { handle, dataTransfer };
}

function dropIn(label: string, dataTransfer: ReturnType<typeof dragData>) {
  fireEvent.drop(screen.getByRole('region', { name: label }), { dataTransfer });
}

function leaveLane(target: HTMLElement, relatedTarget: HTMLElement, dataTransfer: ReturnType<typeof dragData>) {
  // jsdom lacks DragEvent; EventInit otherwise silently drops relatedTarget.
  const event = createEvent.dragLeave(target, { dataTransfer });
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  fireEvent(target, event);
}

function supply(items: SavedAnalysisSummary[]) {
  history.mockImplementation(async (limit, offset, filters) => ({
    items: items.filter((item) => item.application_status === filters?.application_status)
      .slice(offset ?? 0, (offset ?? 0) + (limit ?? 20)),
  }));
}

async function review(target = 'applied') {
  await screen.findByText('Fictional Engineer record');
  fireEvent.change(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' }), { target: { value: target } });
  fireEvent.click(lane().getByRole('button', { name: 'Review change' }));
}

describe('Kanban follow-up filters', () => {
  const cases = [
    { status: 'all', from: '', to: '', expected: {} },
    { status: 'yes', from: '', to: '', expected: { has_follow_up: true } },
    { status: 'no', from: '', to: '', expected: { has_follow_up: false } },
    { status: 'all', from: '0001-01-01', to: '', expected: { follow_up_from: '0001-01-01' } },
    { status: 'all', from: '', to: '9999-12-31', expected: { follow_up_to: '9999-12-31' } },
    { status: 'all', from: '2024-02-29', to: '2024-02-29', expected: { follow_up_from: '2024-02-29', follow_up_to: '2024-02-29' } },
    { status: 'yes', from: '2024-02-29', to: '2026-10-31', expected: { has_follow_up: true, follow_up_from: '2024-02-29', follow_up_to: '2026-10-31' } },
  ] as const;

  it.each(cases)('applies $status / $from / $to to every lane only on submission', async ({ status, from, to, expected }) => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    expect(screen.getByLabelText('Board follow-up status')).toHaveValue('all');
    for (const name of ['Board follow-up from', 'Board follow-up to']) {
      const input = screen.getByLabelText(name);
      expect(input).toHaveAttribute('type', 'date');
      expect(input).toHaveAttribute('min', '0001-01-01'); expect(input).toHaveAttribute('max', '9999-12-31');
    }
    draftFollowUpFilters(status, from, to);
    expect(history).toHaveBeenCalledTimes(7);
    expect(screen.getByText('Applied board follow-up filters: All.')).toBeInTheDocument();
    const apply = within(followUpForm()).getByText('Apply filters'); apply.focus();
    fireEvent.submit(followUpForm());
    await screen.findByText('Fictional Engineer record');
    expect(apply).toHaveFocus();
    const count = status === 'all' && !from && !to ? 7 : 14;
    expect(history).toHaveBeenCalledTimes(count);
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, ...expected });
    fireEvent.click(apply); expect(history).toHaveBeenCalledTimes(count);
    const applied = within(followUpForm()).getByText(/^Applied board follow-up filters:/);
    expect(applied).toHaveTextContent(status === 'yes' ? 'Scheduled' : status === 'no' ? 'Not scheduled' : 'All');
    if (from) expect(applied).toHaveTextContent(`from ${from}`);
    if (to) expect(applied).toHaveTextContent(`to ${to}`);
    expect(screen.getAllByRole('region', { name: /^(Not applied|Applied|Interviewing|Offer|Accepted|Rejected|Withdrawn)$/ })).toHaveLength(7);
    expect(update).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'no', from: '2026-10-21', to: '', message: 'Scheduled or All' },
    { status: 'no', from: '', to: '2026-10-21', message: 'Scheduled or All' },
    { status: 'all', from: '2026-10-22', to: '2026-10-21', message: 'on or before' },
    { status: 'yes', from: '10000-01-01', to: '', message: 'YYYY-MM-DD' },
  ] as const)('retains applied filters/cards on invalid $status / $from / $to', async ({ status, from, to, message }) => {
    render(<ApplicationPipelineBoard {...props} />); applyFollowUpFilters('yes');
    await screen.findByText('Fictional Engineer record');
    applyFollowUpFilters(status, from, to);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Board follow-up from')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Applied board follow-up filters: Scheduled.')).toBeInTheDocument();
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(14);
    fireEvent.click(screen.getByText('Clear follow-up filters'));
    await screen.findByText('Fictional Engineer record');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Board follow-up status')).toHaveValue('all');
    expect(screen.getByLabelText('Board follow-up from')).toHaveValue('');
    expect(history).toHaveBeenCalledTimes(21);
  });

  it('rejects an incomplete native date instead of treating it as an absent bound', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    const input = screen.getByLabelText('Board follow-up from');
    // Browsers can expose partial typed dates through badInput while value is empty.
    Object.defineProperty(input, 'validity', { configurable: true, value: { valid: false, badInput: true } });
    fireEvent.submit(followUpForm());
    expect(screen.getByRole('alert')).toHaveTextContent('YYYY-MM-DD');
    expect(history).toHaveBeenCalledTimes(7);
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
  });

  it('composes applied criteria while preserving independent drafts and clear actions', async () => {
    render(<ApplicationPipelineBoard {...props} />); searchBoard('AI Engineer');
    applyFollowUpFilters('yes', '2026-10-01', '2026-10-31');
    await screen.findByText('Fictional Engineer record');
    const followUp = { has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31' };
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, query: 'AI Engineer', ...followUp });
    draftFollowUpFilters('no'); searchBoard('new search');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'new search', ...followUp });
    fireEvent.change(searchInput(), { target: { value: 'unsent query' } });
    applyFollowUpFilters('no');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'new search', has_follow_up: false });
    fireEvent.click(screen.getByText('Clear follow-up filters'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'new search' });
    expect(searchInput()).toHaveValue('unsent query');
    applyFollowUpFilters('yes'); fireEvent.click(screen.getByText('Clear search'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', has_follow_up: true });
    expect(screen.getByLabelText('Board follow-up status')).toHaveValue('yes');
    fireEvent.click(screen.getByText('Clear follow-up filters'));
    draftFollowUpFilters('no', '', '');
    const count = history.mock.calls.length;
    fireEvent.click(screen.getByText('Clear follow-up filters'));
    expect(history).toHaveBeenCalledTimes(count);
    expect(screen.getByLabelText('Board follow-up status')).toHaveValue('all');
    await screen.findByText('Fictional Engineer record');
  });

  it('retains server ordering, inclusive boundary records, deduplication, and independent filtered pages/retry', async () => {
    const items = applicationStatuses.flatMap(({ value }) => Array.from({ length: 22 }, (_, i) => ({
      ...record(`${value}-${i}`, value), follow_up_on: i % 2 ? '2026-10-31' : '2026-10-01',
    })));
    supply(items);
    render(<ApplicationPipelineBoard {...props} />); searchBoard('Engineer'); applySort(); applyAiFilter('no'); applyScoreFilters('72.25', '87.75'); applyFollowUpFilters('yes', '2026-10-01', '2026-10-31');
    await lane().findByText('Fictional Engineer not_applied-9');
    expect(lane().getAllByRole('heading', { level: 5 }).map((node) => node.textContent))
      .toEqual(items.slice(0, 10).map((item) => item.job_title));
    expect(lane().queryByText('Fictional Engineer not_applied-10')).not.toBeInTheDocument();
    const expected = { sort: 'follow_up_asc', ai_enriched: false, min_score: 72.25, max_score: 87.75, query: 'Engineer', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31' };
    history.mockRejectedValueOnce(new Error('PRIVATE'));
    fireEvent.click(screen.getByText('Load more Not applied'));
    expect(await lane().findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    draftFollowUpFilters('no');
    history.mockResolvedValueOnce({ items: [items[9], items[10]] });
    fireEvent.click(screen.getByText('Retry Not applied'));
    await lane().findByText('Fictional Engineer not_applied-10');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied', ...expected });
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(11);
    fireEvent.click(screen.getByText('Load more Applied'));
    await lane('Applied').findByText('Fictional Engineer applied-19');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'applied', ...expected });
    applyFollowUpFilters('no');
    await lane().findByText('Fictional Engineer not_applied-9');
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && filters?.has_follow_up === false)).toBe(true);
    fireEvent.click(screen.getByText('Clear follow-up filters'));
    await lane().findByText('Fictional Engineer not_applied-9');
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && filters?.has_follow_up === undefined && filters?.query === 'Engineer')).toBe(true);
  });

  it.each(['initial', 'page'].flatMap((phase) => ['resolve', 'reject'].map((outcome) => ({ phase, outcome }))))('ignores stale $phase $outcome after changing combined filters', async ({ phase, outcome }) => {
    const old = deferred<AnalysisHistoryResponse>(); const next = deferred<AnalysisHistoryResponse>();
    const items = Array.from({ length: 12 }, (_, i) => record(String(i)));
    history.mockImplementation(async (limit, offset, filters) => {
      if (filters?.has_follow_up && (phase === 'initial' || offset === 10)) return old.promise;
      if (filters?.has_follow_up === false && filters.application_status === 'applied') return next.promise;
      return { items: filters?.application_status === 'not_applied' ? items.slice(offset ?? 0, (offset ?? 0) + (limit ?? 11)) : [] };
    });
    render(<ApplicationPipelineBoard {...props} />); applyFollowUpFilters('yes');
    if (phase === 'page') fireEvent.click(await screen.findByText('Load more Not applied'));
    searchBoard('B'); applyFollowUpFilters('no');
    await screen.findByText('Fictional Engineer 0');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('STALE')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer STALE')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lane('Applied').getByRole('status')).toHaveTextContent('Loading Applied');
    await act(async () => next.resolve({ items: [] }));
    expect(lane('Applied').getByText('No matching saved analyses in Applied.')).toBeInTheDocument();
    expect(lane('Applied').queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Load more Not applied'));
    await screen.findByText('Fictional Engineer 11');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied', query: 'B', has_follow_up: false });
  });

  it('guards same-tick Apply/Clear and search composition and invalidates drag sessions', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const drag = await startDrag(); draftFollowUpFilters('yes');
    const apply = within(followUpForm()).getByText('Apply filters'); const clear = screen.getByText('Clear follow-up filters');
    act(() => { apply.click(); apply.click(); clear.click(); clear.click(); apply.click(); });
    expect(history).toHaveBeenCalledTimes(21);
    expect(screen.getByLabelText('Board follow-up status')).toHaveValue('all');
    expect(history.mock.calls.slice(-7).every(([, , filters]) => filters?.has_follow_up === undefined)).toBe(true);
    await screen.findByText('Fictional Engineer record'); dropIn('Applied', drag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument();
    draftFollowUpFilters('no'); fireEvent.change(searchInput(), { target: { value: 'Engineer' } });
    act(() => { apply.click(); screen.getByText('Apply search').click(); });
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Engineer', has_follow_up: false });
    await screen.findByText('Fictional Engineer record');
    expect(document.querySelector('.pipeline-card-dragging')).toBeNull(); expect(update).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('preserves filters on refresh and ignores stale StrictMode/unmounted %s', async (outcome) => {
    const old = deferred<AnalysisHistoryResponse>(); const late = deferred<AnalysisHistoryResponse>();
    history.mockReturnValueOnce(old.promise);
    const { rerender, unmount } = render(<StrictMode><ApplicationPipelineBoard {...props} /></StrictMode>);
    applyFollowUpFilters('yes', '2024-02-29'); searchBoard('Engineer'); applyScoreFilters('72.25', '87.75'); applyAiFilter('no'); applySort(); await screen.findByText('Fictional Engineer record');
    history.mockReturnValueOnce(late.promise);
    fireEvent.click(screen.getByText('Refresh board'));
    draftFollowUpFilters('no');
    rerender(<StrictMode><ApplicationPipelineBoard {...props} refreshKey={1} /></StrictMode>);
    await screen.findByText('Fictional Engineer record');
    expect(history.mock.calls.slice(-14).every(([, offset, filters]) => offset === 0 && filters?.sort === 'follow_up_asc' && filters.ai_enriched === false && filters.min_score === 72.25 && filters.max_score === 87.75 && filters.query === 'Engineer' && filters.has_follow_up === true && filters.follow_up_from === '2024-02-29')).toBe(true);
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('old')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer old')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(screen.getByLabelText('Board follow-up status')).toHaveValue('no');
    unmount();
    await act(async () => { if (outcome === 'resolve') late.resolve({ items: [record('late')] }); else late.reject(new Error('PRIVATE')); });
    expect(onStatusChanged).not.toHaveBeenCalled(); expect(onOpen).not.toHaveBeenCalled();
    supply([]); render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('No saved analyses in Not applied.');
    expect(screen.getByLabelText('Board follow-up status')).toHaveValue('all');
  });

  it.each(['create', 'reschedule', 'clear'] as const)('keeps acknowledged follow-up %s visible when the card leaves filtered results', async (action) => {
    const before = action === 'create' ? null : '2026-10-21';
    supply([{ ...record(), follow_up_on: before }]);
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue(before));
    const put = deferred<AnalysisFollowUp>(); const remove = deferred<void>();
    vi.mocked(updateAnalysisFollowUp).mockReturnValue(put.promise);
    vi.mocked(clearAnalysisFollowUp).mockReturnValue(remove.promise);
    const updated = vi.fn(async () => {});
    render(<ApplicationPipelineBoard {...props} onFollowUpUpdated={updated} />);
    searchBoard('Engineer'); applyScoreFilters('72.25', '87.75'); applyAiFilter('no'); applySort(); applyFollowUpFilters(action === 'create' ? 'no' : 'yes', '', action === 'reschedule' ? '2026-10-21' : '');
    const input = await openFollowUp();
    if (action === 'clear') {
      fireEvent.click(screen.getByText('Clear follow-up'));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear follow-up'));
    } else {
      fireEvent.change(input, { target: { value: '2026-10-22' } }); fireEvent.click(screen.getByText('Save follow-up'));
    }
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    supply([]);
    await act(async () => { if (action === 'clear') remove.resolve(); else put.resolve(followUpValue('2026-10-22')); });
    await screen.findByText(action === 'clear' ? 'Follow-up date cleared.' : 'Follow-up date saved.');
    expect(lane().getByText('No matching saved analyses in Not applied.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Quick follow-up' })).toBeInTheDocument();
    expect(input).toHaveValue(action === 'clear' ? '' : '2026-10-22');
    expect(updated).toHaveBeenCalledOnce();
    for (const [, offset, filters] of history.mock.calls.slice(-7)) {
      expect(offset).toBe(0); expect(filters?.sort).toBe('follow_up_asc'); expect(filters?.ai_enriched).toBe(false); expect(filters?.min_score).toBe(72.25); expect(filters?.max_score).toBe(87.75); expect(filters?.query).toBe('Engineer'); expect(filters?.has_follow_up).toBe(action !== 'create');
      expect(filters?.follow_up_to).toBe(action === 'reschedule' ? '2026-10-21' : undefined);
    }
    expect(screen.queryByText(/no longer exists/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Close editing'));
    expect(screen.getByText('Refresh board')).toHaveFocus();
  });

  it('preserves combined filters after confirmed status movement and avoids lane reload after note-only saves', async () => {
    render(<ApplicationPipelineBoard {...props} />); searchBoard('Engineer'); applyScoreFilters('72.25', '87.75'); applyAiFilter('no'); applySort(); applyFollowUpFilters('yes', '2024-02-29');
    const note = await openNote();
    vi.mocked(updateAnalysisNote).mockResolvedValue(noteValue('private draft'));
    fireEvent.change(note, { target: { value: 'private draft' } });
    fireEvent.click(screen.getByText('Save note')); await screen.findByText('Application note saved.');
    expect(history).toHaveBeenCalledTimes(42);
    fireEvent.click(screen.getByText('Close editing'));
    await review(); supply([record('record', 'applied')]);
    fireEvent.click(screen.getByText('Confirm status change'));
    await screen.findByText('Application status changed to Applied.');
    expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(49);
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && filters?.sort === 'follow_up_asc' && filters.ai_enriched === false && filters.min_score === 72.25 && filters.max_score === 87.75 && filters.query === 'Engineer' && filters.has_follow_up === true && filters.follow_up_from === '2024-02-29')).toBe(true);
    expect(onStatusChanged).toHaveBeenCalledOnce();
  });
});

describe('Kanban board search', () => {
  it('keeps drafts local, normalizes Enter submission, validates, and avoids redundant reloads', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    const input = searchInput(); input.focus();
    fireEvent.change(input, { target: { value: '  Example   Labs  ' } });
    expect(history).toHaveBeenCalledTimes(7);
    // Native Enter submits this form; exercise the submit handler.
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Applied board search: Example Labs');
    await screen.findByText('Fictional Engineer record');
    expect(input).toHaveFocus(); expect(input).toHaveValue('Example Labs');
    expect(history).toHaveBeenCalledTimes(14);
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, query: 'Example Labs' });
    searchBoard(' Example   Labs ');
    expect(history).toHaveBeenCalledTimes(14);
    searchBoard('x'.repeat(201));
    expect(screen.getByRole('alert')).toHaveTextContent('at most 200 characters');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(history).toHaveBeenCalledTimes(14);
    expect(screen.getByText('Applied board search: Example Labs')).toBeInTheDocument();
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear search'));
    expect(input).toHaveValue(''); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(21);
    fireEvent.change(input, { target: { value: 'draft only' } });
    fireEvent.click(screen.getByText('Clear search'));
    expect(input).toHaveValue(''); expect(history).toHaveBeenCalledTimes(21);
    searchBoard('x'.repeat(200)); expect(history).toHaveBeenCalledTimes(28);
    searchBoard('   '); expect(history).toHaveBeenCalledTimes(35);
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn' });
    await screen.findByText('Fictional Engineer record');
  });

  it('renders metadata from all seven lanes in server order without local matching or sorting', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    supply(applicationStatuses.flatMap(({ value }) => [record(`${value}-z`, value), record(`${value}-a`, value)]));
    const query = "%_'\\ <script>literal</script>";
    searchBoard(query);
    for (const { value, label } of applicationStatuses) {
      await lane(label).findByText(`Fictional Engineer ${value}-z`);
      expect(lane(label).getAllByRole('heading', { level: 5 }).map((node) => node.textContent))
        .toEqual([`Fictional Engineer ${value}-z`, `Fictional Engineer ${value}-a`]);
      expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, query });
    }
    expect(document.querySelector('script')).toBeNull();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(getAnalysisNote).not.toHaveBeenCalled(); expect(getAnalysisFollowUp).not.toHaveBeenCalled();
  });

  it('preserves filtered independent pagination, lookahead, deduplication, failed pages, and lane Retry', async () => {
    supply(applicationStatuses.flatMap(({ value }) => Array.from({ length: 23 }, (_, i) => record(`${value}-${i}`, value))));
    render(<ApplicationPipelineBoard {...props} />);
    searchBoard('first');
    await lane().findByText('Fictional Engineer not_applied-9');
    expect(lane().queryByText('Fictional Engineer not_applied-10')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Load more Not applied'));
    await lane().findByText('Fictional Engineer not_applied-19');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied', query: 'first' });
    history.mockRejectedValueOnce(new Error('PRIVATE'));
    fireEvent.click(screen.getByText('Load more Applied'));
    expect(await lane('Applied').findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(lane('Applied').getAllByRole('heading', { level: 5 })).toHaveLength(10);
    history.mockResolvedValueOnce({ items: [record('applied-9', 'applied'), record('extra', 'applied')] });
    fireEvent.click(screen.getByText('Retry Applied'));
    await lane('Applied').findByText('Fictional Engineer extra');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'applied', query: 'first' });
    expect(lane('Applied').getAllByRole('heading', { level: 5 })).toHaveLength(11);
    searchBoard('second');
    await lane().findByText('Fictional Engineer not_applied-9');
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && filters?.query === 'second')).toBe(true);
    fireEvent.click(screen.getByText('Clear search'));
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && !filters?.query)).toBe(true);
    await lane().findByText('Fictional Engineer not_applied-9');
  });

  it.each(['resolve', 'reject'] as const)('ignores stale search %s without clearing newer loading state', async (outcome) => {
    const old = deferred<AnalysisHistoryResponse>(); const current = deferred<AnalysisHistoryResponse>();
    history.mockImplementation(async (_limit, _offset, filters) => {
      if (filters?.query === 'A') return old.promise;
      if (filters?.query === 'B' && filters.application_status === 'applied') return current.promise;
      return { items: filters?.application_status === 'not_applied' ? [record(filters.query ?? 'initial')] : [] };
    });
    render(<ApplicationPipelineBoard {...props} />);
    searchBoard('A'); searchBoard('B');
    await screen.findByText('Fictional Engineer B');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('STALE')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer STALE')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lane('Applied').getByRole('status')).toHaveTextContent('Loading Applied');
    await act(async () => current.resolve({ items: [] }));
    expect(lane('Applied').getByText('No matching saved analyses in Applied.')).toBeInTheDocument();
    expect(lane('Applied').queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Application status lanes' }).children).toHaveLength(7);
  });

  it.each(['resolve', 'reject'] as const)('ignores previous-search Load more %s after a new query', async (outcome) => {
    supply(Array.from({ length: 12 }, (_, i) => record(String(i))));
    render(<ApplicationPipelineBoard {...props} />);
    searchBoard('A');
    const old = deferred<AnalysisHistoryResponse>();
    await screen.findByText('Load more Not applied'); history.mockReturnValueOnce(old.promise);
    fireEvent.click(screen.getByText('Load more Not applied'));
    supply([record('new')]); searchBoard('B'); await screen.findByText('Fictional Engineer new');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('old-page')] }); else old.reject(new Error('PRIVATE')); });
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(1);
    expect(screen.queryByText('Fictional Engineer old-page')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('guards rapid Apply/Clear, invalidates drag, and retains search on both refresh paths', async () => {
    const { rerender } = render(<ApplicationPipelineBoard {...props} />);
    const drag = await startDrag();
    fireEvent.change(searchInput(), { target: { value: 'A' } });
    const apply = screen.getByText('Apply search'); const clear = screen.getByText('Clear search');
    act(() => { apply.click(); apply.click(); clear.click(); clear.click(); apply.click(); apply.click(); });
    expect(history).toHaveBeenCalledTimes(21);
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && !filters?.query)).toBe(true);
    expect(searchInput()).toHaveValue('');
    await screen.findByText('Fictional Engineer record'); dropIn('Applied', drag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument();
    expect(document.querySelector('.pipeline-card-dragging')).toBeNull();
    searchBoard('A');
    fireEvent.change(searchInput(), { target: { value: 'unsent' } });
    fireEvent.click(screen.getByText('Refresh board'));
    rerender(<ApplicationPipelineBoard {...props} refreshKey={1} />);
    await screen.findByText('Fictional Engineer record');
    expect(history.mock.calls.slice(-14).every(([, offset, filters]) => offset === 0 && filters?.query === 'A')).toBe(true);
    expect(searchInput()).toHaveValue('unsent');
    expect(screen.getByText('Applied board search: A')).toBeInTheDocument();
  });

  it.each(['note', 'follow-up'] as const)('requires closing a %s editor and guards same-tick opening', async (mode) => {
    render(<ApplicationPipelineBoard {...props} />); searchBoard('applied');
    await screen.findByText('Fictional Engineer record');
    fireEvent.change(searchInput(), { target: { value: 'new draft' } });
    const apply = screen.getByText('Apply search'); const clear = screen.getByText('Clear search');
    const filterApply = within(followUpForm()).getByText('Apply filters'); const filterClear = screen.getByText('Clear follow-up filters');
    draftFollowUpFilters('no');
    act(() => { screen.getByText(`Edit ${mode}`).click(); apply.click(); clear.click(); filterApply.click(); filterClear.click(); screen.getByText('Apply score filters').click(); screen.getByText('Clear score filters').click(); });
    const input = mode === 'note' ? await screen.findByRole('textbox', { name: 'Application note' }) : await screen.findByLabelText('Follow-up date');
    const value = mode === 'note' ? 'unsaved' : '2026-10-22';
    fireEvent.change(input, { target: { value } });
    expect(apply).toBeDisabled(); expect(clear).toBeDisabled();
    expect(filterApply).toBeDisabled(); expect(filterClear).toBeDisabled(); expect(screen.getByText('Apply score filters')).toBeDisabled(); expect(screen.getByText('Clear score filters')).toBeDisabled(); fireEvent.submit(followUpForm()); fireEvent.submit(scoreForm());
    fireEvent.submit(searchInput().closest('form')!);
    expect(history).toHaveBeenCalledTimes(14); expect(input).toHaveValue(value);
    fireEvent.click(screen.getByText('Close editing')); fireEvent.click(apply);
    expect(history).toHaveBeenCalledTimes(21);
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'new draft' });
    await screen.findByText('Fictional Engineer record');
  });

  it.each((['note', 'follow-up'] as const).flatMap((mode) => (['save', 'clear'] as const).map((action) => ({ mode, action }))))('blocks search during pending $mode $action and preserves the query', async ({ mode, action }) => {
    const notePut = deferred<AnalysisNote>(); const datePut = deferred<AnalysisFollowUp>();
    const remove = deferred<void>();
    vi.mocked(updateAnalysisNote).mockReturnValue(notePut.promise);
    vi.mocked(updateAnalysisFollowUp).mockReturnValue(datePut.promise);
    vi.mocked(clearAnalysisNote).mockReturnValue(remove.promise);
    vi.mocked(clearAnalysisFollowUp).mockReturnValue(remove.promise);
    if (action === 'clear') {
      vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('persisted'));
      vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-21'));
    }
    render(<ApplicationPipelineBoard {...props} />); searchBoard('active');
    const input = mode === 'note' ? await openNote() : await openFollowUp();
    const value = mode === 'note' ? 'saved' : '2026-10-22';
    fireEvent.change(input, { target: { value } });
    if (action === 'save') fireEvent.click(screen.getByText(mode === 'note' ? 'Save note' : 'Save follow-up'));
    else {
      fireEvent.click(screen.getByText(`Clear ${mode}`));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByText(`Clear ${mode}`));
    }
    searchBoard('blocked'); fireEvent.submit(searchInput().closest('form')!);
    applyFollowUpFilters('no'); fireEvent.submit(followUpForm()); fireEvent.click(screen.getByText('Clear follow-up filters')); applyScoreFilters('0', '100'); fireEvent.click(screen.getByText('Clear score filters'));
    fireEvent.click(screen.getByText('Clear search'));
    expect(screen.getByText('Applied board search: active')).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(14); expect(screen.getByText('Close editing')).toBeDisabled();
    await act(async () => {
      if (action === 'clear') remove.resolve();
      else if (mode === 'note') notePut.resolve(noteValue('saved'));
      else datePut.resolve(followUpValue('2026-10-22'));
    });
    expect(history).toHaveBeenCalledTimes(mode === 'note' ? 14 : 21);
    expect(history.mock.calls.slice(-7).every(([, , filters]) => filters?.query === 'active')).toBe(true);
    expect(input).toHaveValue(action === 'clear' ? '' : value);
  });

  it('blocks search during status confirmation and persistence and retains the query on success', async () => {
    const put = deferred<AnalysisTracking>(); update.mockReturnValueOnce(put.promise);
    render(<ApplicationPipelineBoard {...props} />); searchBoard('active'); await review();
    searchBoard('blocked'); fireEvent.submit(searchInput().closest('form')!);
    applyFollowUpFilters('no'); fireEvent.submit(followUpForm()); fireEvent.click(screen.getByText('Clear follow-up filters')); applyScoreFilters('0', '100'); fireEvent.click(screen.getByText('Clear score filters'));
    fireEvent.click(screen.getByText('Clear search'));
    expect(history).toHaveBeenCalledTimes(14); expect(screen.getByText('Apply search')).toBeDisabled();
    fireEvent.click(screen.getByText('Confirm status change'));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    fireEvent.submit(followUpForm()); fireEvent.click(screen.getByText('Clear follow-up filters')); applyScoreFilters('0', '100'); fireEvent.click(screen.getByText('Clear score filters'));
    fireEvent.submit(searchInput().closest('form')!); expect(history).toHaveBeenCalledTimes(14);
    supply([record('record', 'applied')]);
    await act(async () => put.resolve({ analysis_id: 'record', application_status: 'applied', updated_at: null }));
    expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(history.mock.calls.slice(-7).every(([, , filters]) => filters?.query === 'active')).toBe(true);
    expect(onStatusChanged).toHaveBeenCalledOnce(); expect(screen.getByText('Refresh board')).toHaveFocus();
  });

  it.each(['resolve', 'reject'] as const)('ignores old StrictMode requests and unmounted search %s', async (outcome) => {
    const old = deferred<AnalysisHistoryResponse>(); const late = deferred<AnalysisHistoryResponse>();
    history.mockReturnValueOnce(old.promise);
    const { unmount } = render(<StrictMode><ApplicationPipelineBoard {...props} /></StrictMode>);
    await screen.findByText('Fictional Engineer record'); searchBoard('current');
    await screen.findByText('Fictional Engineer record');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('old')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer old')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    history.mockReturnValue(late.promise); searchBoard('late'); unmount();
    await act(async () => { if (outcome === 'resolve') late.resolve({ items: [record('late')] }); else late.reject(new Error('PRIVATE')); });
    expect(onOpen).not.toHaveBeenCalled(); expect(onStatusChanged).not.toHaveBeenCalled();
    supply([record()]); render(<ApplicationPipelineBoard {...props} />); await screen.findByText('Fictional Engineer record');
    expect(searchInput()).toHaveValue(''); expect(screen.getByText('No board search applied.')).toBeInTheDocument();
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  supply([record()]);
  vi.mocked(getAnalysisNote).mockImplementation(async (id) => ({ analysis_id: id, content: null, updated_at: null }));
  tracking.mockResolvedValue({ analysis_id: 'record', application_status: 'not_applied', updated_at: null });
  update.mockResolvedValue({ analysis_id: 'record', application_status: 'applied', updated_at: '2026-10-16T10:00:00Z' });
  vi.mocked(getAnalysisFollowUp).mockImplementation(async (id) => ({ analysis_id: id, follow_up_on: null, updated_at: null }));
});

describe('Kanban quick follow-up', () => {
  it('uses the authoritative GET instead of the summary and rejects lane responses from before a save', async () => {
    const staleLane = deferred<AnalysisHistoryResponse>();
    history.mockImplementation(async (_limit, _offset, filters) => {
      if (filters?.application_status === 'applied') return staleLane.promise;
      return { items: filters?.application_status === 'not_applied' ? [{ ...record(), follow_up_on: '2026-10-20' }] : [] };
    });
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-21'));
    vi.mocked(updateAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-22'));
    render(<ApplicationPipelineBoard {...props} />);
    const input = await openFollowUp();
    expect(input).toHaveValue('2026-10-21');
    fireEvent.change(input, { target: { value: '2026-10-22' } });
    supply([{ ...record(), follow_up_on: '2026-10-22' }]);
    fireEvent.click(screen.getByText('Save follow-up'));
    await screen.findByText('Follow-up date saved.');
    await lane().findByText(`Follow up: ${formatCalendarDate('2026-10-22')}`);
    await act(async () => staleLane.resolve({ items: [record('stale', 'applied')] }));
    expect(screen.queryByText('Fictional Engineer stale')).not.toBeInTheDocument();
    expect(input).toHaveValue('2026-10-22');
    expect(getAnalysisFollowUp).toHaveBeenCalledOnce();
  });

  it('loads only the selected record, focuses the panel, and closes without persistence', async () => {
    supply([record(), { ...record('two'), company_name: 'Example Company' }]);
    render(<ApplicationPipelineBoard {...props} />);
    expect(await screen.findAllByRole('button', { name: 'Edit follow-up' })).toHaveLength(2);
    expect(getAnalysisFollowUp).not.toHaveBeenCalled();
    const input = await openFollowUp(1);
    expect(screen.getByRole('heading', { name: 'Quick follow-up' })).toHaveFocus();
    expect(screen.getByText('Fictional Engineer two — Example Company')).toBeInTheDocument();
    expect(getAnalysisFollowUp).toHaveBeenCalledExactlyOnceWith('two');
    expect(input).toHaveValue('');
    expect(screen.getByText('No follow-up date set.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear follow-up' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save follow-up' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '2024-02-29' } });
    fireEvent.click(screen.getByText('Close editing'));
    expect(screen.queryByText('Quick follow-up')).not.toBeInTheDocument();
    expect(screen.getAllByText('Edit follow-up')[1]).toHaveFocus();
    expect(await openFollowUp(1)).toHaveValue('');
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
    expect(clearAnalysisFollowUp).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    expect(tracking).not.toHaveBeenCalled();
  });

  it('isolates loading, ignores an old selection response, and falls back to Refresh on close', async () => {
    supply([record(), record('two')]);
    const old = deferred<AnalysisFollowUp>();
    vi.mocked(getAnalysisFollowUp).mockReturnValueOnce(old.promise).mockResolvedValueOnce(followUpValue('2027-01-01', 'two'));
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.click((await screen.findAllByText('Edit follow-up'))[0]);
    expect(screen.getByText('Loading follow-up date…')).toBeInTheDocument();
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(2);
    await openFollowUp(1);
    await act(async () => old.resolve(followUpValue('1999-12-31')));
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2027-01-01');
    expect(screen.getAllByRole('heading', { name: 'Quick follow-up' })).toHaveLength(1);
    supply([]);
    fireEvent.click(screen.getByText('Refresh board'));
    await screen.findByText('No saved analyses in Not applied.');
    fireEvent.click(screen.getByText('Close editing'));
    expect(screen.getByText('Refresh board')).toHaveFocus();
  });

  it.each([
    new ApiError('PRIVATE', 404, 'analysis_not_found'),
    new ApiError('PRIVATE', 503, 'persistence_unavailable'), new Error('PRIVATE'),
  ])('keeps lanes usable on a safe load error and retries only the editor', async (reason) => {
    vi.mocked(getAnalysisFollowUp).mockRejectedValueOnce(reason);
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.click(await screen.findByText('Edit follow-up'));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry follow-up'));
    expect(await screen.findByLabelText('Follow-up date')).toHaveValue('');
    expect(history).toHaveBeenCalledTimes(7);
  });

  it.each(['2024-02-29', '2026-12-31', '2027-01-01'])('saves %s without timezone conversion or optimistic updates and coordinates pending workflows', async (date) => {
    supply([record(), record('two')]);
    const saved = deferred<AnalysisFollowUp>();
    vi.mocked(updateAnalysisFollowUp).mockReturnValue(saved.promise);
    const onFollowUpUpdated = vi.fn(async () => {});
    render(<ApplicationPipelineBoard {...props} onFollowUpUpdated={onFollowUpUpdated} />);
    fireEvent.change(await openFollowUp(), { target: { value: date } });
    const save = screen.getByText('Save follow-up');
    fireEvent.click(save); fireEvent.click(save);
    expect(updateAnalysisFollowUp).toHaveBeenCalledExactlyOnceWith('record', date);
    expect(screen.getByText('Saving follow-up…')).toBeInTheDocument();
    expect(lane().getAllByText('No follow-up scheduled')).toHaveLength(2);
    for (const name of ['Close editing', 'Refresh board']) expect(screen.getByText(name)).toBeDisabled();
    for (const name of ['Open details', 'Edit follow-up', 'Review change']) {
      screen.getAllByText(name).forEach((button) => expect(button).toBeDisabled());
    }
    const { dataTransfer } = await startDrag();
    dropIn('Applied', dataTransfer);
    expect(tracking).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    supply([{ ...record(), follow_up_on: date }, record('two')]);
    await act(async () => saved.resolve(followUpValue(date)));
    expect(screen.getByText('Follow-up date saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up date')).toHaveValue(date);
    expect(lane().getByText(`Follow up: ${formatCalendarDate(date)}`)).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(14);
    expect(onFollowUpUpdated).toHaveBeenCalledOnce();
    expect(getAnalysisFollowUp).toHaveBeenCalledOnce();
    expect(screen.getByText('Save follow-up')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Follow-up date'), { target: { value: '' } });
    expect(screen.getByText('Save follow-up')).toBeDisabled();
  });

  it.each([
    new ApiError('PRIVATE', 404, 'analysis_not_found'), new ApiError('PRIVATE', 422, 'validation_error'),
    new ApiError('PRIVATE', 503, 'persistence_unavailable'), new Error('PRIVATE'),
  ])('preserves persisted and draft dates after failed save and permits intentional retry', async (reason) => {
    supply([{ ...record(), follow_up_on: '2026-10-20' }]);
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-20'));
    vi.mocked(updateAnalysisFollowUp).mockRejectedValueOnce(reason).mockResolvedValueOnce(followUpValue('2026-10-21'));
    render(<ApplicationPipelineBoard {...props} />);
    const input = await openFollowUp();
    expect(screen.getByText('Save follow-up')).toBeDisabled();
    fireEvent.click(screen.getByText('Save follow-up'));
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '2026-10-21' } });
    fireEvent.click(screen.getByText('Save follow-up'));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(input).toHaveValue('2026-10-21');
    expect(screen.getByText(`Follow up on ${formatCalendarDate('2026-10-20')}`)).toBeInTheDocument();
    expect(lane().getByText(`Follow up: ${formatCalendarDate('2026-10-20')}`)).toBeInTheDocument();
    expect(history).toHaveBeenCalledTimes(7);
    fireEvent.click(screen.getByText('Save follow-up'));
    await screen.findByText('Follow-up date saved.');
    expect(updateAnalysisFollowUp).toHaveBeenCalledTimes(2);
  });

  it('confirms clearing, preserves the card on failure, allows cancel/retry, and prevents duplicate DELETE', async () => {
    supply([{ ...record(), follow_up_on: '2026-10-20' }]);
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-20'));
    const clearing = deferred<void>();
    vi.mocked(clearAnalysisFollowUp).mockRejectedValueOnce(new Error('PRIVATE')).mockReturnValueOnce(clearing.promise);
    render(<ApplicationPipelineBoard {...props} />);
    await openFollowUp();
    fireEvent.click(screen.getByText('Clear follow-up'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Cancel'));
    expect(clearAnalysisFollowUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Clear follow-up'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear follow-up'));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(lane().getByText(`Follow up: ${formatCalendarDate('2026-10-20')}`)).toBeInTheDocument();
    expect(clearAnalysisFollowUp).toHaveBeenCalledExactlyOnceWith('record');
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Cancel'));
    fireEvent.click(screen.getByText('Clear follow-up'));
    const confirm = within(screen.getByRole('alertdialog')).getByText('Clear follow-up');
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(clearAnalysisFollowUp).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Close editing')).toBeDisabled();
    expect(lane().getByText(`Follow up: ${formatCalendarDate('2026-10-20')}`)).toBeInTheDocument();
    supply([record()]);
  vi.mocked(getAnalysisNote).mockImplementation(async (id) => ({ analysis_id: id, content: null, updated_at: null }));
    await act(async () => clearing.resolve());
    expect(screen.getByText('Follow-up date cleared.')).toBeInTheDocument();
    expect(lane().getByText('No follow-up scheduled')).toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('');
    expect(screen.queryByText('Clear follow-up')).not.toBeInTheDocument();
  });

  it('invalidates drag on opening and coordinates status confirmation without discarding a draft', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const firstDrag = await startDrag();
    fireEvent.change(await openFollowUp(), { target: { value: '2024-02-29' } });
    dropIn('Applied', firstDrag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument();
    expect(screen.queryByText('Dragging this card')).not.toBeInTheDocument();
    await review();
    expect(screen.getByText('Save follow-up')).toBeDisabled();
    expect(screen.getByText('Edit follow-up')).toBeDisabled();
    fireEvent.click(screen.getByText('Save follow-up'));
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByLabelText('Follow-up date')).toHaveValue('2024-02-29');
    fireEvent.click(screen.getByText('Close editing'));
    const secondDrag = await startDrag();
    dropIn('Applied', secondDrag.dataTransfer);
    fireEvent.click(screen.getByText('Confirm status change'));
    await screen.findByText('Application status changed to Applied.');
    expect(update).toHaveBeenCalledExactlyOnceWith('record', 'applied');
  });

  it.each(['save', 'clear'])('keeps an acknowledged %s when History synchronization fails', async (action) => {
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-20'));
    vi.mocked(updateAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-21'));
    vi.mocked(clearAnalysisFollowUp).mockResolvedValue(undefined);
    const onFollowUpUpdated = vi.fn().mockRejectedValue(new Error('PRIVATE'));
    render(<ApplicationPipelineBoard {...props} onFollowUpUpdated={onFollowUpUpdated} />);
    const input = await openFollowUp();
    if (action === 'save') {
      fireEvent.change(input, { target: { value: '2026-10-21' } });
      fireEvent.click(screen.getByText('Save follow-up'));
    } else {
      fireEvent.click(screen.getByText('Clear follow-up'));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear follow-up'));
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(/History could not refresh/);
    expect(screen.getByText(action === 'save' ? 'Follow-up date saved.' : 'Follow-up date cleared.')).toBeInTheDocument();
    expect(input).toHaveValue(action === 'save' ? '2026-10-21' : '');
    expect(screen.getByText('Close editing')).toBeEnabled();
    fireEvent.click(screen.getByText('Refresh board'));
    expect(screen.getByLabelText('Follow-up date')).toHaveValue(action === 'save' ? '2026-10-21' : '');
    expect(getAnalysisFollowUp).toHaveBeenCalledOnce();
    await screen.findByText('Fictional Engineer record');
  });
});

describe('ApplicationPipelineBoard', () => {
  it('renders seven ordered semantic lanes and makes bounded independent initial requests', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    expect(within(screen.getByRole('region', { name: 'Application status lanes' })).getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent))
      .toEqual(applicationStatuses.map((status) => status.label));
    expect(history).toHaveBeenCalledTimes(7);
    applicationStatuses.forEach(({ value }) => expect(history).toHaveBeenCalledWith(11, 0, { application_status: value }));
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(lane().getByText('Company not supplied')).toBeInTheDocument();
    expect(lane().getByText('Not scored')).toBeInTheDocument();
    expect(lane().getAllByRole('option').map((option) => (option as HTMLOptionElement).value))
      .toEqual(applicationStatuses.map(({ value }) => value));
    expect(lane().getByText(`Saved: ${formatSavedTimestamp(record().created_at)}`)).toBeInTheDocument();
    expect(screen.getByText(/History filters affect List view only/)).toBeInTheDocument();
  });

  it('renders stored scores, company names, and date-only follow-ups and opens existing detail', async () => {
    supply([{ ...record(), score: 76.5, company_name: 'Fictional Labs', follow_up_on: '2026-10-20' }]);
    render(<ApplicationPipelineBoard {...props} />);
    expect(await screen.findByText('76.5% match')).toBeInTheDocument();
    expect(screen.getByText('Fictional Labs')).toBeInTheDocument();
    expect(screen.getByText(`Follow up: ${formatCalendarDate('2026-10-20')}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    expect(onOpen).toHaveBeenCalledWith('record');
  });

  it('keeps all empty lanes visible without claiming emptiness during loading', async () => {
    const pending = deferred<AnalysisHistoryResponse>();
    history.mockReturnValue(pending.promise);
    render(<ApplicationPipelineBoard {...props} />);
    expect(screen.getAllByRole('status')).toHaveLength(7);
    expect(screen.queryByText(/No saved analyses in/)).not.toBeInTheDocument();
    await act(async () => pending.resolve({ items: [] }));
    expect(screen.getAllByText(/No saved analyses in/)).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('displays 10 records and appends the lookahead at offset 10 in server order', async () => {
    supply(Array.from({ length: 21 }, (_, index) => record(String(index))));
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer 0');
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    expect(screen.queryByText('Fictional Engineer 10')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more Not applied' }));
    await screen.findByText('Fictional Engineer 10');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied' });
    expect(lane().getAllByRole('heading', { level: 5 }).map((heading) => heading.textContent))
      .toEqual(Array.from({ length: 20 }, (_, index) => `Fictional Engineer ${index}`));
    fireEvent.click(screen.getByRole('button', { name: 'Load more Not applied' }));
    await screen.findByText('Fictional Engineer 20');
    expect(history).toHaveBeenLastCalledWith(11, 20, { application_status: 'not_applied' });
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('pages lanes independently and removes duplicates without changing server order', async () => {
    const first = Array.from({ length: 11 }, (_, index) => record(String(index)));
    history.mockImplementation(async (_limit, offset, filters) => ({ items:
      filters?.application_status === 'not_applied' ? (offset === 0 ? first : [first[9], record('11'), record('11'), record('12')]) :
        filters?.application_status === 'applied' ? [record('applied', 'applied')] : [],
    }));
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer 0');
    fireEvent.click(screen.getByRole('button', { name: 'Load more Not applied' }));
    await screen.findByText('Fictional Engineer 12');
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(12);
    expect(lane('Applied').getAllByRole('heading', { level: 5 })).toHaveLength(1);
    expect(history.mock.calls.filter((call) => call[2]?.application_status === 'applied')).toHaveLength(1);
  });

  it('isolates lane errors, retries the failed offset, and preserves existing cards', async () => {
    supply(Array.from({ length: 11 }, (_, index) => record(String(index))));
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer 0');
    history.mockRejectedValueOnce(new Error('private network details'));
    fireEvent.click(screen.getByRole('button', { name: 'Load more Not applied' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pathfinder could not load this lane');
    expect(screen.queryByText('private network details')).not.toBeInTheDocument();
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    expect(lane('Applied').getByText('No saved analyses in Applied.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Not applied' }));
    await screen.findByText('Fictional Engineer 10');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied' });
  });

  it('retries an initial lane failure independently', async () => {
    history.mockRejectedValueOnce(new ApiError('hidden', 503, 'persistence_unavailable'));
    render(<ApplicationPipelineBoard {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('persistence is not configured');
    expect(screen.getAllByText(/No saved analyses in/)).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Not applied' }));
    await screen.findByText('Fictional Engineer record');
    expect(history).toHaveBeenCalledTimes(8);
  });

  it.each(['initial', 'page'] as const)('rejects stale %s results after refresh', async (phase) => {
    const old = deferred<AnalysisHistoryResponse>();
    if (phase === 'initial') history.mockReturnValueOnce(old.promise);
    else supply(Array.from({ length: 11 }, (_, index) => record(String(index))));
    render(<ApplicationPipelineBoard {...props} />);
    if (phase === 'page') {
      await screen.findByText('Fictional Engineer 0');
      history.mockReturnValueOnce(old.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Load more Not applied' }));
    }
    supply([record('new')]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh board' }));
    await screen.findByText('Fictional Engineer new');
    await act(async () => old.resolve({ items: [record('stale')] }));
    expect(screen.queryByText('Fictional Engineer stale')).not.toBeInTheDocument();
    expect(screen.getByText('Fictional Engineer new')).toBeInTheDocument();
  });

  it('ignores stale failures after an external refresh and works in StrictMode', async () => {
    const old = deferred<AnalysisHistoryResponse>();
    history.mockReturnValueOnce(old.promise);
    const { rerender } = render(<StrictMode><ApplicationPipelineBoard {...props} /></StrictMode>);
    await screen.findByText('Fictional Engineer record');
    supply([record('new')]);
    rerender(<StrictMode><ApplicationPipelineBoard {...props} refreshKey={1} /></StrictMode>);
    await screen.findByText('Fictional Engineer new');
    await act(async () => old.reject(new Error('old')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('guards duplicate page clicks immediately', async () => {
    supply(Array.from({ length: 11 }, (_, index) => record(String(index))));
    render(<ApplicationPipelineBoard {...props} />);
    const button = await screen.findByRole('button', { name: 'Load more Not applied' });
    const page = deferred<AnalysisHistoryResponse>();
    history.mockReturnValueOnce(page.promise);
    act(() => { button.click(); button.click(); });
    expect(history).toHaveBeenCalledTimes(8);
    await act(async () => page.resolve({ items: [] }));
  });

  it('makes no request for the current status, selection alone, review, or cancellation', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    expect(screen.getByRole('button', { name: 'Review change' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' }), { target: { value: 'applied' } });
    expect(tracking).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    const confirmation = screen.getByRole('region', { name: 'Confirm application status change' });
    expect(confirmation).toHaveTextContent('Fictional Engineer record');
    expect(confirmation).toHaveTextContent('from Not applied to Applied?');
    expect(confirmation).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review change' })).toHaveFocus();
    fireEvent.change(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' }), { target: { value: 'not_applied' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(tracking).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('prechecks before PUT, guards duplicate submissions, waits for success, and reloads first pages', async () => {
    const precheck = deferred<AnalysisTracking>();
    const put = deferred<AnalysisTracking>();
    tracking.mockReturnValue(precheck.promise);
    update.mockReturnValue(put.promise);
    render(<ApplicationPipelineBoard {...props} />);
    await review();
    const button = screen.getByRole('button', { name: 'Confirm status change' });
    act(() => { button.click(); button.click(); });
    expect(tracking).toHaveBeenCalledExactlyOnceWith('record');
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Refresh board' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' })).toBeDisabled();
    expect(screen.queryByText(/Application status changed to/)).not.toBeInTheDocument();
    await act(async () => precheck.resolve({ analysis_id: 'record', application_status: 'not_applied', updated_at: null }));
    expect(update).toHaveBeenCalledExactlyOnceWith('record', 'applied');
    expect(onStatusChanged).not.toHaveBeenCalled();
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    supply([record('record', 'applied')]);
    await act(async () => put.resolve({ analysis_id: 'record', application_status: 'applied', updated_at: null }));
    expect(screen.getByRole('status')).toHaveTextContent('Application status changed to Applied.');
    expect(lane().queryByText('Fictional Engineer record')).not.toBeInTheDocument();
    expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Refresh board' })).toHaveFocus();
    expect(history).toHaveBeenCalledTimes(14);
    expect(history.mock.calls.every(([limit, offset]) => limit === 11 && offset === 0)).toBe(true);
  });

  it('detects stale persisted status without overwriting and requires a new review', async () => {
    tracking.mockResolvedValue({ analysis_id: 'record', application_status: 'interviewing', updated_at: null });
    render(<ApplicationPipelineBoard {...props} />);
    await review();
    supply([record('record', 'interviewing')]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status changed elsewhere');
    await waitFor(() => expect(lane('Interviewing').getByText('Fictional Engineer record')).toBeInTheDocument());
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirm status change' })).not.toBeInTheDocument();
    expect(onStatusChanged).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError('private', 404, 'analysis_not_found'), 'no longer exists'],
    [new ApiError('private', 503, 'persistence_unavailable'), 'persistence is not configured'],
    [new ApiError('private', 500), 'could not change'],
    [new TypeError('private'), 'could not change'],
  ])('handles precheck errors safely and permits cancellation: %s', async (failure, message) => {
    tracking.mockRejectedValue(failure);
    render(<ApplicationPipelineBoard {...props} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message as string);
    expect(update).not.toHaveBeenCalled();
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(screen.queryByText('private')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('permits retry after a failed PUT without optimistic movement or success', async () => {
    update.mockRejectedValueOnce(new Error('private'));
    render(<ApplicationPipelineBoard {...props} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not change');
    expect(screen.queryByText(/Application status changed to/)).not.toBeInTheDocument();
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(onStatusChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Applied.');
    expect(tracking).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('blocks other cards while confirmation is open and while mutation is pending', async () => {
    supply([record(), record('second', 'applied')]);
    render(<ApplicationPipelineBoard {...props} />);
    await review();
    expect(lane('Applied').getByRole('combobox')).toBeDisabled();
    expect(lane('Applied').getByRole('button', { name: 'Open details' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(lane('Applied').getByRole('combobox')).toBeEnabled();
  });

  it('keeps a pending confirmation retryable if History refreshes the board during an update', async () => {
    const put = deferred<AnalysisTracking>();
    update.mockReturnValueOnce(put.promise);
    const { rerender } = render(<ApplicationPipelineBoard {...props} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    rerender(<ApplicationPipelineBoard {...props} refreshKey={1} />);
    await act(async () => put.reject(new Error('private')));
    expect(screen.getByRole('alert')).toHaveTextContent('could not change');
    expect(screen.getByRole('button', { name: 'Confirm status change' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Applied.');
    expect(tracking).toHaveBeenCalledTimes(2);
  });

  it('ignores an older pending lane load after a successful mutation resets every lane', async () => {
    const old = deferred<AnalysisHistoryResponse>();
    history.mockImplementationOnce(async () => ({ items: [record()] })).mockReturnValueOnce(old.promise);
    render(<ApplicationPipelineBoard {...props} />);
    await review();
    supply([record('record', 'applied')]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Applied.');
    await waitFor(() => expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument());
    await act(async () => old.resolve({ items: [record('stale', 'applied')] }));
    expect(lane('Applied').queryByText('Fictional Engineer stale')).not.toBeInTheDocument();
    expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument();
  });

  it('resets expanded lane offsets to first pages after a successful update', async () => {
    supply([record(), ...Array.from({ length: 11 }, (_, index) => record(String(index)))]);
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more Not applied' }));
    await screen.findByText('Fictional Engineer 10');
    fireEvent.change(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' }), { target: { value: 'applied' } });
    fireEvent.click(within(screen.getByText('Fictional Engineer record').closest('li')!).getByRole('button', { name: 'Review change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Applied.');
    await waitFor(() => expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10));
    expect(history.mock.calls.slice(-7).every(([, offset]) => offset === 0)).toBe(true);
  });

  it('disables opening details while an existing detail request is pending', async () => {
    render(<ApplicationPipelineBoard {...props} opening />);
    expect(await screen.findByRole('button', { name: 'Open details' })).toBeDisabled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each(['load', 'precheck', 'put'] as const)('ignores completion after unmount during %s', async (phase) => {
    const pendingLoad = deferred<AnalysisHistoryResponse>();
    const pendingTracking = deferred<AnalysisTracking>();
    if (phase === 'load') history.mockReturnValue(pendingLoad.promise);
    if (phase === 'precheck') tracking.mockReturnValue(pendingTracking.promise);
    if (phase === 'put') update.mockReturnValue(pendingTracking.promise);
    const { unmount } = render(<ApplicationPipelineBoard {...props} />);
    if (phase !== 'load') {
      await review();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
      if (phase === 'put') await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    }
    unmount();
    await act(async () => {
      pendingLoad.resolve({ items: [record('late')] });
      pendingTracking.resolve({ analysis_id: 'record', application_status: 'not_applied', updated_at: null });
    });
    expect(onStatusChanged).not.toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(7);
    if (phase !== 'put') expect(update).not.toHaveBeenCalled();
  });

  it('does not use browser storage, cookies, external requests, or automatic mutations', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(Document.prototype, 'cookie', 'set');
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh board' }));
    await screen.findByText('Fictional Engineer record');
    expect(local).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(tracking).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    local.mockRestore(); cookie.mockRestore(); fetch.mockRestore();
  });
});

describe('native board dragging', () => {
  it('exposes only a dedicated draggable handle with instructions and a meaningful keyboard action', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const handle = await screen.findByRole('button', { name: 'Drag to change status for Fictional Engineer record' });
    expect(handle).toHaveAttribute('draggable', 'true');
    expect(handle).toHaveAccessibleDescription(/On keyboard or touch devices, choose a new status/);
    expect(handle.closest('li')).not.toHaveAttribute('draggable');
    expect(screen.getByRole('button', { name: 'Open details' })).not.toHaveAttribute('draggable');
    expect(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' })).not.toHaveAttribute('draggable');
    fireEvent.click(handle);
    expect(screen.getByRole('combobox', { name: 'New status for Fictional Engineer record' })).toHaveFocus();
    expect(handle.querySelector('button, select, input, a')).toBeNull();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    await review();
    expect(screen.getByRole('region', { name: 'Confirm application status change' })).toHaveFocus();
  });

  it.each(applicationStatuses)('drops from a different lane into $label using the shared confirmation', async ({ value, label }) => {
    const source = value === 'not_applied' ? 'applied' : 'not_applied';
    supply([record('record', source)]);
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer, handle } = await startDrag();
    const sourceLabel = applicationStatuses.find(({ value }) => value === source)!.label;
    expect(handle.closest('li')).toHaveClass('pipeline-card-dragging');
    expect(screen.getByText('Dragging this card')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: sourceLabel })).not.toHaveClass('pipeline-lane-drop-target');
    const destination = screen.getByRole('region', { name: label });
    expect(destination).toHaveClass('pipeline-lane-drop-target');
    fireEvent.dragEnter(destination, { dataTransfer });
    fireEvent.dragOver(destination, { dataTransfer });
    expect(destination).toHaveClass('pipeline-lane-drag-over');
    expect(within(destination).getByText('Drop to review status change')).toBeInTheDocument();
    expect(dataTransfer.dropEffect).toBe('move');
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    dropIn(label, dataTransfer);
    const confirmation = screen.getByRole('region', { name: 'Confirm application status change' });
    expect(confirmation).toHaveTextContent(`from ${sourceLabel} to ${label}?`);
    expect(confirmation).toHaveTextContent('ID: record');
    expect(confirmation).toHaveFocus();
    expect(screen.queryByText('Dragging this card')).not.toBeInTheDocument();
    expect(document.querySelector('.pipeline-lane-drag-over, .pipeline-lane-drop-target, .pipeline-card-dragging')).toBeNull();
    expect(lane(sourceLabel).getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(lane(label).queryByText('Fictional Engineer record')).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(7);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handle).toHaveFocus();
  });

  it('uses only an opaque custom marker in DataTransfer and does not transfer record data', async () => {
    supply([{ ...record(), company_name: 'Private fictional company', score: 73, follow_up_on: '2026-10-20' }]);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(Document.prototype, 'cookie', 'set');
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    expect(dataTransfer.types).toEqual(['application/x-pathfinder-status-drag']);
    expect(dataTransfer.setData).toHaveBeenCalledTimes(1);
    const marker = dataTransfer.getData(dataTransfer.types[0]);
    expect(marker).toMatch(/^[0-9a-f]{32}$/);
    expect(marker).not.toContain('record');
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(storage).not.toHaveBeenCalled(); expect(cookie).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled(); expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    storage.mockRestore(); cookie.mockRestore();
  });

  it('treats source-lane drops as no-ops without requests or refreshing', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    fireEvent.dragOver(screen.getByRole('region', { name: 'Not applied' }), { dataTransfer });
    expect(dataTransfer.dropEffect).toBe('none');
    dropIn('Not applied', dataTransfer);
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dragging this card')).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(history).toHaveBeenCalledTimes(7);
  });

  it.each<Record<string, string>>([
    { 'text/plain': 'record' },
    { Files: 'record.pdf' },
    { 'application/x-other-app': 'record' },
    { 'application/x-pathfinder-status-drag': 'unknown' },
  ])('ignores external and unknown data without an internal session: %j', async (payload) => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    const dataTransfer = dragData(payload);
    fireEvent.dragEnter(screen.getByRole('region', { name: 'Applied' }), { dataTransfer });
    fireEvent.dragOver(screen.getByRole('region', { name: 'Applied' }), { dataTransfer });
    dropIn('Applied', dataTransfer);
    expect(document.querySelector('.pipeline-lane-drag-over')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('rejects a forged marker even during an internal drag', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await startDrag();
    dropIn('Applied', dragData({ 'application/x-pathfinder-status-drag': 'record' }));
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Dragging this card')).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('does not trust data that claims a different record, source, or unknown target status', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    // Destination status comes only from the established lane, never payload data.
    dataTransfer.setData('text/plain', JSON.stringify({ analysis_id: 'other', from: 'offer', to: 'unknown' }));
    dropIn('Applied', dataTransfer);
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it.each(['end', 'escape'] as const)('clears highlights and invalidates drops after drag %s', async (reason) => {
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer, handle } = await startDrag();
    fireEvent.dragOver(screen.getByRole('region', { name: 'Applied' }), { dataTransfer });
    if (reason === 'end') fireEvent.dragEnd(handle, { dataTransfer });
    else fireEvent.keyDown(handle, { key: 'Escape' });
    expect(document.querySelector('.pipeline-card-dragging, .pipeline-lane-drop-target, .pipeline-lane-drag-over')).toBeNull();
    dropIn('Applied', dataTransfer);
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('handles repeated nested drag enter/leave events without stuck hover styling', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    const destination = screen.getByRole('region', { name: 'Applied' });
    const heading = within(destination).getByRole('heading');
    fireEvent.dragEnter(destination, { dataTransfer });
    fireEvent.dragEnter(heading, { dataTransfer });
    leaveLane(destination, heading, dataTransfer);
    expect(destination).toHaveClass('pipeline-lane-drag-over');
    leaveLane(heading, destination, dataTransfer);
    expect(destination).toHaveClass('pipeline-lane-drag-over');
    leaveLane(destination, document.body, dataTransfer);
    expect(destination).not.toHaveClass('pipeline-lane-drag-over');
    fireEvent.dragOver(destination, { dataTransfer });
    expect(destination).toHaveClass('pipeline-lane-drag-over');
    dropIn('Applied', dataTransfer);
    expect(destination).not.toHaveClass('pipeline-lane-drag-over');
  });

  it.each(['button', 'external'] as const)('invalidates dragging on %s refresh', async (method) => {
    const { rerender } = render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'Refresh board' }));
    else rerender(<ApplicationPipelineBoard {...props} refreshKey={1} />);
    await screen.findByText('Fictional Engineer record');
    expect(document.querySelector('.pipeline-card-dragging, .pipeline-lane-drop-target')).toBeNull();
    dropIn('Applied', dataTransfer);
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('discards an internal drag during detail loading and rejects it when navigation finishes', async () => {
    const { rerender } = render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    rerender(<ApplicationPipelineBoard {...props} opening />);
    expect(screen.getByRole('button', { name: /Drag to change status for/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Drag to change status for/ })).toHaveAttribute('draggable', 'false');
    dropIn('Applied', dataTransfer);
    rerender(<ApplicationPipelineBoard {...props} opening={false} />);
    dropIn('Applied', dataTransfer);
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('discards sessions on unmount and ignores old payloads in a newly mounted board', async () => {
    const { unmount } = render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer, handle } = await startDrag();
    const destination = screen.getByRole('region', { name: 'Applied' });
    unmount();
    fireEvent.drop(destination, { dataTransfer });
    fireEvent.dragEnd(handle, { dataTransfer });
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    dropIn('Applied', dataTransfer);
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('cancels to the initiating handle and permits a new deliberate drag without duplicate confirmations', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const first = await startDrag();
    dropIn('Applied', first.dataTransfer);
    dropIn('Offer', first.dataTransfer);
    expect(screen.getAllByRole('region', { name: 'Confirm application status change' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Confirm application status change' })).toHaveTextContent('to Applied?');
    expect(first.handle).toBeDisabled();
    const rejected = dragData();
    fireEvent.dragStart(first.handle, { dataTransfer: rejected });
    expect(rejected.setData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(first.handle).toHaveFocus();
    const second = await startDrag();
    dropIn('Offer', second.dataTransfer);
    expect(screen.getByRole('region', { name: 'Confirm application status change' })).toHaveTextContent('to Offer?');
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('reuses precheck, duplicate guards, success refresh, lane membership, and stable focus after confirmation', async () => {
    const precheck = deferred<AnalysisTracking>();
    const put = deferred<AnalysisTracking>();
    tracking.mockReturnValueOnce(precheck.promise); update.mockReturnValueOnce(put.promise);
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer, handle } = await startDrag();
    dropIn('Applied', dataTransfer);
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Confirm status change' });
    act(() => { confirm.click(); confirm.click(); });
    expect(tracking).toHaveBeenCalledExactlyOnceWith('record');
    expect(update).not.toHaveBeenCalled();
    expect(handle).toBeDisabled(); expect(handle).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(handle, { dataTransfer });
    dropIn('Offer', dataTransfer);
    expect(screen.getByRole('region', { name: 'Confirm application status change' })).toHaveTextContent('to Applied?');
    await act(async () => precheck.resolve({ analysis_id: 'record', application_status: 'not_applied', updated_at: null }));
    expect(update).toHaveBeenCalledExactlyOnceWith('record', 'applied');
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(screen.queryByText(/Application status changed to/)).not.toBeInTheDocument();
    supply([record('record', 'applied')]);
    await act(async () => put.resolve({ analysis_id: 'record', application_status: 'applied', updated_at: null }));
    expect(screen.getByRole('status')).toHaveTextContent('Application status changed to Applied.');
    expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(lane().queryByText('Fictional Engineer record')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh board' })).toHaveFocus();
    expect(history).toHaveBeenCalledTimes(14); expect(onStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('blocks stale dragged source statuses, reloads, and requires a new action', async () => {
    tracking.mockResolvedValue({ analysis_id: 'record', application_status: 'offer', updated_at: null });
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    dropIn('Applied', dataTransfer);
    supply([record('record', 'offer')]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('status changed elsewhere');
    expect(update).not.toHaveBeenCalled(); expect(onStatusChanged).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Refresh board' })).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Confirm application status change' })).not.toBeInTheDocument();
    await waitFor(() => expect(lane('Offer').getByText('Fictional Engineer record')).toBeInTheDocument());
  });

  it.each(['precheck', 'put'] as const)('preserves original cards on failed %s and permits retry without optimistic success', async (phase) => {
    if (phase === 'precheck') tracking.mockRejectedValueOnce(new Error('private'));
    else update.mockRejectedValueOnce(new Error('private'));
    render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    dropIn('Applied', dataTransfer);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not change');
    expect(screen.queryByText('private')).not.toBeInTheDocument();
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(screen.queryByText(/Application status changed to/)).not.toBeInTheDocument();
    expect(document.querySelector('.pipeline-card-dragging, .pipeline-lane-drag-over')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await screen.findByText('Application status changed to Applied.');
    expect(tracking).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(phase === 'precheck' ? 1 : 2);
  });

  it('falls back to Refresh board on cancel when a refresh removed the original handle', async () => {
    const put = deferred<AnalysisTracking>();
    update.mockReturnValueOnce(put.promise);
    const { rerender } = render(<ApplicationPipelineBoard {...props} />);
    const { dataTransfer } = await startDrag();
    dropIn('Applied', dataTransfer);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm status change' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    supply([]);
    rerender(<ApplicationPipelineBoard {...props} refreshKey={1} />);
    await act(async () => put.reject(new Error('private')));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Refresh board' })).toHaveFocus();
  });

  it('allows dragging paginated cards into independently loading lanes without changing pagination', async () => {
    const pendingLane = deferred<AnalysisHistoryResponse>();
    supply(Array.from({ length: 12 }, (_, index) => record(String(index))));
    const normal = history.getMockImplementation()!;
    history.mockImplementation((limit, offset, filters) => filters?.application_status === 'applied' ? pendingLane.promise : normal(limit, offset, filters));
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more Not applied' }));
    const { dataTransfer } = await startDrag('11');
    dropIn('Applied', dataTransfer);
    expect(screen.getByRole('region', { name: 'Confirm application status change' })).toHaveTextContent('Fictional Engineer 11');
    expect(history).toHaveBeenCalledTimes(8);
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied' });
    expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    await act(async () => pendingLane.resolve({ items: [] }));
  });
});


const noteValue = (content: string | null = null, id = 'record'): AnalysisNote => ({ analysis_id: id, content, updated_at: null });
async function openNote(index = 0) {
  fireEvent.click((await screen.findAllByRole('button', { name: 'Edit note' }))[index]);
  return await screen.findByRole('textbox', { name: 'Application note' });
}

describe('Kanban quick notes', () => {
  it.each(['note', 'follow-up'].flatMap((mode) => ['switch', 'close'].map((action) => ({ mode, action }))))('rejects a stale $mode save in the same tick as $action', async ({ mode, action }) => {
    render(<ApplicationPipelineBoard {...props} />);
    if (mode === 'note') fireEvent.change(await openNote(), { target: { value: 'draft' } });
    else fireEvent.change(await openFollowUp(), { target: { value: '2026-10-20' } });
    const save = screen.getByText(mode === 'note' ? 'Save note' : 'Save follow-up');
    const next = screen.getByText(action === 'close' ? 'Close editing' : mode === 'note' ? 'Edit follow-up' : 'Edit note');
    act(() => { next.click(); save.click(); });
    expect(updateAnalysisNote).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
    if (action === 'switch') {
      if (mode === 'note') await screen.findByLabelText('Follow-up date');
      else await screen.findByRole('textbox', { name: 'Application note' });
      expect(screen.getByText('Close editing')).toBeEnabled();
    } else expect(screen.queryByText('Close editing')).not.toBeInTheDocument();
  });

  it('keeps lanes and follow-up editing functional after note loading fails and retries only the note', async () => {
    vi.mocked(getAnalysisNote).mockRejectedValueOnce(new Error('PRIVATE'));
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.click(await screen.findByText('Edit note'));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load the application note');
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(screen.getByText('Edit follow-up')).toBeEnabled();
    expect(screen.getByText('Open details')).toBeEnabled();
    fireEvent.click(screen.getByText('Retry note'));
    expect(await screen.findByRole('textbox', { name: 'Application note' })).toHaveValue('');
    expect(history).toHaveBeenCalledTimes(7);
    expect(getAnalysisNote).toHaveBeenCalledTimes(2);
  });

  it('offers lazy selected-note access across all seven lanes and identifies the selected job and company', async () => {
    supply(applicationStatuses.map(({ value }) => ({ ...record(value, value), company_name: 'Fictional Labs' })));
    render(<ApplicationPipelineBoard {...props} />);
    expect(await screen.findAllByText('Edit note')).toHaveLength(7);
    expect(getAnalysisNote).not.toHaveBeenCalled();
    for (const { value, label } of applicationStatuses) {
      fireEvent.click(lane(label).getByText('Edit note'));
      expect(await screen.findByRole('textbox', { name: 'Application note' })).toHaveValue('');
      expect(screen.getByRole('region', { name: 'Quick application note' })).toHaveTextContent(`Fictional Engineer ${value} \u2014 Fictional Labs`);
      expect(screen.getByRole('heading', { name: 'Quick application note' })).toHaveFocus();
      expect(screen.getByText('No application note saved.')).toBeInTheDocument();
      expect(getAnalysisNote).toHaveBeenLastCalledWith(value);
      fireEvent.click(screen.getByText('Close editing'));
      expect(lane(label).getByText('Edit note')).toHaveFocus();
    }
    expect(getAnalysisNote).toHaveBeenCalledTimes(7);
    expect(history).toHaveBeenCalledTimes(7);
    expect(onOpen).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('loads persisted content, discards drafts on close or mode switch, and reopens authoritatively', async () => {
    vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('persisted'));
    render(<ApplicationPipelineBoard {...props} />);
    const input = await openNote();
    expect(input).toHaveValue('persisted');
    expect(screen.getByRole('region', { name: 'Quick application note' })).toHaveTextContent('Company not supplied');
    fireEvent.change(input, { target: { value: 'draft' } });
    await openFollowUp();
    expect(screen.queryByRole('textbox', { name: 'Application note' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Close editing')).toHaveLength(1);
    await openNote();
    expect(screen.queryByLabelText('Follow-up date')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Application note' }), { target: { value: 'discard' } });
    fireEvent.click(screen.getByText('Close editing'));
    vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('changed elsewhere'));
    expect(await openNote()).toHaveValue('changed elsewhere');
    expect(updateAnalysisNote).not.toHaveBeenCalled(); expect(clearAnalysisNote).not.toHaveBeenCalled();
  });

  it.each(['save', 'clear'])('coordinates a pending %s immediately and preserves loaded pages without summary refresh', async (action) => {
    supply(Array.from({ length: 12 }, (_, i) => record(String(i))));
    vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('persisted', '11'));
    const put = deferred<AnalysisNote>(); const remove = deferred<void>();
    vi.mocked(updateAnalysisNote).mockReturnValue(put.promise);
    vi.mocked(clearAnalysisNote).mockReturnValue(remove.promise);
    const mutating = vi.fn(); const followUpUpdated = vi.fn();
    render(<ApplicationPipelineBoard {...props} onQuickEditorMutatingChange={mutating} onFollowUpUpdated={followUpUpdated} />);
    fireEvent.click(await screen.findByText('Load more Not applied'));
    await screen.findByText('Fictional Engineer 11');
    const input = await openNote(11);
    const drag = await startDrag('11');
    let button: HTMLElement;
    if (action === 'save') {
      fireEvent.change(input, { target: { value: '  exact\n<script>text</script>  ' } });
      button = screen.getByText('Save note');
    } else {
      fireEvent.click(screen.getByText('Clear note'));
      button = within(screen.getByRole('alertdialog')).getByText('Clear note');
    }
    const other = screen.getAllByText('Edit follow-up')[0];
    const close = screen.getByText('Close editing');
    const open = screen.getAllByText('Open details')[0];
    act(() => { button.click(); button.click(); other.click(); close.click(); open.click(); });
    expect(action === 'save' ? updateAnalysisNote : clearAnalysisNote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Application note saved.')).not.toBeInTheDocument();
    expect(screen.queryByText('Application note cleared.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Follow-up date')).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    dropIn('Applied', drag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument();
    const rejected = dragData(); fireEvent.dragStart(drag.handle, { dataTransfer: rejected });
    expect(rejected.setData).not.toHaveBeenCalled();
    for (const name of ['Edit note', 'Edit follow-up', 'Open details', 'Review change']) {
      screen.getAllByRole('button', { name }).forEach((control) => expect(control).toBeDisabled());
    }
    expect(close).toBeDisabled(); expect(screen.getByText('Refresh board')).toBeDisabled();
    await act(async () => { if (action === 'save') put.resolve(noteValue('  exact\n<script>text</script>  ', '11')); else remove.resolve(); });
    expect(screen.getByText(action === 'save' ? 'Application note saved.' : 'Application note cleared.')).toBeInTheDocument();
    expect(input).toHaveValue(action === 'save' ? '  exact\n<script>text</script>  ' : '');
    expect(mutating.mock.calls).toEqual([[true], [false]]);
    expect(history).toHaveBeenCalledTimes(8); expect(followUpUpdated).not.toHaveBeenCalled();
    expect(lane().getByText('Fictional Engineer 11')).toBeInTheDocument();
    expect(getAnalysisNote).toHaveBeenCalledOnce();
  });

  it('preserves a note draft during status confirmation and retains status safeguards', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.change(await openNote(), { target: { value: 'draft' } });
    await review();
    expect(screen.getByText('Save note')).toBeDisabled();
    expect(screen.getByText('Edit note')).toBeDisabled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('draft');
    fireEvent.click(screen.getByText('Close editing'));
    const drag = await startDrag(); dropIn('Applied', drag.dataTransfer);
    fireEvent.click(screen.getByText('Confirm status change'));
    await screen.findByText('Application status changed to Applied.');
    expect(update).toHaveBeenCalledExactlyOnceWith('record', 'applied');
  });

  it('refreshes authoritative notes when pristine, preserves unsaved drafts on refresh, and restores fallback focus', async () => {
    vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('original'));
    render(<ApplicationPipelineBoard {...props} />);
    await openNote();
    vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('elsewhere'));
    fireEvent.click(screen.getByText('Refresh board'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('elsewhere'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Application note' }), { target: { value: 'draft' } });
    supply([]);
    fireEvent.click(screen.getByText('Refresh board'));
    await screen.findByText('No saved analyses in Not applied.');
    expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('draft');
    expect(getAnalysisNote).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText('Close editing'));
    expect(screen.getByText('Refresh board')).toHaveFocus();
  });

  it.each(['resolve', 'reject'])('ignores a stale selected-note GET %s while keeping lanes usable', async (outcome) => {
    supply([record(), record('two')]);
    const old = deferred<AnalysisNote>();
    vi.mocked(getAnalysisNote).mockReturnValueOnce(old.promise).mockResolvedValueOnce(noteValue('second', 'two'));
    render(<ApplicationPipelineBoard {...props} />);
    fireEvent.click((await screen.findAllByText('Edit note'))[0]);
    fireEvent.click(screen.getAllByText('Edit note')[1]);
    await screen.findByRole('textbox', { name: 'Application note' });
    await act(async () => { if (outcome === 'resolve') old.resolve(noteValue('stale')); else old.reject(new Error('PRIVATE')); });
    expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('second');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('Open details')[0]).toBeEnabled();
  });
});


describe('Kanban match score filters', () => {
  it.each([
    ['', '', {}], ['0', '', { min_score: 0 }], ['', '0', { max_score: 0 }],
    ['', '100', { max_score: 100 }], ['70', '', { min_score: 70 }], ['', '85.5', { max_score: 85.5 }],
    ['0', '0', { min_score: 0, max_score: 0 }], ['100', '100', { min_score: 100, max_score: 100 }],
    ['0', '100', { min_score: 0, max_score: 100 }], ['72.25', '87.75', { min_score: 72.25, max_score: 87.75 }],
  ] as const)('submits %s / %s explicitly to all lanes and keeps server metadata authoritative', async (min, max, expected) => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    for (const input of [minScore(), maxScore()]) {
      expect(input).toHaveAttribute('type', 'number'); expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '100'); expect(input).toHaveAttribute('step', 'any');
      expect(input).toHaveAttribute('aria-describedby', 'board-score-help');
    }
    draftScoreFilters(min, max);
    expect(history).toHaveBeenCalledTimes(7);
    expect(screen.getByText('No board match score filters applied.')).toBeInTheDocument();
    const input = minScore(); input.focus();
    // Enter's native action submits this form.
    fireEvent.submit(input.closest('form')!);
    await screen.findByText('Fictional Engineer record');
    expect(input).toHaveFocus();
    const count = min || max ? 14 : 7;
    expect(history).toHaveBeenCalledTimes(count);
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, ...expected });
    // Even if a server/mock returns an unscored row, the browser must not fabricate or hide it.
    expect(lane().getByText('Not scored')).toBeInTheDocument();
    if (min || max) expect(within(scoreForm()).getByRole('status')).toHaveTextContent(`minimum ${min ? `${Number(min)}%` : 'not set'}; maximum ${max ? `${Number(max)}%` : 'not set'}`);
    fireEvent.click(screen.getByText('Apply score filters')); expect(history).toHaveBeenCalledTimes(count);
    expect(update).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled();
  });

  it.each([['-1', '100'], ['0', '100.1'], ['90', '80']])('rejects invalid %s / %s without changing applied cards, then allows correction and clear', async (min, max) => {
    render(<ApplicationPipelineBoard {...props} />); applyScoreFilters('70', '95');
    await screen.findByText('Fictional Engineer record');
    applyScoreFilters(min, max);
    expect(screen.getByRole('alert')).toHaveTextContent(/match score/);
    expect(minScore()).toHaveAttribute('aria-invalid', 'true'); expect(maxScore()).toHaveAttribute('aria-invalid', 'true');
    expect(minScore()).toHaveAttribute('aria-describedby', 'board-score-help board-score-error');
    expect(within(scoreForm()).getByRole('status')).toHaveTextContent('minimum 70%; maximum 95%');
    expect(lane().getByText('Fictional Engineer record')).toBeInTheDocument(); expect(history).toHaveBeenCalledTimes(14);
    applyScoreFilters('72.25', '87.75'); await screen.findByText('Fictional Engineer record');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(history).toHaveBeenCalledTimes(21);
    fireEvent.click(screen.getByText('Clear score filters')); await screen.findByText('Fictional Engineer record');
    expect(minScore()).toHaveValue(null); expect(maxScore()).toHaveValue(null);
    expect(history).toHaveBeenCalledTimes(28);
    draftScoreFilters('80', '90'); fireEvent.click(screen.getByText('Clear score filters'));
    expect(history).toHaveBeenCalledTimes(28); expect(minScore()).toHaveValue(null);
  });

  it('rejects browser bad/partial input even when its value is empty, and clears the error without reload', async () => {
    render(<ApplicationPipelineBoard {...props} />); await screen.findByText('Fictional Engineer record');
    const input = minScore();
    Object.defineProperty(input, 'validity', { configurable: true, value: { valid: false, badInput: true } });
    fireEvent.submit(scoreForm());
    expect(screen.getByRole('alert')).toHaveTextContent('complete numeric'); expect(history).toHaveBeenCalledTimes(7);
    fireEvent.click(screen.getByText('Clear score filters'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(input).not.toHaveAttribute('aria-invalid');
    expect(history).toHaveBeenCalledTimes(7);
  });

  it('composes each applied form synchronously while preserving unrelated drafts and independent clears', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    searchBoard('Engineer'); applyFollowUpFilters('yes', '2026-10-01', '2026-10-31');
    fireEvent.change(searchInput(), { target: { value: 'unsent search' } }); draftFollowUpFilters('no');
    applyScoreFilters('0', '100');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Engineer', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31', min_score: 0, max_score: 100 });
    expect(searchInput()).toHaveValue('unsent search'); expect(screen.getByLabelText('Board follow-up status')).toHaveValue('no');
    draftScoreFilters('75', '90'); searchBoard('New'); applyFollowUpFilters('no');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'New', has_follow_up: false, min_score: 0, max_score: 100 });
    expect(minScore()).toHaveValue(75); expect(maxScore()).toHaveValue(90);
    fireEvent.click(screen.getByText('Clear search'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', has_follow_up: false, min_score: 0, max_score: 100 });
    fireEvent.click(screen.getByText('Clear follow-up filters'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', min_score: 0, max_score: 100 });
    searchBoard('Engineer'); applyFollowUpFilters('yes');
    fireEvent.click(screen.getByText('Clear score filters'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Engineer', has_follow_up: true });
    await screen.findByText('Fictional Engineer record');
  });

  it.each(['initial', 'page'].flatMap((phase) => ['resolve', 'reject'].map((outcome) => ({ phase, outcome }))))('ignores stale score $phase $outcome after range B succeeds', async ({ phase, outcome }) => {
    const old = deferred<AnalysisHistoryResponse>();
    const rows = Array.from({ length: 12 }, (_, i) => record(String(i)));
    history.mockImplementation(async (limit, offset, filters) => {
      if (filters?.min_score === 10 && (phase === 'initial' || offset === 10)) return old.promise;
      return { items: filters?.application_status === 'not_applied' ? rows.slice(offset ?? 0, (offset ?? 0) + (limit ?? 11)) : [] };
    });
    render(<ApplicationPipelineBoard {...props} />); applyScoreFilters('10');
    if (phase === 'page') fireEvent.click(await screen.findByText('Load more Not applied'));
    applyScoreFilters('20', '90'); await screen.findByText('Fictional Engineer 0');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('STALE')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer STALE')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    fireEvent.click(screen.getByText('Load more Not applied')); await screen.findByText('Fictional Engineer 11');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied', min_score: 20, max_score: 90 });
  });

  it('uses score criteria on independent failed-lane retry and preserves server order and precision', async () => {
    const rows = [{ ...record('z'), score: 87.751234567 }, { ...record('a'), score: 72.251234567 }];
    history.mockImplementation(async (_limit, _offset, filters) => {
      if (filters?.min_score !== undefined && filters.application_status === 'applied') throw new Error('PRIVATE');
      return { items: filters?.application_status === 'not_applied' ? rows : [] };
    });
    render(<ApplicationPipelineBoard {...props} />); applyScoreFilters('72.251234567', '87.751234567');
    expect(await lane('Applied').findByRole('alert')).not.toHaveTextContent('PRIVATE');
    expect(lane().getAllByRole('heading', { level: 5 }).map((node) => node.textContent)).toEqual(rows.map((row) => row.job_title));
    expect(lane().getByText('87.751234567% match')).toBeInTheDocument();
    expect(lane('Offer').getByText('No matching saved analyses in Offer.')).toBeInTheDocument();
    draftScoreFilters('0', '100'); history.mockResolvedValueOnce({ items: [record('recovered', 'applied')] });
    fireEvent.click(screen.getByText('Retry Applied')); await screen.findByText('Fictional Engineer recovered');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'applied', min_score: 72.251234567, max_score: 87.751234567 });
    const count = history.mock.calls.length;
    applyScoreFilters('7.2251234567e1', '87.7512345670');
    expect(history).toHaveBeenCalledTimes(count);
  });

  it('handles same-tick Apply/Clear and cross-form updates, invalidating active dragging', async () => {
    render(<ApplicationPipelineBoard {...props} />); const drag = await startDrag();
    draftScoreFilters('0', '100'); draftFollowUpFilters('yes'); fireEvent.change(searchInput(), { target: { value: 'Engineer' } });
    const apply = screen.getByText('Apply score filters'); const clear = screen.getByText('Clear score filters');
    act(() => { apply.click(); apply.click(); clear.click(); clear.click(); apply.click(); });
    expect(history).toHaveBeenCalledTimes(21); expect(minScore()).toHaveValue(null);
    draftScoreFilters('72.25', '87.75');
    act(() => { apply.click(); screen.getByText('Apply search').click(); within(followUpForm()).getByText('Apply filters').click(); });
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Engineer', has_follow_up: true, min_score: 72.25, max_score: 87.75 });
    await screen.findByText('Fictional Engineer record'); dropIn('Applied', drag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument(); expect(document.querySelector('.pipeline-card-dragging')).toBeNull();
  });
});


describe('Kanban AI enrichment filter', () => {
  it.each([
    { selection: 'all', label: 'All analyses', expected: {} },
    { selection: 'yes', label: 'With AI enrichment', expected: { ai_enriched: true } },
    { selection: 'no', label: 'Without AI enrichment', expected: { ai_enriched: false } },
  ] as const)('submits $label to every lane only on Apply/Enter, without redundant loads or writes', async ({ selection, label, expected }) => {
    render(<ApplicationPipelineBoard {...props} />); await screen.findByText('Fictional Engineer record');
    const input = aiInput(); expect(input.tagName).toBe('SELECT'); expect(input).toHaveValue('all');
    expect(within(input).getAllByRole('option').map((option) => option.textContent)).toEqual(['All analyses', 'With AI enrichment', 'Without AI enrichment']);
    expect(input).toHaveAttribute('aria-describedby', 'board-ai-help'); input.focus();
    draftAiFilter(selection); expect(history).toHaveBeenCalledTimes(7);
    expect(screen.getByText('Applied board AI enrichment: All analyses.')).toBeInTheDocument();
    // Native Enter submits the select's form.
    fireEvent.submit(aiForm()); await screen.findByText('Fictional Engineer record');
    expect(input).toHaveFocus(); expect(screen.getByText(`Applied board AI enrichment: ${label}.`)).toHaveAttribute('aria-live', 'polite');
    const count = selection === 'all' ? 7 : 14;
    expect(history).toHaveBeenCalledTimes(count);
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, ...expected });
    fireEvent.click(screen.getByText('Apply AI filter')); expect(history).toHaveBeenCalledTimes(count);
    // Browser renders authoritative server rows even if metadata differs from requested criteria.
    expect(lane().getByText('Not scored')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear AI filter')); await screen.findByText('Fictional Engineer record');
    const clearedCount = selection === 'all' ? count : count + 7;
    expect(history).toHaveBeenCalledTimes(clearedCount); expect(input).toHaveValue('all');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn' });
    draftAiFilter('no'); fireEvent.click(screen.getByText('Clear AI filter'));
    expect(input).toHaveValue('all'); expect(history).toHaveBeenCalledTimes(clearedCount);
    expect(analyzeCandidateJob).not.toHaveBeenCalled(); expect(tracking).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(getAnalysisNote).not.toHaveBeenCalled(); expect(getAnalysisFollowUp).not.toHaveBeenCalled();
    expect(updateAnalysisNote).not.toHaveBeenCalled(); expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
  });

  it.each(['yes', 'no'] as const)('composes applied %s with every filter, preserves drafts, and clears independently', async (selection) => {
    render(<ApplicationPipelineBoard {...props} />); searchBoard('Engineer');
    applyFollowUpFilters(selection); applyScoreFilters('0', '100');
    fireEvent.change(searchInput(), { target: { value: 'unsent query' } }); draftFollowUpFilters('all'); draftScoreFilters('80', '90');
    applyAiFilter(selection);
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Engineer', has_follow_up: selection === 'yes', min_score: 0, max_score: 100, ai_enriched: selection === 'yes' });
    expect(searchInput()).toHaveValue('unsent query'); expect(minScore()).toHaveValue(80); expect(screen.getByLabelText('Board follow-up status')).toHaveValue('all');
    draftAiFilter('all'); searchBoard('Changed'); applyFollowUpFilters('yes', '2026-10-01', '2026-10-31'); applyScoreFilters('72.25', '87.75');
    expect(aiInput()).toHaveValue('all');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Changed', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31', min_score: 72.25, max_score: 87.75, ai_enriched: selection === 'yes' });
    fireEvent.click(screen.getByText('Clear AI filter'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Changed', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31', min_score: 72.25, max_score: 87.75 });
    applyAiFilter(selection);
    for (const name of ['Clear search', 'Clear follow-up filters', 'Clear score filters']) {
      fireEvent.click(screen.getByText(name));
      expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && filters?.ai_enriched === (selection === 'yes'))).toBe(true);
    }
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', ai_enriched: selection === 'yes' });
    await screen.findByText('Fictional Engineer record');
  });

  it.each(['initial', 'page'].flatMap((phase) => ['resolve', 'reject'].map((outcome) => ({ phase, outcome }))))('ignores old AI $phase $outcome after Without succeeds, preserving independent loading and retry', async ({ phase, outcome }) => {
    const old = deferred<AnalysisHistoryResponse>(); const current = deferred<AnalysisHistoryResponse>();
    const rows = Array.from({ length: 12 }, (_, i) => record(String(i)));
    history.mockImplementation(async (limit, offset, filters) => {
      if (filters?.ai_enriched === true && (phase === 'initial' || offset === 10)) return old.promise;
      if (filters?.ai_enriched === false && filters.application_status === 'applied') return current.promise;
      return { items: filters?.application_status === 'not_applied' ? rows.slice(offset ?? 0, (offset ?? 0) + (limit ?? 11)) : [] };
    });
    render(<ApplicationPipelineBoard {...props} />); applyAiFilter('yes');
    if (phase === 'page') fireEvent.click(await screen.findByText('Load more Not applied'));
    applyAiFilter('no'); await screen.findByText('Fictional Engineer 0');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('STALE')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer STALE')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lane('Applied').getByRole('status')).toHaveTextContent('Loading Applied');
    await act(async () => current.reject(new Error('PRIVATE')));
    expect(lane('Applied').getByRole('alert')).not.toHaveTextContent('PRIVATE');
    history.mockResolvedValueOnce({ items: [] }); fireEvent.click(screen.getByText('Retry Applied'));
    await lane('Applied').findByText('No matching saved analyses in Applied.');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'applied', ai_enriched: false });
    expect(lane('Applied').queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Load more Not applied')); await screen.findByText('Fictional Engineer 11');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied', ai_enriched: false });
    fireEvent.click(screen.getByText('Clear AI filter')); await screen.findByText('Fictional Engineer 0');
    expect(lane().getAllByRole('heading', { level: 5 })).toHaveLength(10);
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && !('ai_enriched' in (filters ?? {})))).toBe(true);
  });

  it('synchronizes rapid Apply/Clear and same-tick changes across all forms and invalidates dragging', async () => {
    render(<ApplicationPipelineBoard {...props} />); const drag = await startDrag(); draftAiFilter('no');
    const apply = screen.getByText('Apply AI filter'); const clear = screen.getByText('Clear AI filter');
    act(() => { apply.click(); apply.click(); clear.click(); clear.click(); apply.click(); });
    expect(history).toHaveBeenCalledTimes(21); expect(aiInput()).toHaveValue('all');
    draftAiFilter('no'); draftFollowUpFilters('yes', '2026-10-01', '2026-10-31'); draftScoreFilters('0', '100');
    fireEvent.change(searchInput(), { target: { value: 'Engineer' } });
    act(() => { apply.click(); screen.getByText('Apply search').click(); within(followUpForm()).getByText('Apply filters').click(); screen.getByText('Apply score filters').click(); });
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', ai_enriched: false, query: 'Engineer', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31', min_score: 0, max_score: 100 });
    await screen.findByText('Fictional Engineer record'); dropIn('Applied', drag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument(); expect(document.querySelector('.pipeline-card-dragging')).toBeNull();
    fireEvent.click(screen.getByText('Open details')); expect(onOpen).toHaveBeenCalledExactlyOnceWith('record');
  });

  it.each((['note', 'follow-up'] as const).flatMap((mode) => (['save', 'clear'] as const).map((action) => ({ mode, action }))))('blocks AI Apply/Clear while $mode editing and $action persistence protect the draft', async ({ mode, action }) => {
    vi.mocked(getAnalysisNote).mockResolvedValue(noteValue('persisted'));
    vi.mocked(getAnalysisFollowUp).mockResolvedValue(followUpValue('2026-10-21'));
    const notePut = deferred<AnalysisNote>(); const datePut = deferred<AnalysisFollowUp>(); const remove = deferred<void>();
    vi.mocked(updateAnalysisNote).mockReturnValue(notePut.promise); vi.mocked(updateAnalysisFollowUp).mockReturnValue(datePut.promise);
    vi.mocked(clearAnalysisNote).mockReturnValue(remove.promise); vi.mocked(clearAnalysisFollowUp).mockReturnValue(remove.promise);
    render(<ApplicationPipelineBoard {...props} />); applyAiFilter('no'); applySort(); await screen.findByText('Fictional Engineer record');
    draftAiFilter('yes'); draftSort('created_desc'); const apply = screen.getByText('Apply AI filter'); const clear = screen.getByText('Clear AI filter');
    act(() => { screen.getByText(`Edit ${mode}`).click(); apply.click(); clear.click(); screen.getByText('Apply sort').click(); screen.getByText('Reset sort').click(); });
    const input = mode === 'note' ? await screen.findByRole('textbox', { name: 'Application note' }) : await screen.findByLabelText('Follow-up date');
    const value = mode === 'note' ? 'unsaved draft' : '2026-10-23'; fireEvent.change(input, { target: { value } });
    expect(apply).toBeDisabled(); expect(clear).toBeDisabled(); expect(screen.getByText('Apply sort')).toBeDisabled(); expect(screen.getByText('Reset sort')).toBeDisabled(); fireEvent.submit(aiForm()); fireEvent.submit(sortForm()); fireEvent.click(screen.getByText('Reset sort'));
    expect(input).toHaveValue(value); expect(history).toHaveBeenCalledTimes(21);
    if (action === 'save') fireEvent.click(screen.getByText(`Save ${mode}`));
    else { fireEvent.click(screen.getByText(`Clear ${mode}`)); fireEvent.click(within(screen.getByRole('alertdialog')).getByText(`Clear ${mode}`)); }
    fireEvent.submit(aiForm()); fireEvent.submit(sortForm()); fireEvent.click(screen.getByText('Reset sort')); fireEvent.click(clear); expect(history).toHaveBeenCalledTimes(21);
    expect(screen.getByText('Applied board AI enrichment: Without AI enrichment.')).toBeInTheDocument();
    await act(async () => { if (action === 'clear') remove.resolve(); else if (mode === 'note') notePut.resolve(noteValue(value)); else datePut.resolve(followUpValue(value)); });
    await screen.findByText(action === 'clear' ? (mode === 'note' ? 'Application note cleared.' : 'Follow-up date cleared.') : (mode === 'note' ? 'Application note saved.' : 'Follow-up date saved.'));
    expect(history).toHaveBeenCalledTimes(mode === 'note' ? 21 : 28);
    expect(history.mock.calls.slice(-7).every(([, , filters]) => filters?.sort === 'follow_up_asc' && filters.ai_enriched === false)).toBe(true);
    fireEvent.click(screen.getByText('Close editing')); expect(screen.getByText(`Edit ${mode}`)).toHaveFocus();
    expect(aiInput()).toHaveValue('yes'); fireEvent.click(clear); await screen.findByText('Fictional Engineer record');
    expect(aiInput()).toHaveValue('all');
  });

  it('blocks AI changes during status confirmation and mutation and retains applied false after success', async () => {
    const put = deferred<AnalysisTracking>(); update.mockReturnValueOnce(put.promise);
    render(<ApplicationPipelineBoard {...props} />); applyAiFilter('no'); applySort(); await review(); draftAiFilter('yes'); draftSort('created_desc');
    const apply = screen.getByText('Apply AI filter'); const clear = screen.getByText('Clear AI filter');
    expect(apply).toBeDisabled(); expect(clear).toBeDisabled(); expect(screen.getByText('Apply sort')).toBeDisabled(); expect(screen.getByText('Reset sort')).toBeDisabled(); fireEvent.submit(aiForm()); fireEvent.submit(sortForm()); fireEvent.click(screen.getByText('Reset sort')); fireEvent.click(clear);
    expect(history).toHaveBeenCalledTimes(21);
    fireEvent.click(screen.getByText('Confirm status change')); await waitFor(() => expect(update).toHaveBeenCalledOnce());
    fireEvent.submit(aiForm()); fireEvent.submit(sortForm()); fireEvent.click(screen.getByText('Reset sort')); fireEvent.click(clear); expect(history).toHaveBeenCalledTimes(21);
    supply([record('record', 'applied')]); await act(async () => put.resolve({ analysis_id: 'record', application_status: 'applied', updated_at: null }));
    expect(history.mock.calls.slice(-7).every(([, , filters]) => filters?.sort === 'follow_up_asc' && filters.ai_enriched === false)).toBe(true);
    expect(lane('Applied').getByText('Fictional Engineer record')).toBeInTheDocument();
    expect(screen.getByText('Refresh board')).toHaveFocus(); expect(onStatusChanged).toHaveBeenCalledOnce();
  });
});


describe('Kanban follow-up sorting', () => {
  it('keeps default sort omitted, drafts local, summaries applied, and Apply/Reset idempotent', async () => {
    render(<ApplicationPipelineBoard {...props} />); await screen.findByText('Fictional Engineer record');
    const input = sortInput(); expect(input.tagName).toBe('SELECT'); expect(input).toHaveValue('created_desc');
    expect(within(input).getAllByRole('option').map((option) => option.textContent)).toEqual(['Newest saved first', 'Earliest follow-up first']);
    expect(input).toHaveAttribute('aria-describedby', 'board-sort-help');
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value });
    draftSort('follow_up_asc'); expect(history).toHaveBeenCalledTimes(7);
    expect(screen.getByText('Applied board sort: Newest saved first.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reset sort')); expect(input).toHaveValue('created_desc'); expect(history).toHaveBeenCalledTimes(7);
    draftSort('follow_up_asc'); input.focus();
    // Native Enter submits the form; jsdom does not implement that default action.
    fireEvent.submit(sortForm()); await screen.findByText('Fictional Engineer record');
    expect(input).toHaveFocus(); expect(history).toHaveBeenCalledTimes(14);
    expect(screen.getByText('Applied board sort: Earliest follow-up first.')).toHaveAttribute('aria-live', 'polite');
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, { application_status: value, sort: 'follow_up_asc' });
    fireEvent.click(screen.getByText('Apply sort')); expect(history).toHaveBeenCalledTimes(14);
    fireEvent.click(screen.getByText('Reset sort')); await screen.findByText('Fictional Engineer record');
    expect(history).toHaveBeenCalledTimes(21); expect(input).toHaveValue('created_desc');
    expect(history.mock.calls.slice(-7).every(([, offset, filters]) => offset === 0 && !('sort' in (filters ?? {})))).toBe(true);
    expect(analyzeCandidateJob).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(getAnalysisNote).not.toHaveBeenCalled(); expect(getAnalysisFollowUp).not.toHaveBeenCalled();
    expect(updateAnalysisFollowUp).not.toHaveBeenCalled(); expect(updateAnalysisNote).not.toHaveBeenCalled();
  });

  it.each(['all', 'yes', 'no'] as const)('allows %s follow-ups, preserves nulls and exact server order without browser sorting', async (presence) => {
    // Deliberately nonchronological server output detects any browser ordering or null exclusion.
    const rows = [{ ...record('z'), follow_up_on: null }, { ...record('a'), follow_up_on: '2026-10-31' }, { ...record('m'), follow_up_on: '2024-02-29' }];
    const returned = presence === 'no' ? [rows[0]] : presence === 'yes' ? rows.slice(1) : rows;
    supply(returned); render(<ApplicationPipelineBoard {...props} />); applyFollowUpFilters(presence); applySort();
    await screen.findByText(returned[0].job_title);
    expect(lane().getAllByRole('heading', { level: 5 }).map((node) => node.textContent)).toEqual(returned.map((item) => item.job_title));
    for (const { value } of applicationStatuses) expect(history).toHaveBeenCalledWith(11, 0, {
      application_status: value, sort: 'follow_up_asc', ...(presence === 'all' ? {} : { has_follow_up: presence === 'yes' }),
    });
    expect(screen.getByRole('region', { name: 'Application status lanes' }).children).toHaveLength(7);
    expect(lane('Applied').getByText(presence === 'all' ? 'No saved analyses in Applied.' : 'No matching saved analyses in Applied.')).toBeInTheDocument();
  });

  it.each(['yes', 'no'] as const)('preserves applied AI %s and every filter/draft across sort and independent clear actions', async (ai) => {
    render(<ApplicationPipelineBoard {...props} />); searchBoard('Engineer'); applyFollowUpFilters('yes', '2026-10-01', '2026-10-31');
    applyScoreFilters('0', '100'); applyAiFilter(ai);
    fireEvent.change(searchInput(), { target: { value: 'unsent search' } }); draftFollowUpFilters('no'); draftScoreFilters('80', '90'); draftAiFilter('all');
    applySort();
    const expected = { query: 'Engineer', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31', min_score: 0, max_score: 100, ai_enriched: ai === 'yes' };
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', ...expected, sort: 'follow_up_asc' });
    expect(searchInput()).toHaveValue('unsent search'); expect(screen.getByLabelText('Board follow-up status')).toHaveValue('no');
    expect(minScore()).toHaveValue(80); expect(aiInput()).toHaveValue('all');
    fireEvent.click(screen.getByText('Reset sort'));
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', ...expected });
    expect(searchInput()).toHaveValue('unsent search'); expect(minScore()).toHaveValue(80); expect(aiInput()).toHaveValue('all');
    applySort(); draftSort('created_desc'); searchBoard('Changed'); applyFollowUpFilters('no'); applyScoreFilters('72.25', '87.75'); applyAiFilter(ai);
    expect(sortInput()).toHaveValue('created_desc');
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', query: 'Changed', has_follow_up: false, min_score: 72.25, max_score: 87.75, ai_enriched: ai === 'yes', sort: 'follow_up_asc' });
    for (const name of ['Clear search', 'Clear follow-up filters', 'Clear score filters', 'Clear AI filter']) {
      fireEvent.click(screen.getByText(name)); expect(history.mock.calls.slice(-7).every(([, , filters]) => filters?.sort === 'follow_up_asc')).toBe(true);
    }
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', sort: 'follow_up_asc' });
    await screen.findByText('Fictional Engineer record');
  });

  it.each(['initial', 'page'].flatMap((phase) => ['resolve', 'reject'].flatMap((outcome) => [false, true].map((reverse) => ({ phase, outcome, reverse })))))('ignores stale $phase $outcome across sort changes (reverse=$reverse)', async ({ phase, outcome, reverse }) => {
    const old = deferred<AnalysisHistoryResponse>(); const current = deferred<AnalysisHistoryResponse>();
    const rows = Array.from({ length: 12 }, (_, i) => record(String(i)));
    // In reverse mode the original newest-first requests are stale; otherwise earliest is stale.
    history.mockImplementation(async (limit, offset, filters) => {
      const isOld = reverse ? filters?.sort === undefined : filters?.sort === 'follow_up_asc';
      if (isOld && (phase === 'initial' || offset === 10)) return old.promise;
      if (!isOld && filters?.application_status === 'applied') return current.promise;
      return { items: filters?.application_status === 'not_applied' ? rows.slice(offset ?? 0, (offset ?? 0) + (limit ?? 11)) : [] };
    });
    render(<ApplicationPipelineBoard {...props} />);
    if (!reverse) applySort();
    if (phase === 'page') fireEvent.click(await screen.findByText('Load more Not applied'));
    if (reverse) applySort(); else fireEvent.click(screen.getByText('Reset sort'));
    await screen.findByText('Fictional Engineer 0');
    await act(async () => { if (outcome === 'resolve') old.resolve({ items: [record('STALE')] }); else old.reject(new Error('PRIVATE')); });
    expect(screen.queryByText('Fictional Engineer STALE')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(lane('Applied').getByRole('status')).toHaveTextContent('Loading Applied');
    await act(async () => current.reject(new Error('PRIVATE'))); expect(lane('Applied').getByRole('alert')).not.toHaveTextContent('PRIVATE');
    history.mockResolvedValueOnce({ items: [] }); fireEvent.click(screen.getByText('Retry Applied'));
    await lane('Applied').findByText('No saved analyses in Applied.'); expect(lane('Applied').queryByRole('status')).not.toBeInTheDocument();
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'applied', ...(reverse ? { sort: 'follow_up_asc' } : {}) });
    fireEvent.click(screen.getByText('Load more Not applied')); await screen.findByText('Fictional Engineer 11');
    expect(history).toHaveBeenLastCalledWith(11, 10, { application_status: 'not_applied', ...(reverse ? { sort: 'follow_up_asc' } : {}) });
  });

  it('synchronizes rapid Apply/Reset and same-tick sorting with every form, invalidating active dragging', async () => {
    render(<ApplicationPipelineBoard {...props} />); const drag = await startDrag(); draftSort('follow_up_asc');
    const apply = screen.getByText('Apply sort'); const reset = screen.getByText('Reset sort');
    act(() => { apply.click(); apply.click(); reset.click(); reset.click(); apply.click(); });
    expect(history).toHaveBeenCalledTimes(21); expect(sortInput()).toHaveValue('created_desc');
    draftSort('follow_up_asc'); draftAiFilter('no'); draftFollowUpFilters('yes', '2026-10-01', '2026-10-31'); draftScoreFilters('0', '100');
    fireEvent.change(searchInput(), { target: { value: 'Engineer' } });
    act(() => { apply.click(); screen.getByText('Apply search').click(); within(followUpForm()).getByText('Apply filters').click(); screen.getByText('Apply score filters').click(); screen.getByText('Apply AI filter').click(); });
    expect(history).toHaveBeenLastCalledWith(11, 0, { application_status: 'withdrawn', sort: 'follow_up_asc', query: 'Engineer', has_follow_up: true, follow_up_from: '2026-10-01', follow_up_to: '2026-10-31', min_score: 0, max_score: 100, ai_enriched: false });
    await screen.findByText('Fictional Engineer record'); dropIn('Applied', drag.dataTransfer);
    expect(screen.queryByText('Confirm status change')).not.toBeInTheDocument(); expect(document.querySelector('.pipeline-card-dragging')).toBeNull();
    fireEvent.click(screen.getByText('Open details')); expect(onOpen).toHaveBeenCalledExactlyOnceWith('record');
  });
});
