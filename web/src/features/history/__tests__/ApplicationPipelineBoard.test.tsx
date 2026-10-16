import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAnalysisHistory, getAnalysisTracking, updateAnalysisTracking } from '../../../api/pathfinder';
import type { AnalysisHistoryResponse, AnalysisTracking, ApplicationStatus, SavedAnalysisSummary } from '../../../types/api';
import { ApplicationPipelineBoard } from '../ApplicationPipelineBoard';
import { applicationStatuses } from '../status';
import { formatCalendarDate, formatSavedTimestamp } from '../formatting';

vi.mock('../../../api/pathfinder', async (original) => ({
  ...await original<typeof import('../../../api/pathfinder')>(),
  getAnalysisHistory: vi.fn(), getAnalysisTracking: vi.fn(), updateAnalysisTracking: vi.fn(),
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
const lane = (name = 'Not applied') => within(screen.getByRole('region', { name }));
const history = vi.mocked(getAnalysisHistory);
const tracking = vi.mocked(getAnalysisTracking);
const update = vi.mocked(updateAnalysisTracking);

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

beforeEach(() => {
  vi.resetAllMocks();
  supply([record()]);
  tracking.mockResolvedValue({ analysis_id: 'record', application_status: 'not_applied', updated_at: null });
  update.mockResolvedValue({ analysis_id: 'record', application_status: 'applied', updated_at: '2026-10-16T10:00:00Z' });
});

describe('ApplicationPipelineBoard', () => {
  it('renders seven ordered semantic lanes and makes bounded independent initial requests', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    await screen.findByText('Fictional Engineer record');
    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent))
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'applied' } });
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'not_applied' } });
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
    expect(screen.getByRole('combobox')).toBeDisabled();
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
