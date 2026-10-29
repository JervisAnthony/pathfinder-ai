import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getApplicationPipelineOverview } from '../../../api/pathfinder';
import type { ApplicationPipelineOverview as Overview } from '../../../types/api';
import { ApplicationPipelineOverview } from '../ApplicationPipelineOverview';
import { applicationStatuses } from '../status';
import { formatCalendarDate } from '../formatting';

vi.mock('../../../api/pathfinder', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../api/pathfinder')>(),
  getApplicationPipelineOverview: vi.fn(),
}));

const empty: Overview = {
  total_analyses: 0, status_counts: applicationStatuses.map(({ value }) => ({ status: value, count: 0 })),
  scheduled_follow_up_count: 0, unscheduled_follow_up_count: 0, earliest_follow_ups: [],
};
const populated: Overview = {
  ...empty, total_analyses: 8, scheduled_follow_up_count: 5, unscheduled_follow_up_count: 3,
  status_counts: applicationStatuses.map(({ value }, index) => ({ status: value, count: index === 0 ? 2 : 1 })),
  earliest_follow_ups: Array.from({ length: 5 }, (_, index) => ({
    analysis_id: String(index), job_title: `Fictional role ${index}`, company_name: index === 0 ? null : 'Example Company',
    application_status: applicationStatuses[index + 2].value, follow_up_on: index === 0 ? '2000-02-29' : '2099-12-31',
  })),
};

function deferred() {
  let resolve!: (value: Overview) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Overview>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(getApplicationPipelineOverview).mockReset();
  vi.mocked(getApplicationPipelineOverview).mockResolvedValue(empty);
});

describe('ApplicationPipelineOverview', () => {
  describe('follow-up date cues', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 30, 12)); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('keeps the five server entries and counts in order, with static cues beneath unchanged dates', async () => {
      const dates = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-02-30'];
      const cues = ['Past follow-up date', 'Follow-up today', 'Upcoming follow-up', 'Upcoming follow-up', null];
      vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ ...populated,
        earliest_follow_ups: populated.earliest_follow_ups.map((row, i) => ({ ...row, follow_up_on: dates[i] })),
      });
      const onOpen = vi.fn();
      render(<ApplicationPipelineOverview refreshKey={0} onOpen={onOpen} opening={false} />);
      await screen.findByText('Fictional role 0');
      const entries = within(screen.getByRole('region', { name: 'Earliest scheduled follow-ups' })).getAllByRole('listitem');
      expect(entries).toHaveLength(5);
      entries.forEach((entry, i) => {
        const button = within(entry).getByRole('button', { name: new RegExp(`Fictional role ${i}`) });
        expect(button).toHaveTextContent(i === 0 ? 'Company not supplied' : 'Example Company');
        const date = within(entry).getByText(`Follow up: ${formatCalendarDate(dates[i])}`);
        if (cues[i]) {
          const cue = within(entry).getByText(cues[i]!);
          expect(cue).toBeVisible(); expect(date.nextElementSibling).toBe(cue);
          expect(cue.closest('[role="alert"], [aria-live]')).toBeNull();
        } else expect(within(entry).queryByText(/Past follow-up date|Follow-up today|Upcoming follow-up/)).toBeNull();
        button.focus(); expect(button).toHaveFocus(); fireEvent.click(button); expect(onOpen).toHaveBeenLastCalledWith(String(i));
      });
      expect(within(screen.getByRole('region', { name: 'Application totals' })).getAllByRole('definition').map((el) => el.textContent)).toEqual(['8', '5', '3']);
      expect(within(screen.getByRole('region', { name: 'Application pipeline' })).getAllByRole('definition').map((el) => el.textContent)).toEqual(['2', '1', '1', '1', '1', '1', '1']);
      expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
    });

    it.each(applicationStatuses)('shows the same factual cue for $value', async ({ value }) => {
      vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ ...populated, earliest_follow_ups: [{ ...populated.earliest_follow_ups[0], application_status: value, follow_up_on: '2026-10-29' }] });
      render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
      expect(await screen.findByText('Past follow-up date')).toBeVisible();
      expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
    });

    it('uses one local day per render and refreshes cues on rerender without extra reads', async () => {
      vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ ...populated, earliest_follow_ups: populated.earliest_follow_ups.map((row) => ({ ...row, follow_up_on: '2027-01-01' })) });
      vi.setSystemTime(new Date('2026-12-31T12:01:00Z'));
      vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2027);
      vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
      const day = vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1);
      const props = { refreshKey: 0, onOpen: vi.fn(), opening: false };
      const view = render(<ApplicationPipelineOverview {...props} />); await screen.findByText('Fictional role 0');
      expect(screen.getAllByText('Follow-up today')).toHaveLength(5);
      const reads = day.mock.calls.length; day.mockReturnValue(2);
      expect(screen.getAllByText('Follow-up today')).toHaveLength(5);
      view.rerender(<ApplicationPipelineOverview {...props} />);
      expect(day.mock.calls.length).toBe(reads + 1); expect(screen.getAllByText('Past follow-up date')).toHaveLength(5);
      expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(1);
    });

    it('has no cues on empty/error/loading states and retries using current saved metadata', async () => {
      vi.mocked(getApplicationPipelineOverview).mockRejectedValueOnce(new Error('PRIVATE'));
      const view = render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
      expect(screen.queryByText(/Past follow-up date|Follow-up today|Upcoming follow-up/)).toBeNull();
      await screen.findByRole('alert');
      vi.mocked(getApplicationPipelineOverview).mockResolvedValueOnce({ ...populated, earliest_follow_ups: [{ ...populated.earliest_follow_ups[0], follow_up_on: '2026-10-30' }] });
      fireEvent.click(screen.getByText('Retry overview')); expect(await screen.findByText('Follow-up today')).toBeVisible();
      view.rerender(<ApplicationPipelineOverview refreshKey={1} onOpen={vi.fn()} opening={false} />);
      await screen.findByText('No scheduled follow-ups.'); expect(screen.queryByText('Follow-up today')).toBeNull();
      expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(3);
    });
  });

  it('shows independent loading without false zero counts', async () => {
    const pending = deferred();
    vi.mocked(getApplicationPipelineOverview).mockReturnValueOnce(pending.promise);
    render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading application pipeline overview');
    expect(screen.queryByText('Total saved analyses')).not.toBeInTheDocument();
    await act(async () => pending.resolve(empty));
    expect(await screen.findByText('Total saved analyses')).toBeInTheDocument();
  });

  it('renders successful zeros, seven ordered statuses, and a follow-up empty state', async () => {
    render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
    await screen.findByRole('heading', { name: 'Application totals' });
    const statuses = within(screen.getByRole('region', { name: 'Application pipeline' }));
    expect(statuses.getAllByRole('term').map((term) => term.textContent)).toEqual(applicationStatuses.map(({ label }) => label));
    expect(statuses.getAllByRole('definition').map((value) => value.textContent)).toEqual(Array(7).fill('0'));
    expect(screen.getByText('No scheduled follow-ups.')).toBeInTheDocument();
    expect(screen.getByText(/independently of History filters/)).toHaveTextContent('not unique application counts');
  });

  it.each([1, 5])('renders %i scheduled entries and opens the existing detail callback', async (count) => {
    vi.mocked(getApplicationPipelineOverview).mockResolvedValue({ ...populated, scheduled_follow_up_count: count, unscheduled_follow_up_count: 8 - count, earliest_follow_ups: populated.earliest_follow_ups.slice(0, count) });
    const onOpen = vi.fn();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const { rerender } = render(<ApplicationPipelineOverview refreshKey={0} onOpen={onOpen} opening={false} />);
    await screen.findByRole('heading', { name: 'Application totals' });
    const totals = within(screen.getByRole('region', { name: 'Application totals' }));
    expect(totals.getAllByRole('definition').map((value) => value.textContent)).toEqual(['8', String(count), String(8 - count)]);
    const section = within(screen.getByRole('region', { name: 'Earliest scheduled follow-ups' }));
    expect(section.getAllByRole('listitem')).toHaveLength(count);
    const button = section.getByRole('button', { name: /Fictional role 0/ });
    expect(button).toHaveTextContent('Company not supplied');
    expect(button).toHaveTextContent('Interviewing');
    expect(button).toHaveTextContent(formatCalendarDate('2000-02-29'));
    if (count === 5) expect(section.getByRole('button', { name: /Fictional role 4/ })).toHaveTextContent('Example Company');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('0');
    rerender(<ApplicationPipelineOverview refreshKey={0} onOpen={onOpen} opening />);
    expect(button).toBeDisabled();
    expect(screen.queryByText(/overdue|due today|due soon/i)).not.toBeInTheDocument();
    expect(storage).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0); expect(document.cookie).toBe('');
    storage.mockRestore();
  });

  it.each([
    [new Error('PRIVATE'), 'Pathfinder could not load the application pipeline overview. Please try again.'],
    [new ApiError('PRIVATE', 503, 'persistence_unavailable'), 'Application pipeline overview is unavailable because persistence is not available on this Pathfinder server.'],
  ])('shows a safe error and retries without misleading statistics', async (failure, message) => {
    vi.mocked(getApplicationPipelineOverview).mockRejectedValueOnce(failure);
    render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('Total saved analyses')).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry overview' }));
    await screen.findByText('Total saved analyses');
    expect(getApplicationPipelineOverview).toHaveBeenCalledTimes(2);
  });

  it.each(['success', 'failure'])('ignores a stale %s after a newer refresh', async (outcome) => {
    const old = deferred();
    vi.mocked(getApplicationPipelineOverview).mockReturnValueOnce(old.promise).mockResolvedValue(populated);
    const { rerender } = render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
    rerender(<ApplicationPipelineOverview refreshKey={1} onOpen={vi.fn()} opening={false} />);
    await screen.findByText('Fictional role 0');
    await act(async () => { if (outcome === 'success') old.resolve(empty); else old.reject(new Error('PRIVATE')); });
    expect(screen.getByText('Fictional role 0')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['success', 'failure'])('safely ignores %s after unmount', async (outcome) => {
    const pending = deferred();
    vi.mocked(getApplicationPipelineOverview).mockReturnValueOnce(pending.promise);
    const { unmount } = render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
    unmount();
    await act(async () => { if (outcome === 'success') pending.resolve(populated); else pending.reject(new Error('PRIVATE')); });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('does not let an older completion end the newest loading state', async () => {
    const old = deferred(); const current = deferred();
    vi.mocked(getApplicationPipelineOverview).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { rerender } = render(<ApplicationPipelineOverview refreshKey={0} onOpen={vi.fn()} opening={false} />);
    rerender(<ApplicationPipelineOverview refreshKey={1} onOpen={vi.fn()} opening={false} />);
    await act(async () => old.resolve(populated));
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => current.resolve(empty));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByText('No scheduled follow-ups.')).toBeInTheDocument();
  });
});
