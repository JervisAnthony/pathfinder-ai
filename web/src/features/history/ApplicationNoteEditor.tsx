import { useEffect, useRef, useState } from 'react';
import { ApiError, clearAnalysisNote, getAnalysisNote, updateAnalysisNote } from '../../api/pathfinder';
import type { AnalysisNote } from '../../types/api';
import { formatSavedTimestamp } from './formatting';

const MAX_NOTE_LENGTH = 10_000;

type NoteAction = 'load' | 'save' | 'clear';

function noteError(error: unknown, action: NoteAction): string {
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis no longer exists.';
  }
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'Application notes are unavailable because persistence is not configured on this Pathfinder server.';
  }
  if (action === 'save' && error instanceof ApiError && error.status === 422) {
    return 'The application note is invalid. Check that it contains text and is no longer than 10,000 characters.';
  }
  return action === 'load'
    ? 'Pathfinder could not load the application note. Please try again.'
    : action === 'save'
      ? 'Pathfinder could not save the application note. Please try again.'
      : 'Pathfinder could not clear the application note. Please try again.';
}

interface Props {
  analysisId: string;
  disabled: boolean;
  onMutatingChange: (mutating: boolean) => void;
}

export function ApplicationNoteEditor({ analysisId, disabled, onMutatingChange }: Props) {
  const [note, setNote] = useState<AnalysisNote | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [pending, setPending] = useState<NoteAction | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setNote(null);
    setDraft('');
    setError(null);
    setMessage(null);
    void getAnalysisNote(analysisId).then((value) => {
      if (generation.current !== current) return;
      setNote(value);
      setDraft(value.content ?? '');
    }).catch((reason: unknown) => {
      if (generation.current === current) setError(noteError(reason, 'load'));
    }).finally(() => {
      if (generation.current === current) setLoading(false);
    });
    return () => { generation.current += 1; };
  }, [analysisId, retryKey]);

  const begin = (action: NoteAction) => {
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
    if (disabled || pendingRef.current || note === null || !draft.trim()
      || draft.length > MAX_NOTE_LENGTH || draft === (note.content ?? '')) return;
    begin('save');
    const current = generation.current;
    try {
      const updated = await updateAnalysisNote(analysisId, draft);
      if (generation.current !== current) return;
      setNote(updated);
      setDraft(updated.content ?? '');
      setMessage('Application note saved.');
    } catch (reason) {
      if (generation.current === current) setError(noteError(reason, 'save'));
    } finally {
      finish();
    }
  };

  const clear = async () => {
    if (disabled || pendingRef.current || note?.content === null || !note) return;
    begin('clear');
    const current = generation.current;
    try {
      await clearAnalysisNote(analysisId);
      if (generation.current !== current) return;
      setNote({ analysis_id: analysisId, content: null, updated_at: null });
      setDraft('');
      setConfirmingClear(false);
      setMessage('Application note cleared.');
    } catch (reason) {
      if (generation.current === current) setError(noteError(reason, 'clear'));
    } finally {
      finish();
    }
  };

  const mutationDisabled = disabled || pendingRef.current || loading || note === null;

  return <section aria-labelledby="application-note-title" className="application-note">
    <h3 id="application-note-title">Application note</h3>
    <p>Keep private context about this application. Notes are stored separately from the saved analysis and are not sent to AI.</p>
    {loading && <p role="status">Loading application note…</p>}
    {!loading && note === null && <button type="button" onClick={() => setRetryKey((value) => value + 1)}>Retry note</button>}
    {note !== null && <>
      {!note.content && <p>No application note saved.</p>}
      {note.updated_at && <p>Last updated {formatSavedTimestamp(note.updated_at)}</p>}
      <label htmlFor="application-note-input">Application note</label>
      <textarea id="application-note-input" value={draft} maxLength={MAX_NOTE_LENGTH}
        disabled={mutationDisabled} onChange={(event) => { setDraft(event.target.value); setMessage(null); }} />
      <p>{draft.length} / 10,000</p>
      <button type="button" disabled={mutationDisabled || !draft.trim() || draft === (note.content ?? '')}
        onClick={() => void save()}>Save note</button>
      {note.content !== null && <button type="button" disabled={mutationDisabled}
        onClick={() => { setConfirmingClear(true); setError(null); setMessage(null); }}>Clear note</button>}
      {confirmingClear && <div role="alertdialog" aria-labelledby="clear-note-title" aria-describedby="clear-note-description">
        <h4 id="clear-note-title">Clear this application note?</h4>
        <p id="clear-note-description">The saved note will be removed from Pathfinder. The saved analysis, application status, and activity timeline will remain unchanged.</p>
        <button type="button" disabled={mutationDisabled} onClick={() => setConfirmingClear(false)}>Cancel</button>
        <button type="button" disabled={mutationDisabled} onClick={() => void clear()}>Clear note</button>
      </div>}
    </>}
    {pending === 'save' && <p role="status">Saving application note…</p>}
    {pending === 'clear' && <p role="status">Clearing application note…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
