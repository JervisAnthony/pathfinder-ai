import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApplicationNoteEditor } from '../ApplicationNoteEditor';
import { ApiError, getAnalysisNote, updateAnalysisNote, clearAnalysisNote } from '../../../api/pathfinder';
import type { AnalysisNote } from '../../../types/api';

vi.mock('../../../api/pathfinder', async (original) => ({
  ...await original<typeof import('../../../api/pathfinder')>(),
  getAnalysisNote: vi.fn(), updateAnalysisNote: vi.fn(), clearAnalysisNote: vi.fn(),
}));
const note = (content: string | null = null, id = 'one'): AnalysisNote => ({ analysis_id: id, content, updated_at: null });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const props = { analysisId: 'one', disabled: false, onMutatingChange: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getAnalysisNote).mockResolvedValue(note()); });

it('blocks empty, whitespace, unchanged and oversized saves and accepts exactly 10,000 characters without trimming', async () => {
  render(<ApplicationNoteEditor {...props} />);
  const input = await screen.findByRole('textbox', { name: 'Application note' });
  expect(input).toHaveAttribute('maxlength', '10000');
  for (const value of ['', ' \n ', 'x'.repeat(10001)]) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByText('Save note')).toBeDisabled();
    fireEvent.click(screen.getByText('Save note'));
  }
  expect(updateAnalysisNote).not.toHaveBeenCalled();
  const content = ' ' + 'x'.repeat(9998) + ' ';
  vi.mocked(updateAnalysisNote).mockResolvedValue(note(content));
  fireEvent.change(input, { target: { value: content } });
  fireEvent.click(screen.getByText('Save note'));
  await screen.findByText('Application note saved.');
  expect(updateAnalysisNote).toHaveBeenCalledExactlyOnceWith('one', content);
  expect(input).toHaveValue(content);
  expect(screen.getByText('Save note')).toBeDisabled();
  vi.mocked(updateAnalysisNote).mockResolvedValue(note('edited'));
  fireEvent.change(input, { target: { value: 'edited' } });
  fireEvent.click(screen.getByText('Save note'));
  await screen.findByText('Application note saved.');
  expect(input).toHaveValue('edited');
});

it.each(['save', 'clear'])('consults the immediate guard before %s', async (action) => {
  vi.mocked(getAnalysisNote).mockResolvedValue(note('persisted'));
  const canMutate = vi.fn(() => false);
  render(<ApplicationNoteEditor {...props} canMutate={canMutate} />);
  const input = await screen.findByRole('textbox', { name: 'Application note' });
  if (action === 'save') {
    fireEvent.change(input, { target: { value: 'draft' } });
    fireEvent.click(screen.getByText('Save note'));
  } else {
    fireEvent.click(screen.getByText('Clear note'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear note'));
  }
  expect(canMutate).toHaveBeenCalledOnce();
  expect(updateAnalysisNote).not.toHaveBeenCalled(); expect(clearAnalysisNote).not.toHaveBeenCalled();
  expect(props.onMutatingChange).not.toHaveBeenCalled();
});

const failures = [
  new ApiError('PRIVATE', 404, 'analysis_not_found'),
  new ApiError('PRIVATE', 503, 'persistence_unavailable'),
  new ApiError('PRIVATE', 422, 'validation_error'),
  new ApiError('PRIVATE'),
  new Error('PRIVATE'),
];
it.each(failures)('shows safe load errors and retries locally: %s', async (failure) => {
  vi.mocked(getAnalysisNote).mockRejectedValueOnce(failure);
  render(<ApplicationNoteEditor {...props} />);
  const alert = await screen.findByRole('alert');
  expect(alert).not.toHaveTextContent('PRIVATE');
  expect(alert).toHaveTextContent(failure instanceof ApiError && failure.status === 404 ? 'no longer exists'
    : failure instanceof ApiError && failure.status === 503 ? 'persistence is not configured' : 'could not load');
  fireEvent.click(screen.getByText('Retry note'));
  expect(await screen.findByRole('textbox', { name: 'Application note' })).toHaveValue('');
  expect(getAnalysisNote).toHaveBeenCalledTimes(2);
});

it.each(failures.flatMap((failure) => ['save', 'clear'].map((action) => ({ failure, action }))))('retains persisted content and drafts after failed $action: $failure', async ({ failure, action }) => {
  vi.mocked(getAnalysisNote).mockResolvedValue(note('persisted'));
  vi.mocked(updateAnalysisNote).mockRejectedValueOnce(failure).mockResolvedValueOnce(note('draft'));
  vi.mocked(clearAnalysisNote).mockRejectedValueOnce(failure).mockResolvedValueOnce();
  render(<ApplicationNoteEditor {...props} />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Application note' }), { target: { value: 'draft' } });
  if (action === 'clear') {
    fireEvent.click(screen.getByText('Clear note'));
    expect(clearAnalysisNote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    expect(clearAnalysisNote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Clear note'));
  }
  const button = action === 'save' ? screen.getByText('Save note') : within(screen.getByRole('alertdialog')).getByText('Clear note');
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).not.toHaveTextContent('PRIVATE');
  expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('draft');
  expect(screen.queryByText('No application note saved.')).not.toBeInTheDocument();
  expect(screen.queryByText('Application note saved.')).not.toBeInTheDocument();
  expect(screen.queryByText('Application note cleared.')).not.toBeInTheDocument();
  fireEvent.click(button);
  await screen.findByText(action === 'save' ? 'Application note saved.' : 'Application note cleared.');
  expect(action === 'save' ? updateAnalysisNote : clearAnalysisNote).toHaveBeenCalledTimes(2);
  if (action === 'clear') {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Application note' }), { target: { value: 'new note' } });
    expect(screen.getByText('Save note')).toBeEnabled();
  }
});

it.each(['resolve', 'reject'])('ignores a stale GET %s after changing analysis in the shared editor', async (outcome) => {
  const old = deferred<AnalysisNote>();
  vi.mocked(getAnalysisNote).mockReturnValueOnce(old.promise).mockResolvedValueOnce(note('second', 'two'));
  const { rerender } = render(<ApplicationNoteEditor {...props} />);
  rerender(<ApplicationNoteEditor {...props} analysisId="two" />);
  await screen.findByRole('textbox', { name: 'Application note' });
  await act(async () => { if (outcome === 'resolve') old.resolve(note('stale')); else old.reject(new Error('PRIVATE')); });
  expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('second');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['save', 'clear'].flatMap((action) => ['resolve', 'reject'].map((outcome) => ({ action, outcome }))))('emits no late callback after unmount during $action / $outcome in StrictMode', async ({ action, outcome }) => {
  const put = deferred<AnalysisNote>(); const remove = deferred<void>();
  vi.mocked(getAnalysisNote).mockResolvedValue(note('persisted'));
  vi.mocked(updateAnalysisNote).mockReturnValue(put.promise);
  vi.mocked(clearAnalysisNote).mockReturnValue(remove.promise);
  const { unmount } = render(<StrictMode><ApplicationNoteEditor {...props} /></StrictMode>);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Application note' }), { target: { value: 'draft' } });
  if (action === 'save') {
    const button = screen.getByText('Save note'); act(() => { button.click(); button.click(); });
    expect(updateAnalysisNote).toHaveBeenCalledOnce();
  } else {
    fireEvent.click(screen.getByText('Clear note'));
    const button = within(screen.getByRole('alertdialog')).getByText('Clear note');
    act(() => { button.click(); button.click(); });
    expect(clearAnalysisNote).toHaveBeenCalledOnce();
  }
  unmount();
  await act(async () => {
    if (action === 'save') { if (outcome === 'resolve') put.resolve(note('draft')); else put.reject(new Error('PRIVATE')); }
    else { if (outcome === 'resolve') remove.resolve(); else remove.reject(new Error('PRIVATE')); }
  });
  expect(props.onMutatingChange.mock.calls).toEqual([[true]]);
});

it('remains usable through StrictMode cleanup and an asynchronous rejection followed by retry', async () => {
  const pending = deferred<AnalysisNote>();
  vi.mocked(updateAnalysisNote).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(note('draft'));
  render(<StrictMode><ApplicationNoteEditor {...props} /></StrictMode>);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Application note' }), { target: { value: 'draft' } });
  fireEvent.click(screen.getByText('Save note'));
  await act(async () => pending.reject(new Error('PRIVATE')));
  expect(screen.getByText('Save note')).toBeEnabled();
  fireEvent.click(screen.getByText('Save note'));
  await screen.findByText('Application note saved.');
  expect(props.onMutatingChange.mock.calls).toEqual([[true], [false], [true], [false]]);
});

it.each(['save', 'clear'])('does not let a stale %s result update or unlock a newer record', async (action) => {
  const oldPut = deferred<AnalysisNote>(); const oldDelete = deferred<void>();
  const newPut = deferred<AnalysisNote>();
  vi.mocked(getAnalysisNote).mockResolvedValueOnce(note('first')).mockResolvedValueOnce(note('second', 'two'));
  vi.mocked(updateAnalysisNote).mockReturnValueOnce(action === 'save' ? oldPut.promise : newPut.promise);
  if (action === 'save') vi.mocked(updateAnalysisNote).mockReturnValueOnce(newPut.promise);
  vi.mocked(clearAnalysisNote).mockReturnValueOnce(oldDelete.promise);
  const { rerender } = render(<ApplicationNoteEditor {...props} />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Application note' }), { target: { value: 'first draft' } });
  if (action === 'save') fireEvent.click(screen.getByText('Save note'));
  else {
    fireEvent.click(screen.getByText('Clear note'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByText('Clear note'));
  }
  rerender(<ApplicationNoteEditor {...props} analysisId="two" />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Application note' }), { target: { value: 'second draft' } });
  fireEvent.click(screen.getByText('Save note'));
  await act(async () => { if (action === 'save') oldPut.resolve(note('first draft')); else oldDelete.resolve(); });
  expect(screen.getByRole('textbox', { name: 'Application note' })).toHaveValue('second draft');
  expect(screen.getByText('Save note')).toBeDisabled();
  expect(props.onMutatingChange.mock.calls).toEqual([[true], [true]]);
  await act(async () => newPut.resolve(note('second draft', 'two')));
  expect(screen.getByText('Application note saved.')).toBeInTheDocument();
  expect(props.onMutatingChange.mock.calls).toEqual([[true], [true], [false]]);
});
