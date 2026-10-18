import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApplicationFollowUpEditor } from '../ApplicationFollowUpEditor';
import { getAnalysisFollowUp, updateAnalysisFollowUp } from '../../../api/pathfinder';
import type { AnalysisFollowUp } from '../../../types/api';

vi.mock('../../../api/pathfinder', () => ({
  ApiError: class extends Error {}, getAnalysisFollowUp: vi.fn(),
  updateAnalysisFollowUp: vi.fn(), clearAnalysisFollowUp: vi.fn(),
}));
const value = { analysis_id: 'one', follow_up_on: null, updated_at: null };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getAnalysisFollowUp).mockResolvedValue(value); });

it('consults the immediate workflow guard before starting a mutation', async () => {
  const canMutate = vi.fn(() => false);
  const mutating = vi.fn();
  render(<ApplicationFollowUpEditor analysisId="one" disabled={false} onMutatingChange={mutating} canMutate={canMutate} />);
  fireEvent.change(await screen.findByLabelText('Follow-up date'), { target: { value: '2024-02-29' } });
  fireEvent.click(screen.getByText('Save follow-up'));
  expect(canMutate).toHaveBeenCalledOnce();
  expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
  expect(mutating).not.toHaveBeenCalled();
});

it('rejects dates outside the backend calendar range before PUT', async () => {
  render(<ApplicationFollowUpEditor analysisId="one" disabled={false} onMutatingChange={vi.fn()} />);
  const input = await screen.findByLabelText('Follow-up date');
  fireEvent.change(input, { target: { value: '10000-01-01' } });
  fireEvent.click(screen.getByText('Save follow-up'));
  expect(updateAnalysisFollowUp).not.toHaveBeenCalled();
  expect(input).toBeInvalid();
});

it.each(['persistence', 'refresh'])('does not emit late callbacks after unmount during %s', async (phase) => {
  let resolve!: (value: AnalysisFollowUp) => void;
  let rejectRefresh!: (reason: Error) => void;
  const mutation = new Promise<AnalysisFollowUp>((done) => { resolve = done; });
  const refresh = new Promise<void>((_done, reject) => { rejectRefresh = reject; });
  vi.mocked(updateAnalysisFollowUp).mockReturnValue(mutation);
  const onUpdated = vi.fn(() => refresh);
  const mutating = vi.fn();
  const { unmount } = render(<ApplicationFollowUpEditor analysisId="one" disabled={false} onMutatingChange={mutating} onUpdated={onUpdated} />);
  fireEvent.change(await screen.findByLabelText('Follow-up date'), { target: { value: '2024-02-29' } });
  fireEvent.click(screen.getByText('Save follow-up'));
  if (phase === 'refresh') await act(async () => resolve({ ...value, follow_up_on: '2024-02-29' }));
  unmount();
  await act(async () => {
    if (phase === 'persistence') resolve({ ...value, follow_up_on: '2024-02-29' });
    else rejectRefresh(new Error('private'));
  });
  expect(mutating.mock.calls).toEqual([[true]]);
  expect(onUpdated).toHaveBeenCalledTimes(phase === 'refresh' ? 1 : 0);
});
