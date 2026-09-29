import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisHistoryFilters } from '../../api/pathfinder';
import {
  ApiError,
  compareSavedAnalyses,
  deleteSavedAnalysis,
  getAnalysisHistory,
  getSavedAnalysis,
} from '../../api/pathfinder';
import { ApplicationStatus, SavedAnalysisDetail, SavedAnalysisSummary, SavedAnalysisComparison } from '../../types/api';
import { formatSavedTimestamp } from './formatting';
import { SavedAnalysisDetail as SavedDetailView } from './SavedAnalysisDetail';
import { SavedAnalysisComparison as ComparisonView } from './SavedAnalysisComparison';
import { applicationStatuses, statusLabel } from './status';
import './History.css';

const PAGE_SIZE = 20;

function errorMessage(error: unknown, action: 'history' | 'detail'): string {
  if (error instanceof ApiError && error.code === 'persistence_unavailable') {
    return 'Analysis history is unavailable because persistence is not configured on this Pathfinder server.';
  }
  if (error instanceof ApiError && error.code === 'analysis_not_found') {
    return 'This saved analysis could not be found.';
  }
  return action === 'history'
    ? 'Pathfinder could not load analysis history. Please try again.'
    : 'Pathfinder could not load this saved analysis. Please try again.';
}

export function AnalysisHistory() {
  const [items, setItems] = useState<SavedAnalysisSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SavedAnalysisDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [ai, setAi] = useState('all');
  const [status, setStatus] = useState<ApplicationStatus | 'all'>('all');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [filters, setFilters] = useState<AnalysisHistoryFilters>({});
  const [filterError, setFilterError] = useState<string | null>(null);
  const historyRequest = useRef(0);
  const [selection, setSelection] = useState<{ id: string; title: string } | null>(null);
  const [comparison, setComparison] = useState<SavedAnalysisComparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const comparisonPending = useRef(false);
  const filtered = Object.keys(filters).length > 0;

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = query.trim().replace(/\s+/g, ' ');
    const min = minScore === '' ? undefined : Number(minScore);
    const max = maxScore === '' ? undefined : Number(maxScore);
    if (normalized.length > 200 || [min, max].some((score) => score !== undefined
      && (!Number.isFinite(score) || score < 0 || score > 100))
      || (min !== undefined && max !== undefined && min > max)) {
      setFilterError('Use a search of at most 200 characters and scores from 0 to 100, with minimum no greater than maximum.');
      return;
    }
    setFilterError(null);
    setOffset(0);
    setFilters({
      ...(normalized ? { query: normalized } : {}),
      ...(ai === 'all' ? {} : { ai_enriched: ai === 'yes' }),
      ...(min === undefined ? {} : { min_score: min }),
      ...(max === undefined ? {} : { max_score: max }),
      ...(status === 'all' ? {} : { application_status: status }),
    });
  };

  const clearFilters = () => {
    setQuery(''); setAi('all'); setStatus('all'); setMinScore(''); setMaxScore('');
    setFilterError(null); setOffset(0); setFilters({});
  };

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await (Object.keys(filters).length
        ? getAnalysisHistory(PAGE_SIZE, offset, filters)
        : getAnalysisHistory(PAGE_SIZE, offset));
      if (requestId !== historyRequest.current) return;
      setItems(response.items);
    } catch (caught) {
      if (requestId !== historyRequest.current) return;
      setItems([]);
      setError(errorMessage(caught, 'history'));
    } finally {
      if (requestId === historyRequest.current) setLoading(false);
    }
  }, [offset, filters]);

  useEffect(() => {
    void loadHistory();
    return () => { historyRequest.current += 1; };
  }, [loadHistory]);

  const openDetail = async (analysisId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await getSavedAnalysis(analysisId));
      setComparisonError(null);
    } catch (caught) {
      setDetailError(errorMessage(caught, 'detail'));
    } finally {
      setDetailLoading(false);
    }
  };

  const deleteDetail = async (analysisId: string) => {
    await deleteSavedAnalysis(analysisId);
    setDetail(null);
    setDetailError(null);
    if (selection?.id === analysisId) setSelection(null);
    if (comparison?.left.analysis_id === analysisId || comparison?.right.analysis_id === analysisId) setComparison(null);
    if (offset > 0 && items.length === 1) {
      setOffset(Math.max(0, offset - PAGE_SIZE));
    } else {
      await loadHistory();
    }
  };

  const refreshAfterStatusUpdate = async () => {
    const current = await getAnalysisHistory(PAGE_SIZE, offset, filters);
    if (offset > 0 && current.items.length === 0) {
      setOffset(Math.max(0, offset - PAGE_SIZE));
    } else {
      historyRequest.current += 1;
      setItems(current.items);
      setError(null);
      setLoading(false);
    }
  };

  const clearComparison = () => {
    setSelection(null); setComparison(null); setComparisonError(null);
  };

  const compare = async () => {
    if (!selection || !detail || selection.id === detail.analysis_id || comparisonPending.current) return;
    comparisonPending.current = true;
    setComparing(true); setComparisonError(null);
    try {
      setComparison(await compareSavedAnalyses(selection.id, detail.analysis_id));
      setDetail(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'analysis_not_found') {
        setSelection(null); setComparison(null);
        setComparisonError('One or both saved analyses no longer exist.');
      } else if (caught instanceof ApiError && caught.code === 'persistence_unavailable') {
        setComparisonError('Saved analysis comparison is unavailable because persistence is not configured on this Pathfinder server.');
      } else {
        setComparisonError('Pathfinder could not compare these saved analyses. Please try again.');
      }
    } finally {
      comparisonPending.current = false; setComparing(false);
    }
  };

  if (detail) {
    return (
      <SavedDetailView
        detail={detail}
        onBack={() => setDetail(null)}
        backLabel={comparison ? '← Back to Comparison' : undefined}
        onDelete={deleteDetail}
        onStatusUpdated={refreshAfterStatusUpdate}
        key={detail.analysis_id}
        comparisonSelectionId={selection?.id}
        onSelectComparison={() => { setSelection({ id: detail.analysis_id, title: detail.job_description.title.title }); setComparisonError(null); }}
        onClearComparison={clearComparison}
        onCompare={() => void compare()}
        comparing={comparing}
        comparisonError={comparisonError}
      />
    );
  }

  if (comparison) return <ComparisonView comparison={comparison} onBack={() => setComparison(null)} onClear={clearComparison} onOpen={(id) => void openDetail(id)} opening={detailLoading} error={detailError} />;

  return (
    <section className="history-view" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Local snapshots</p>
          <h2 id="history-title">Analysis History</h2>
        </div>
        <button type="button" className="secondary-btn" onClick={() => void loadHistory()} disabled={loading}>
          Refresh
        </button>
      </div>

      <p className="history-privacy-copy">
        Saved analyses remain in configured persistence until deleted. Deletion removes one selected
        snapshot from Pathfinder history; it is not a secure filesystem wipe.
      </p>

      {selection && <div className="comparison-selection"><p role="status">Selected for comparison: {selection.title}</p><button type="button" onClick={clearComparison}>Clear comparison selection</button></div>}
      <form className="history-filters" onSubmit={applyFilters}>
        <label>Search job title or company
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>AI enrichment
          <select value={ai} onChange={(event) => setAi(event.target.value)}>
            <option value="all">All analyses</option>
            <option value="yes">With AI enrichment</option>
            <option value="no">Without AI enrichment</option>
          </select>
        </label>
        <label>Application status
          <select value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus | 'all')}>
            <option value="all">All statuses</option>
            {applicationStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Minimum score
          <input type="number" min="0" max="100" step="any" value={minScore} onChange={(event) => setMinScore(event.target.value)} />
        </label>
        <label>Maximum score
          <input type="number" min="0" max="100" step="any" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} />
        </label>
        <button type="submit">Apply filters</button>
        <button type="button" onClick={clearFilters}>Clear filters</button>
      </form>
      <p>Search matches saved job titles and company names. Score bounds include their endpoints; unscored analyses are excluded when a score filter is active.</p>
      {filterError && <p role="alert">{filterError}</p>}

      {loading && <p role="status">Loading saved analyses…</p>}
      {!loading && error && <div className="history-message error-message" role="alert">{error}</div>}
      {detailLoading && <p role="status">Loading saved analysis…</p>}
      {detailError && <div className="history-message error-message" role="alert">{detailError}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="history-message">
          <h3>{filtered ? 'No saved analyses match these filters.' : 'No saved analyses yet.'}</h3>
          <p>{filtered ? 'Change or clear the filters to view more saved analyses.' : 'Run a new analysis and enable “Save this analysis to local history” to keep a snapshot here.'}</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.analysis_id}>
              <button type="button" onClick={() => void openDetail(item.analysis_id)} disabled={detailLoading}>
                <span>
                  <strong>{item.job_title}</strong>
                  <small>{item.company_name ?? 'Company not supplied'}</small>
                </span>
                <span>
                  <strong>{item.score === null ? 'Not scored' : `${item.score}% match`}</strong>
                  <small>{formatSavedTimestamp(item.created_at)}</small>
                  <small>{item.ai_enriched ? 'Includes AI enrichment' : 'Deterministic analysis'}</small>
                  <small>Status: {statusLabel(item.application_status)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && (
        <nav className="pagination" aria-label="History pagination">
          <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>Previous</button>
          <span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={items.length < PAGE_SIZE}>Next</button>
        </nav>
      )}
    </section>
  );
}
