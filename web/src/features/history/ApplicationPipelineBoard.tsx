import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getAnalysisHistory, getAnalysisTracking, updateAnalysisTracking } from '../../api/pathfinder';
import type { ApplicationStatus, SavedAnalysisSummary } from '../../types/api';
import { formatCalendarDate, formatSavedTimestamp } from './formatting';
import { applicationStatuses, statusLabel } from './status';

interface Props {
  onOpen: (analysisId: string) => void;
  onStatusChanged: () => void;
  opening: boolean;
  refreshKey: number;
}

interface Lane {
  items: SavedAnalysisSummary[];
  offset: number;
  more: boolean;
  loading: boolean;
  error: string | null;
}

interface Change {
  item: SavedAnalysisSummary;
  from: ApplicationStatus;
  to: ApplicationStatus;
}

const PAGE_SIZE = 10;
const initialLane = (): Lane => ({
  items: [], offset: 0, more: false, loading: true, error: null,
});
const initialLanes = () => Object.fromEntries(applicationStatuses.map(({ value }) => [value, initialLane()])) as Record<ApplicationStatus, Lane>;

function safeError(error: unknown, action: 'load' | 'update'): string {
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'The application board is unavailable because persistence is not configured on this Pathfinder server.';
  }
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis no longer exists. Refresh the board to see current records.';
  }
  return action === 'load'
    ? 'Pathfinder could not load this lane. Please try again.'
    : 'Pathfinder could not change the application status. Please try again.';
}

function BoardCard({ item, status, disabled, opening, onOpen, onReview }: {
  item: SavedAnalysisSummary;
  status: ApplicationStatus;
  disabled: boolean;
  opening: boolean;
  onOpen: Props['onOpen'];
  onReview: (change: Change) => void;
}) {
  const [target, setTarget] = useState(status);
  return <li className="pipeline-card">
    <h5>{item.job_title}</h5>
    <p>{item.company_name ?? 'Company not supplied'}</p>
    <p>{item.score === null ? 'Not scored' : `${item.score}% match`}</p>
    <p>Saved: {formatSavedTimestamp(item.created_at)}</p>
    {item.follow_up_on && <p>Follow up: {formatCalendarDate(item.follow_up_on)}</p>}
    <button type="button" disabled={opening || disabled} onClick={() => onOpen(item.analysis_id)}>Open details</button>
    <label>New status for {item.job_title}
      <select value={target} disabled={disabled} onChange={(event) => setTarget(event.target.value as ApplicationStatus)}>
        {applicationStatuses.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button id={`review-${item.analysis_id}`} type="button" disabled={disabled || target === status}
      onClick={() => onReview({ item, from: status, to: target })}>Review change</button>
  </li>;
}

export function ApplicationPipelineBoard({ onOpen, onStatusChanged, opening, refreshKey }: Props) {
  const [lanes, setLanes] = useState(initialLanes);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pending = useRef(new Set<ApplicationStatus>());
  const mounted = useRef(false);
  const mutationPending = useRef(false);
  const [updating, setUpdating] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<string | null>(null);
  const focusRefresh = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (change) confirmation.current?.focus();
    else if (restoreFocus.current) {
      document.getElementById(restoreFocus.current)?.focus();
      restoreFocus.current = null;
    }
  }, [change]);

  useEffect(() => {
    if (!updating && focusRefresh.current) {
      refreshButton.current?.focus();
      focusRefresh.current = false;
    }
  }, [updating]);

  const loadLane = useCallback(async (status: ApplicationStatus, offset: number, epoch: number) => {
    if (epoch !== generation.current || pending.current.has(status)) return;
    pending.current.add(status);
    setLanes((current) => ({ ...current, [status]: { ...current[status], loading: true, error: null } }));
    try {
      const response = await getAnalysisHistory(PAGE_SIZE + 1, offset, { application_status: status });
      if (epoch !== generation.current) return;
      setLanes((current) => {
        const previous = offset === 0 ? [] : current[status].items;
        const seen = new Set(previous.map((item) => item.analysis_id));
        const page = response.items.slice(0, PAGE_SIZE).filter((item) => {
          if (seen.has(item.analysis_id)) return false;
          seen.add(item.analysis_id);
          return true;
        });
        return { ...current, [status]: {
          items: [...previous, ...page], offset: offset + PAGE_SIZE,
          more: response.items.length > PAGE_SIZE, loading: false, error: null,
        } };
      });
    } catch (caught) {
      if (epoch !== generation.current) return;
      setLanes((current) => ({ ...current, [status]: { ...current[status], loading: false, error: safeError(caught, 'load') } }));
    } finally {
      if (epoch === generation.current) pending.current.delete(status);
    }
  }, []);

  const refresh = useCallback(() => {
    const epoch = ++generation.current;
    pending.current = new Set();
    setLanes(initialLanes());
    setRevision((current) => current + 1);
    if (!mutationPending.current) setChange(null);
    applicationStatuses.forEach(({ value }) => { void loadLane(value, 0, epoch); });
  }, [loadLane]);

  useEffect(() => {
    refresh();
    return () => { generation.current += 1; };
  }, [refresh, refreshKey]);

  const cancel = () => {
    if (mutationPending.current) return;
    restoreFocus.current = `review-${change?.item.analysis_id}`;
    setChange(null);
    setError(null);
  };

  const submit = async () => {
    if (!change || change.from === change.to || mutationPending.current) return;
    mutationPending.current = true;
    setUpdating(true);
    setError(null);
    setMessage(null);
    try {
      const current = await getAnalysisTracking(change.item.analysis_id);
      if (!mounted.current) return;
      if (current.application_status !== change.from) {
        setError('This application status changed elsewhere. The board has been refreshed; review the current status before trying again.');
        setChange(null);
        focusRefresh.current = true;
        refresh();
        return;
      }
      await updateAnalysisTracking(change.item.analysis_id, change.to);
      if (!mounted.current) return;
      setMessage(`Application status changed to ${statusLabel(change.to)}.`);
      setChange(null);
      focusRefresh.current = true;
      refresh();
      onStatusChanged();
    } catch (caught) {
      if (mounted.current) setError(safeError(caught, 'update'));
    } finally {
      mutationPending.current = false;
      if (mounted.current) setUpdating(false);
    }
  };

  return <section className="pipeline-board" aria-labelledby="pipeline-board-title">
    <div className="history-heading">
      <h3 id="pipeline-board-title">Application Pipeline Board</h3>
      <button ref={refreshButton} type="button" disabled={updating} onClick={() => { setError(null); setMessage(null); refresh(); }}>Refresh board</button>
    </div>
    <p>All saved analysis snapshots, grouped by recorded status. History filters affect List view only. Each snapshot is a separate card; records without tracking appear in Not applied.</p>
    <p>Each lane loads 10 cards at a time, newest saved first. Changes in other sessions may require Refresh board.</p>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {change && <div className="pipeline-confirmation" role="region" aria-label="Confirm application status change" tabIndex={-1} ref={confirmation}>
      <p>Move “{change.item.job_title}” ({change.item.company_name ?? 'Company not supplied'}, saved {formatSavedTimestamp(change.item.created_at)}, ID: {change.item.analysis_id}) from {statusLabel(change.from)} to {statusLabel(change.to)}?</p>
      <div className="export-actions">
        <button type="button" disabled={updating} onClick={cancel}>Cancel</button>
        <button type="button" disabled={updating} onClick={() => void submit()}>Confirm status change</button>
      </div>
      {updating && <p role="status">Updating application status...</p>}
    </div>}
    <div className="pipeline-lanes" role="region" aria-label="Application status lanes" tabIndex={0}>
      {applicationStatuses.map(({ value, label }) => {
        const lane = lanes[value];
        return <section className="pipeline-lane" aria-labelledby={`lane-${value}`} key={value}>
          <h4 id={`lane-${value}`}>{label}</h4>
          {lane.loading && <p role="status">Loading {label}...</p>}
          {lane.error && <div role="alert"><p>{lane.error}</p><button type="button" disabled={lane.loading || updating} onClick={() => void loadLane(value, lane.offset, generation.current)}>Retry {label}</button></div>}
          {!lane.loading && !lane.error && lane.items.length === 0 && <p>No saved analyses in {label}.</p>}
          {lane.items.length > 0 && <ul className="pipeline-cards">
            {lane.items.map((item) => <BoardCard key={`${revision}-${item.analysis_id}`} item={item} status={value}
              opening={opening} disabled={updating || change !== null} onOpen={onOpen}
              onReview={(next) => { setError(null); setMessage(null); setChange(next); }} />)}
          </ul>}
          {lane.more && !lane.error && <button type="button" disabled={lane.loading || updating} onClick={() => void loadLane(value, lane.offset, generation.current)}>Load more {label}</button>}
        </section>;
      })}
    </div>
  </section>;
}
