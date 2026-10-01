import { useEffect, useRef, useState } from 'react';
import { ApiError, getAnalysisTrackingHistory } from '../../api/pathfinder';
import type { ApplicationStatusEvent } from '../../types/api';
import { formatSavedTimestamp } from './formatting';
import { statusLabel } from './status';

const PAGE_SIZE = 20;

function activityError(error: unknown, refreshing: boolean): string {
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis no longer exists.';
  }
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'Application activity is unavailable because persistence is not configured on this Pathfinder server.';
  }
  return refreshing
    ? 'Application status was saved, but the activity timeline could not be refreshed.'
    : 'Pathfinder could not load application activity. Please try again.';
}

export function ApplicationStatusActivity({ analysisId, refreshKey }: { analysisId: string; refreshKey: number }) {
  const [events, setEvents] = useState<ApplicationStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const olderPending = useRef(false);
  const generation = useRef(0);

  const invalidate = () => { generation.current += 1; };

  useEffect(() => {
    const current = ++generation.current;
    olderPending.current = false;
    setLoadingOlder(false);
    setLoading(true);
    setError(null);
    void getAnalysisTrackingHistory(analysisId).then(({ items }) => {
      if (generation.current !== current) return;
      setEvents(items);
      setHasOlder(items.length === PAGE_SIZE);
    }).catch((reason: unknown) => {
      if (generation.current !== current) return;
      setError(activityError(reason, refreshKey > 0));
    }).finally(() => {
      if (generation.current === current) setLoading(false);
    });
    return invalidate;
  }, [analysisId, refreshKey]);

  const loadOlder = async () => {
    if (olderPending.current || loading || !hasOlder) return;
    olderPending.current = true;
    setLoadingOlder(true);
    setError(null);
    const current = generation.current;
    try {
      const { items } = await getAnalysisTrackingHistory(analysisId, PAGE_SIZE, events.length);
      if (generation.current !== current) return;
      setEvents((previous) => [...previous, ...items]);
      setHasOlder(items.length === PAGE_SIZE);
    } catch (reason) {
      if (generation.current === current) setError(activityError(reason, false));
    } finally {
      if (generation.current === current) {
        olderPending.current = false;
        setLoadingOlder(false);
      }
    }
  };

  return <section aria-labelledby="application-activity-title" className="application-activity">
    <h3 id="application-activity-title">Application activity</h3>
    <p>This timeline records status changes made in Pathfinder after activity tracking became available.</p>
    {loading && <p role="status">Loading application activity…</p>}
    {!loading && events.length === 0 && !error && <p>No application status changes have been recorded yet.</p>}
    {events.length > 0 && <ol aria-label="Application status changes">
      {events.map((event, index) => <li key={`${event.changed_at}-${index}`}>
        <span>{statusLabel(event.previous_status)} → {statusLabel(event.application_status)}</span>
        <span>Changed {formatSavedTimestamp(event.changed_at)}</span>
      </li>)}
    </ol>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {hasOlder && !loading && <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>Load older activity</button>}
    {loadingOlder && <p role="status">Loading older activity…</p>}
  </section>;
}
