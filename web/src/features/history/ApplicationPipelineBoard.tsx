import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ApiError, getAnalysisHistory, getAnalysisTracking, updateAnalysisTracking } from '../../api/pathfinder';
import type { ApplicationStatus, SavedAnalysisSummary } from '../../types/api';
import { formatCalendarDate, formatSavedTimestamp } from './formatting';
import { applicationStatuses, statusLabel } from './status';
import { ApplicationFollowUpEditor } from './ApplicationFollowUpEditor';
import { ApplicationNoteEditor } from './ApplicationNoteEditor';
import { emptyBoardFollowUpFilters, validateBoardFollowUpFilters } from './boardFollowUpFilters';
import type { BoardFollowUpFilters } from './boardFollowUpFilters';
import { emptyBoardScoreFilters, parseBoardScoreFilters } from './boardScoreFilters';
import type { BoardScoreBounds, BoardScoreFilters } from './boardScoreFilters';

type QuickEditor = { mode: 'follow-up' | 'note'; item: SavedAnalysisSummary };
interface BoardFilters {
  query: string;
  followUp: BoardFollowUpFilters;
  scores: BoardScoreBounds;
}

interface Props {
  onOpen: (analysisId: string) => void;
  onStatusChanged: () => void;
  opening: boolean;
  refreshKey: number;
  onFollowUpUpdated?: () => Promise<void>;
  onQuickEditorMutatingChange?: (mutating: boolean) => void;
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
  focusId?: string;
}

interface DragSession {
  item: SavedAnalysisSummary;
  from: ApplicationStatus;
  epoch: number;
  marker: string;
}

const DRAG_TYPE = 'application/x-pathfinder-status-drag';
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

function BoardCard({ item, status, disabled, opening, onOpen, onReview, dragging, onDragStart, onDragEnd, onFollowUp, onNote }: {
  item: SavedAnalysisSummary;
  status: ApplicationStatus;
  disabled: boolean;
  opening: boolean;
  onOpen: Props['onOpen'];
  onReview: (change: Change) => void;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onFollowUp: (item: SavedAnalysisSummary) => void;
  onNote: (item: SavedAnalysisSummary) => void;
}) {
  const [target, setTarget] = useState(status);
  const selector = useRef<HTMLSelectElement>(null);
  return <li className={`pipeline-card${dragging ? ' pipeline-card-dragging' : ''}`}>
    <h5>{item.job_title}</h5>
    <button id={`drag-${item.analysis_id}`} type="button" className="pipeline-drag-handle"
      aria-label={`Drag to change status for ${item.job_title}`} aria-describedby="pipeline-drag-instructions"
      disabled={disabled || opening} draggable={!disabled && !opening}
      onClick={() => selector.current?.focus()} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      Drag to change status
    </button>
    {dragging && <p className="pipeline-drag-instructions">Dragging this card</p>}
    <p>{item.company_name ?? 'Company not supplied'}</p>
    <p>{item.score === null ? 'Not scored' : `${item.score}% match`}</p>
    <p>Saved: {formatSavedTimestamp(item.created_at)}</p>
    <p>{item.follow_up_on ? `Follow up: ${formatCalendarDate(item.follow_up_on)}` : 'No follow-up scheduled'}</p>
    <button id={`follow-up-${item.analysis_id}`} type="button" disabled={opening || disabled}
      onClick={() => onFollowUp(item)}>Edit follow-up</button>
    <button id={`note-${item.analysis_id}`} type="button" disabled={opening || disabled}
      onClick={() => onNote(item)}>Edit note</button>
    <button type="button" disabled={opening || disabled} onClick={() => onOpen(item.analysis_id)}>Open details</button>
    <label>New status for {item.job_title}
      <select ref={selector} value={target} disabled={disabled} onChange={(event) => setTarget(event.target.value as ApplicationStatus)}>
        {applicationStatuses.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button id={`review-${item.analysis_id}`} type="button" disabled={disabled || target === status}
      onClick={() => onReview({ item, from: status, to: target })}>Review change</button>
  </li>;
}

export function ApplicationPipelineBoard({ onOpen, onStatusChanged, opening, refreshKey, onFollowUpUpdated, onQuickEditorMutatingChange }: Props) {
  const [draftQuery, setDraftQuery] = useState('');
  const draftQueryRef = useRef('');
  const [draftFollowUp, setDraftFollowUp] = useState(emptyBoardFollowUpFilters);
  const draftFollowUpRef = useRef(draftFollowUp);
  const [appliedFilters, setAppliedFilters] = useState<BoardFilters>({ query: '', followUp: emptyBoardFollowUpFilters(), scores: {} });
  // Update synchronously before refresh so same-tick actions and every refresh
  // workflow use one current filter context, independent of render closures.
  const appliedFiltersRef = useRef(appliedFilters);
  const [draftScores, setDraftScores] = useState(emptyBoardScoreFilters);
  const draftScoresRef = useRef(draftScores);
  const [scoreFilterError, setScoreFilterError] = useState<string | null>(null);
  const minScoreInput = useRef<HTMLInputElement>(null);
  const maxScoreInput = useRef<HTMLInputElement>(null);
  const scoreFiltered = appliedFilters.scores.min !== undefined || appliedFilters.scores.max !== undefined;
  const appliedQuery = appliedFilters.query;
  const followUpFiltered = appliedFilters.followUp.status !== 'all' || !!appliedFilters.followUp.from || !!appliedFilters.followUp.to;
  const [followUpFilterError, setFollowUpFilterError] = useState<string | null>(null);
  const followUpFromInput = useRef<HTMLInputElement>(null);
  const followUpToInput = useRef<HTMLInputElement>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedEditor, setSelectedEditor] = useState<QuickEditor | null>(null);
  const selectedEditorRef = useRef<QuickEditor | null>(null);
  const [quickEditorMutating, setQuickEditorMutating] = useState(false);
  const quickEditorPending = useRef(false);
  const quickEditorHeading = useRef<HTMLHeadingElement>(null);
  const [lanes, setLanes] = useState(initialLanes);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pending = useRef(new Set<ApplicationStatus>());
  const mounted = useRef(false);
  const mutationPending = useRef(false);
  const confirmationPending = useRef(false);
  const dragSession = useRef<DragSession | null>(null);
  const [dragged, setDragged] = useState<DragSession | null>(null);
  const [hovered, setHovered] = useState<ApplicationStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<string | null>(null);
  const focusRefresh = useRef(false);

  useEffect(() => {
    if (selectedEditor) quickEditorHeading.current?.focus();
    else if (restoreFocus.current?.startsWith('follow-up-') || restoreFocus.current?.startsWith('note-')) {
      const action = document.getElementById(restoreFocus.current);
      if (action instanceof HTMLButtonElement && !action.disabled) action.focus();
      else refreshButton.current?.focus();
      restoreFocus.current = null;
    }
  }, [selectedEditor]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; dragSession.current = null; };
  }, []);

  const clearDrag = useCallback(() => {
    dragSession.current = null;
    if (!mounted.current) return;
    setDragged(null);
    setHovered(null);
  }, []);

  const clearChange = useCallback(() => {
    confirmationPending.current = false;
    setChange(null);
  }, []);

  useEffect(() => { if (opening) clearDrag(); }, [opening, clearDrag]);

  useEffect(() => {
    if (change) confirmation.current?.focus();
    else if (restoreFocus.current) {
      const control = document.getElementById(restoreFocus.current);
      if (control instanceof HTMLButtonElement && !control.disabled) control.focus();
      else if (!refreshButton.current?.disabled) refreshButton.current?.focus();
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
      const { query, followUp, scores } = appliedFiltersRef.current;
      const response = await getAnalysisHistory(PAGE_SIZE + 1, offset, {
        application_status: status, ...(query ? { query } : {}),
        ...(followUp.status === 'all' ? {} : { has_follow_up: followUp.status === 'yes' }),
        ...(followUp.from ? { follow_up_from: followUp.from } : {}),
        ...(followUp.to ? { follow_up_to: followUp.to } : {}),
        ...(scores.min === undefined ? {} : { min_score: scores.min }),
        ...(scores.max === undefined ? {} : { max_score: scores.max }),
      });
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
    clearDrag();
    pending.current = new Set();
    setLanes(initialLanes());
    setRevision((current) => current + 1);
    if (!mutationPending.current) clearChange();
    applicationStatuses.forEach(({ value }) => { void loadLane(value, 0, epoch); });
  }, [loadLane, clearDrag, clearChange]);

  useEffect(() => {
    refresh();
    return () => { generation.current += 1; };
  }, [refresh, refreshKey]);

  const canChangeFilters = () => mounted.current && !opening && !quickEditorPending.current && !selectedEditorRef.current
    && !mutationPending.current && !confirmationPending.current;

  const applyBoardFilters = (next: BoardFilters) => {
    const current = appliedFiltersRef.current;
    if (current.query === next.query && current.followUp.status === next.followUp.status
      && current.followUp.from === next.followUp.from && current.followUp.to === next.followUp.to
      && current.scores.min === next.scores.min && current.scores.max === next.scores.max) return;
    appliedFiltersRef.current = next;
    setAppliedFilters(next);
    setError(null);
    setMessage(null);
    refresh();
  };

  const applySearch = (clear = false) => {
    if (!canChangeFilters()) return;
    const normalized = clear ? '' : draftQueryRef.current.trim().replace(/\s+/g, ' ');
    if (normalized.length > 200) {
      setSearchError('Use a board search of at most 200 characters.');
      return;
    }
    setSearchError(null);
    draftQueryRef.current = normalized;
    setDraftQuery(normalized);
    applyBoardFilters({ ...appliedFiltersRef.current, query: normalized });
  };

  const editFollowUpFilters = (next: BoardFollowUpFilters) => {
    draftFollowUpRef.current = next;
    setDraftFollowUp(next);
  };

  const applyFollowUpFilters = (clear = false) => {
    if (!canChangeFilters()) return;
    const next = clear ? emptyBoardFollowUpFilters() : draftFollowUpRef.current;
    const invalidNativeDate = !clear && [followUpFromInput.current, followUpToInput.current].some((input) => input && !input.validity.valid);
    const validationError = validateBoardFollowUpFilters(next);
    if (invalidNativeDate || validationError) {
      setFollowUpFilterError(validationError ?? 'Use valid follow-up calendar dates in YYYY-MM-DD format, from 0001-01-01 to 9999-12-31.');
      return;
    }
    setFollowUpFilterError(null);
    editFollowUpFilters(next);
    applyBoardFilters({ ...appliedFiltersRef.current, followUp: next });
  };

  const editScoreFilters = (next: BoardScoreFilters) => {
    draftScoresRef.current = next;
    setDraftScores(next);
  };

  const applyScoreFilters = (clear = false) => {
    if (!canChangeFilters()) return;
    const next = clear ? emptyBoardScoreFilters() : draftScoresRef.current;
    const parsed = parseBoardScoreFilters(next);
    const invalidNativeScore = !clear && [minScoreInput.current, maxScoreInput.current].some((input) => input && !input.validity.valid);
    if (parsed.error !== undefined || invalidNativeScore) {
      setScoreFilterError(parsed.error ?? 'Enter complete numeric match scores from 0 to 100.');
      return;
    }
    // A browser may show a partial number while exposing value="". Explicitly
    // clear native controls too, including when the controlled draft was empty.
    if (clear) [minScoreInput.current, maxScoreInput.current].forEach((input) => { if (input) input.value = ''; });
    setScoreFilterError(null);
    editScoreFilters(next);
    applyBoardFilters({ ...appliedFiltersRef.current, scores: parsed.bounds });
  };

  // Both native drops and the selector use the same confirmation gate. Neither
  // path reads tracking or writes persistence until the user confirms.
  const prepareChange = (next: Change) => {
    if (!mounted.current || opening || quickEditorPending.current || mutationPending.current || confirmationPending.current
      || next.from === next.to || !applicationStatuses.some(({ value }) => value === next.to)
      || !lanes[next.from]?.items.some((item) => item.analysis_id === next.item.analysis_id)) return;
    confirmationPending.current = true;
    clearDrag();
    setError(null);
    setMessage(null);
    setChange(next);
  };

  const startDrag = (event: DragEvent<HTMLButtonElement>, item: SavedAnalysisSummary, from: ApplicationStatus) => {
    if (!mounted.current || opening || quickEditorPending.current || mutationPending.current || confirmationPending.current
      || !lanes[from].items.some((current) => current.analysis_id === item.analysis_id)) {
      event.preventDefault();
      return;
    }
    clearDrag();
    // getRandomValues also works on HTTP installations, unlike randomUUID.
    const marker = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const session: DragSession = { item, from, epoch: generation.current, marker };
    // The transferable marker has no record identifiers or saved user data.
    // Authoritative source metadata stays in this component's memory.
    event.dataTransfer.clearData();
    event.dataTransfer.setData(DRAG_TYPE, session.marker);
    event.dataTransfer.effectAllowed = 'move';
    dragSession.current = session;
    setDragged(session);
  };

  const validDestination = (event: DragEvent<HTMLElement>, to: ApplicationStatus) => {
    const session = dragSession.current;
    return mounted.current && !opening && !quickEditorPending.current && !mutationPending.current && !confirmationPending.current
      && session !== null && session.epoch === generation.current && session.from !== to
      && applicationStatuses.some(({ value }) => value === to)
      && lanes[session.from].items.some((item) => item.analysis_id === session.item.analysis_id)
      // Drag-over uses types because browsers protect getData until drop.
      && event.dataTransfer.types.length === 1 && event.dataTransfer.types.includes(DRAG_TYPE);
  };

  const drop = (event: DragEvent<HTMLElement>, to: ApplicationStatus) => {
    const session = dragSession.current;
    const valid = validDestination(event, to) && session !== null
      && event.dataTransfer.getData(DRAG_TYPE) === session.marker;
    clearDrag();
    if (!valid || !session) return;
    event.preventDefault();
    prepareChange({ item: session.item, from: session.from, to, focusId: `drag-${session.item.analysis_id}` });
  };

  const cancel = () => {
    if (mutationPending.current) return;
    restoreFocus.current = change?.focusId ?? `review-${change?.item.analysis_id}`;
    clearDrag();
    clearChange();
    setError(null);
  };

  const submit = async () => {
    if (!change || change.from === change.to || mutationPending.current || quickEditorPending.current) return;
    mutationPending.current = true;
    setUpdating(true);
    setError(null);
    setMessage(null);
    try {
      const current = await getAnalysisTracking(change.item.analysis_id);
      if (!mounted.current) return;
      if (current.application_status !== change.from) {
        setError('This application status changed elsewhere. The board has been refreshed; review the current status before trying again.');
        clearChange();
        focusRefresh.current = true;
        refresh();
        return;
      }
      await updateAnalysisTracking(change.item.analysis_id, change.to);
      if (!mounted.current) return;
      setMessage(`Application status changed to ${statusLabel(change.to)}.`);
      clearChange();
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

  const canEdit = () => mounted.current && !opening && !mutationPending.current
    && !confirmationPending.current && !quickEditorPending.current;

  const onEditorMutatingChange = (value: boolean) => {
    quickEditorPending.current = value;
    setQuickEditorMutating(value);
    onQuickEditorMutatingChange?.(value);
  };

  const openEditor = (mode: QuickEditor['mode'], item: SavedAnalysisSummary) => {
    if (!canEdit()) return;
    clearDrag();
    const next = { mode, item };
    selectedEditorRef.current = next;
    setSelectedEditor(next);
    quickEditorHeading.current?.focus();
  };

  return <section className="pipeline-board" aria-labelledby="pipeline-board-title"
    onKeyDown={(event) => { if (event.key === 'Escape') clearDrag(); }}>
    <div className="history-heading">
      <h3 id="pipeline-board-title">Application Pipeline Board</h3>
      <button ref={refreshButton} type="button" disabled={updating || quickEditorMutating} onClick={() => { if (quickEditorPending.current) return; setError(null); setMessage(null); refresh(); }}>Refresh board</button>
    </div>
    <p>Saved analysis snapshots, grouped by recorded status. History filters affect List view only. Each snapshot is a separate card; records without tracking appear in Not applied.</p>
    <p>Each lane loads 10 cards at a time, newest saved first. Changes in other sessions may require Refresh board.</p>
    <p id="pipeline-drag-instructions" className="pipeline-drag-instructions">Use the Drag to change status handle to drag a card to another lane to review a status change. On keyboard or touch devices, choose a new status on the card and select Review change. Activating the handle focuses the status selector.</p>
    <form className="pipeline-search" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
      <label htmlFor="board-search">Search board by job title or company</label>
      <input id="board-search" type="search" value={draftQuery}
        aria-invalid={searchError ? true : undefined}
        aria-describedby={`board-search-help${searchError ? ' board-search-error' : ''}`}
        onChange={(event) => { draftQueryRef.current = event.target.value; setDraftQuery(event.target.value); }} />
      <div className="export-actions">
        <button type="submit" disabled={opening || updating || change !== null || selectedEditor !== null || quickEditorMutating}>Apply search</button>
        <button type="button" disabled={opening || updating || change !== null || selectedEditor !== null || quickEditorMutating}
          onClick={() => applySearch(true)}>Clear search</button>
      </div>
    </form>
    <p id="board-search-help">Apply or press Enter to search saved title/company metadata in all seven lanes. Close quick editing before applying or clearing search.</p>
    <p role={appliedQuery ? 'status' : undefined} aria-live="polite" className="pipeline-search-status">{appliedQuery ? `Applied board search: ${appliedQuery}` : 'No board search applied.'}</p>
    {searchError && <p id="board-search-error" role="alert">{searchError}</p>}
    <form className="pipeline-follow-up-filters" aria-labelledby="board-follow-up-filters-title" noValidate
      onSubmit={(event) => { event.preventDefault(); applyFollowUpFilters(); }}>
      <h4 id="board-follow-up-filters-title">Board follow-up filters</h4>
      <div className="pipeline-filter-controls">
        <label>Board follow-up status
          <select value={draftFollowUp.status} aria-invalid={followUpFilterError ? true : undefined}
            aria-describedby={`board-follow-up-help${followUpFilterError ? ' board-follow-up-error' : ''}`}
            onChange={(event) => editFollowUpFilters({ ...draftFollowUpRef.current, status: event.target.value as BoardFollowUpFilters['status'] })}>
            <option value="all">All</option><option value="yes">Scheduled</option><option value="no">Not scheduled</option>
          </select>
        </label>
        <label>Board follow-up from
          <input ref={followUpFromInput} type="date" min="0001-01-01" max="9999-12-31" value={draftFollowUp.from}
            aria-invalid={followUpFilterError ? true : undefined} aria-describedby={`board-follow-up-help${followUpFilterError ? ' board-follow-up-error' : ''}`}
            onChange={(event) => editFollowUpFilters({ ...draftFollowUpRef.current, from: event.target.value })} />
        </label>
        <label>Board follow-up to
          <input ref={followUpToInput} type="date" min="0001-01-01" max="9999-12-31" value={draftFollowUp.to}
            aria-invalid={followUpFilterError ? true : undefined} aria-describedby={`board-follow-up-help${followUpFilterError ? ' board-follow-up-error' : ''}`}
            onChange={(event) => editFollowUpFilters({ ...draftFollowUpRef.current, to: event.target.value })} />
        </label>
      </div>
      <div className="export-actions">
        <button type="submit" disabled={opening || updating || change !== null || selectedEditor !== null || quickEditorMutating}>Apply filters</button>
        <button type="button" disabled={opening || updating || change !== null || selectedEditor !== null || quickEditorMutating}
          onClick={() => applyFollowUpFilters(true)}>Clear follow-up filters</button>
      </div>
      <p id="board-follow-up-help">These are draft values until Apply filters or Enter. Date bounds include both endpoints and select scheduled records, including with All. Close quick editing before applying or clearing filters.</p>
      <p aria-live="polite" role={followUpFiltered ? 'status' : undefined}>Applied board follow-up filters: {appliedFilters.followUp.status === 'yes' ? 'Scheduled' : appliedFilters.followUp.status === 'no' ? 'Not scheduled' : 'All'}{appliedFilters.followUp.from ? `; from ${appliedFilters.followUp.from}` : ''}{appliedFilters.followUp.to ? `; to ${appliedFilters.followUp.to}` : ''}.</p>
      {followUpFilterError && <p id="board-follow-up-error" role="alert">{followUpFilterError}</p>}
    </form>
    <form className="pipeline-score-filters" aria-labelledby="board-score-filters-title" noValidate
      onSubmit={(event) => { event.preventDefault(); applyScoreFilters(); }}>
      <h4 id="board-score-filters-title">Board match score filters</h4>
      <div className="pipeline-filter-controls">
        <label htmlFor="board-min-score">Minimum match score (%) (Board)
          <input id="board-min-score" ref={minScoreInput} type="number" min="0" max="100" step="any" value={draftScores.min}
            aria-invalid={scoreFilterError ? true : undefined} aria-describedby={`board-score-help${scoreFilterError ? ' board-score-error' : ''}`}
            onChange={(event) => editScoreFilters({ ...draftScoresRef.current, min: event.target.value })} />
        </label>
        <label htmlFor="board-max-score">Maximum match score (%) (Board)
          <input id="board-max-score" ref={maxScoreInput} type="number" min="0" max="100" step="any" value={draftScores.max}
            aria-invalid={scoreFilterError ? true : undefined} aria-describedby={`board-score-help${scoreFilterError ? ' board-score-error' : ''}`}
            onChange={(event) => editScoreFilters({ ...draftScoresRef.current, max: event.target.value })} />
        </label>
      </div>
      <div className="export-actions">
        <button type="submit" disabled={opening || updating || change !== null || selectedEditor !== null || quickEditorMutating}>Apply score filters</button>
        <button type="button" disabled={opening || updating || change !== null || selectedEditor !== null || quickEditorMutating}
          onClick={() => applyScoreFilters(true)}>Clear score filters</button>
      </div>
      <p id="board-score-help">Draft scores apply only on Apply score filters or Enter. Bounds are inclusive, from 0 to 100; decimals are supported. Either bound excludes unscored applications, even 0 or 100. Without bounds, scored and unscored applications are eligible. Scores describe deterministic matching, not hiring probabilities. Close quick editing before applying or clearing filters.</p>
      <p aria-live="polite" role={scoreFiltered ? 'status' : undefined}>{scoreFiltered
        ? `Applied board match scores: minimum ${appliedFilters.scores.min === undefined ? 'not set' : `${appliedFilters.scores.min}%`}; maximum ${appliedFilters.scores.max === undefined ? 'not set' : `${appliedFilters.scores.max}%`}.`
        : 'No board match score filters applied.'}</p>
      {scoreFilterError && <p id="board-score-error" role="alert">{scoreFilterError}</p>}
    </form>
    {selectedEditor && <section className="pipeline-quick-editor" aria-labelledby="quick-editor-title">
      <h4 id="quick-editor-title" tabIndex={-1} ref={quickEditorHeading}>{selectedEditor.mode === 'note' ? 'Quick application note' : 'Quick follow-up'}</h4>
      <p>{selectedEditor.item.job_title} — {selectedEditor.item.company_name ?? 'Company not supplied'}</p>
      <p>Close or switch editors to discard unsaved changes.</p>
      {selectedEditor.mode === 'note'
        ? <ApplicationNoteEditor key={`note-${selectedEditor.item.analysis_id}`} analysisId={selectedEditor.item.analysis_id}
          disabled={opening || updating || change !== null} canMutate={() => canEdit() && selectedEditorRef.current === selectedEditor} onMutatingChange={onEditorMutatingChange}
          refreshKey={revision} />
        : <ApplicationFollowUpEditor key={`follow-up-${selectedEditor.item.analysis_id}`} analysisId={selectedEditor.item.analysis_id}
          disabled={opening || updating || change !== null} canMutate={() => canEdit() && selectedEditorRef.current === selectedEditor} onMutatingChange={onEditorMutatingChange}
          onUpdated={async () => { refresh(); await onFollowUpUpdated?.(); }} />}
      <button type="button" disabled={quickEditorMutating} onClick={() => {
        if (quickEditorPending.current) return;
        restoreFocus.current = `${selectedEditor.mode}-${selectedEditor.item.analysis_id}`;
        selectedEditorRef.current = null;
        setSelectedEditor(null);
      }}>Close editing</button>
    </section>}
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
        const destination = dragged !== null && dragged.from !== value && !opening && !updating && change === null;
        return <section className={`pipeline-lane${destination ? ' pipeline-lane-drop-target' : ''}${destination && hovered === value ? ' pipeline-lane-drag-over' : ''}`}
          aria-labelledby={`lane-${value}`} key={value}
          onDragEnter={(event) => { if (validDestination(event, value)) { event.preventDefault(); setHovered(value); } }}
          onDragOver={(event) => {
            if (validDestination(event, value)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setHovered(value); }
            else { event.dataTransfer.dropEffect = 'none'; setHovered(null); }
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
              setHovered((current) => current === value ? null : current);
            }
          }} onDrop={(event) => drop(event, value)}>
          <h4 id={`lane-${value}`}>{label}</h4>
          {destination && <p className="pipeline-drop-instruction">Drop to review status change</p>}
          {lane.loading && <p role="status">Loading {label}...</p>}
          {lane.error && <div role="alert"><p>{lane.error}</p><button type="button" disabled={lane.loading || updating} onClick={() => void loadLane(value, lane.offset, generation.current)}>Retry {label}</button></div>}
          {!lane.loading && !lane.error && lane.items.length === 0 && <p>{appliedQuery || followUpFiltered || scoreFiltered ? 'No matching saved analyses' : 'No saved analyses'} in {label}.</p>}
          {lane.items.length > 0 && <ul className="pipeline-cards">
            {lane.items.map((item) => <BoardCard key={`${revision}-${item.analysis_id}`} item={item} status={value}
              opening={opening} disabled={updating || quickEditorMutating || change !== null}
              onOpen={(id) => { if (!quickEditorPending.current) onOpen(id); }}
              onFollowUp={(item) => openEditor('follow-up', item)}
              onNote={(item) => openEditor('note', item)}
              dragging={dragged?.item.analysis_id === item.analysis_id && dragged.from === value}
              onDragStart={(event) => startDrag(event, item, value)} onDragEnd={clearDrag} onReview={prepareChange} />)}
          </ul>}
          {lane.more && !lane.error && <button type="button" disabled={lane.loading || updating} onClick={() => void loadLane(value, lane.offset, generation.current)}>Load more {label}</button>}
        </section>;
      })}
    </div>
  </section>;
}
