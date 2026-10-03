import { useEffect, useRef, useState } from 'react';
import { ApiError, clearAnalysisFollowUp, getAnalysisFollowUp, updateAnalysisFollowUp } from '../../api/pathfinder';
import type { AnalysisFollowUp } from '../../types/api';
import { formatCalendarDate, formatSavedTimestamp } from './formatting';

type FollowUpAction = 'load' | 'save' | 'clear';

function followUpError(error: unknown, action: FollowUpAction): string {
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis no longer exists.';
  }
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'Follow-up dates are unavailable because persistence is not configured on this Pathfinder server.';
  }
  if (action !== 'load' && error instanceof ApiError && error.status === 422) {
    return 'The follow-up date is invalid.';
  }
  return action === 'load'
    ? 'Pathfinder could not load the follow-up date. Please try again.'
    : action === 'save'
      ? 'Pathfinder could not save the follow-up date. Please try again.'
      : 'Pathfinder could not clear the follow-up date. Please try again.';
}

interface Props {
  analysisId: string;
  disabled: boolean;
  onMutatingChange: (mutating: boolean) => void;
  onUpdated?: () => Promise<void>;
}

export function ApplicationFollowUpEditor({ analysisId, disabled, onMutatingChange, onUpdated }: Props) {
  const [followUp, setFollowUp] = useState<AnalysisFollowUp | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [pending, setPending] = useState<FollowUpAction | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setFollowUp(null);
    setDraft('');
    setError(null);
    setMessage(null);
    setConfirmingClear(false);
    void getAnalysisFollowUp(analysisId).then((value) => {
      if (generation.current !== current) return;
      setFollowUp(value);
      setDraft(value.follow_up_on ?? '');
    }).catch((reason: unknown) => {
      if (generation.current === current) setError(followUpError(reason, 'load'));
    }).finally(() => {
      if (generation.current === current) setLoading(false);
    });
    return () => { generation.current += 1; };
  }, [analysisId, retryKey]);

  const begin = (action: FollowUpAction) => {
    pendingRef.current = true;
    setPending(action);
    setError(null);
    setMessage(null);
    onMutatingChange(true);
  };

  const finish = () => {
    pendingRef.current = false;
    setPending(null);
    onMutatingChange(false);
  };

  const save = async () => {
    if (disabled || pendingRef.current || followUp === null || !draft || draft === (followUp.follow_up_on ?? '')) return;
    begin('save');
    const current = generation.current;
    try {
      const updated = await updateAnalysisFollowUp(analysisId, draft);
      if (generation.current !== current) return;
      setFollowUp(updated);
      setDraft(updated.follow_up_on ?? '');
      setMessage('Follow-up date saved.');
      try { await onUpdated?.(); } catch {
        setError('Follow-up date was saved, but History could not refresh. Please try refreshing History.');
      }
    } catch (reason) {
      if (generation.current === current) setError(followUpError(reason, 'save'));
    } finally {
      finish();
    }
  };

  const clear = async () => {
    if (disabled || pendingRef.current || !confirmingClear || followUp?.follow_up_on === null || !followUp) return;
    begin('clear');
    const current = generation.current;
    try {
      await clearAnalysisFollowUp(analysisId);
      if (generation.current !== current) return;
      setFollowUp({ analysis_id: analysisId, follow_up_on: null, updated_at: null });
      setDraft('');
      setConfirmingClear(false);
      setMessage('Follow-up date cleared.');
      try { await onUpdated?.(); } catch {
        setError('Follow-up date was cleared, but History could not refresh. Please try refreshing History.');
      }
    } catch (reason) {
      if (generation.current === current) setError(followUpError(reason, 'clear'));
    } finally {
      finish();
    }
  };

  const mutationDisabled = disabled || pendingRef.current || loading || followUp === null;

  return <section aria-labelledby="application-follow-up-title" className="application-follow-up">
    <h3 id="application-follow-up-title">Follow-up</h3>
    <p>Set a date to revisit this application. Pathfinder does not send reminders or notifications.</p>
    {loading && <p role="status">Loading follow-up date…</p>}
    {!loading && followUp === null && <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Retry follow-up</button>}
    {followUp !== null && <>
      {!followUp.follow_up_on ? <p>No follow-up date set.</p> : <p>Follow up on {formatCalendarDate(followUp.follow_up_on)}</p>}
      {followUp.updated_at && <p>Last updated {formatSavedTimestamp(followUp.updated_at)}</p>}
      <label htmlFor="application-follow-up-input">Follow-up date</label>
      <input type="date" id="application-follow-up-input" value={draft}
        disabled={mutationDisabled} onChange={(event) => { setDraft(event.target.value); setMessage(null); }} />
      <button type="button" disabled={mutationDisabled || !draft || draft === (followUp.follow_up_on ?? '')}
        onClick={() => void save()}>Save follow-up</button>
      {followUp.follow_up_on !== null && <button type="button" disabled={mutationDisabled}
        onClick={() => { setConfirmingClear(true); setError(null); setMessage(null); }}>Clear follow-up</button>}
      {confirmingClear && <div role="alertdialog" aria-labelledby="clear-follow-up-title" aria-describedby="clear-follow-up-description">
        <h4 id="clear-follow-up-title">Clear this follow-up date?</h4>
        <p id="clear-follow-up-description">The follow-up date will be removed. The saved analysis, application status, activity timeline, and application note will remain unchanged.</p>
        <button type="button" disabled={mutationDisabled} onClick={() => setConfirmingClear(false)}>Cancel</button>
        <button type="button" disabled={mutationDisabled} onClick={() => void clear()}>Clear follow-up</button>
      </div>}
    </>}
    {pending === 'save' && <p role="status">Saving follow-up…</p>}
    {pending === 'clear' && <p role="status">Clearing follow-up…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
