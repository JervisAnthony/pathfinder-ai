import { StrictMode } from 'react';
import { act, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getAnalysisHistory, getAnalysisTracking, updateAnalysisTracking, getAnalysisFollowUp, updateAnalysisFollowUp, clearAnalysisFollowUp, getAnalysisNote, updateAnalysisNote, clearAnalysisNote } from '../../../api/pathfinder';
import type { AnalysisNote, AnalysisFollowUp, AnalysisHistoryResponse, AnalysisTracking, ApplicationStatus, SavedAnalysisSummary } from '../../../types/api';
import { ApplicationPipelineBoard } from '../ApplicationPipelineBoard';
import { applicationStatuses } from '../status';
import { formatCalendarDate, formatSavedTimestamp } from '../formatting';

vi.mock('../../../api/pathfinder', async (original) => ({
  ...await original<typeof import('../../../api/pathfinder')>(),
  getAnalysisHistory: vi.fn(), getAnalysisTracking: vi.fn(), updateAnalysisTracking: vi.fn(),
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

describe('native board dragging', () => {
  it('exposes only a dedicated draggable handle with instructions and a meaningful keyboard action', async () => {
    render(<ApplicationPipelineBoard {...props} />);
    const handle = await screen.findByRole('button', { name: 'Drag to change status for Fictional Engineer record' });
    expect(handle).toHaveAttribute('draggable', 'true');
    expect(handle).toHaveAccessibleDescription(/On keyboard or touch devices, choose a new status/);
    expect(handle.closest('li')).not.toHaveAttribute('draggable');
    expect(screen.getByRole('button', { name: 'Open details' })).not.toHaveAttribute('draggable');
    expect(screen.getByRole('combobox')).not.toHaveAttribute('draggable');
    fireEvent.click(handle);
    expect(screen.getByRole('combobox')).toHaveFocus();
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
