import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getApplicationPipelineOverview } from '../../api/pathfinder';
import type { ApplicationPipelineOverview as Overview } from '../../types/api';
import { formatCalendarDate } from './formatting';
import { statusLabel } from './status';

interface Props {
  refreshKey: number;
  onOpen: (analysisId: string) => void;
  opening: boolean;
}

export function ApplicationPipelineOverview({ refreshKey, onOpen, opening }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const value = await getApplicationPipelineOverview();
      if (requestId !== request.current) return;
      setOverview(value);
    } catch (caught) {
      if (requestId !== request.current) return;
      setOverview(null);
      setError(caught instanceof ApiError && caught.code === 'persistence_unavailable'
        ? 'Application pipeline overview is unavailable because persistence is not available on this Pathfinder server.'
        : 'Pathfinder could not load the application pipeline overview. Please try again.');
    } finally {
      if (requestId === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load, refreshKey]);

  return (
    <section className="pipeline-overview" aria-labelledby="pipeline-overview-title">
      <h3 id="pipeline-overview-title">Application Pipeline Overview</h3>
      <p>Counts include all saved analysis records, independently of History filters. Multiple snapshots for the same job count separately; these are not unique application counts.</p>
      {loading && <p role="status">Loading application pipeline overview...</p>}
      {!loading && error && <div role="alert"><p>{error}</p><button type="button" className="secondary-btn" onClick={() => void load()}>Retry overview</button></div>}
      {!loading && !error && overview && <>
        <section aria-labelledby="pipeline-totals-title">
          <h4 id="pipeline-totals-title">Application totals</h4>
          <dl className="pipeline-counts">
            <div><dt>Total saved analyses</dt><dd>{overview.total_analyses}</dd></div>
            <div><dt>Scheduled follow-ups</dt><dd>{overview.scheduled_follow_up_count}</dd></div>
            <div><dt>Unscheduled follow-ups</dt><dd>{overview.unscheduled_follow_up_count}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="pipeline-status-title">
          <h4 id="pipeline-status-title">Application pipeline</h4>
          <dl className="pipeline-counts">
            {overview.status_counts.map((item) => <div key={item.status}><dt>{statusLabel(item.status)}</dt><dd>{item.count}</dd></div>)}
          </dl>
        </section>
        <section aria-labelledby="pipeline-follow-ups-title">
          <h4 id="pipeline-follow-ups-title">Earliest scheduled follow-ups</h4>
          {overview.earliest_follow_ups.length === 0 ? <p>No scheduled follow-ups.</p> :
            <ul className="history-list pipeline-follow-ups">
              {overview.earliest_follow_ups.map((item) => <li key={item.analysis_id}>
                <button type="button" onClick={() => onOpen(item.analysis_id)} disabled={opening}>
                  <span><strong>{item.job_title}</strong><small>{item.company_name ?? 'Company not supplied'}</small></span>
                  <span><small>Status: {statusLabel(item.application_status)}</small><small>Follow up: {formatCalendarDate(item.follow_up_on)}</small></span>
                </button>
              </li>)}
            </ul>}
        </section>
      </>}
    </section>
  );
}
