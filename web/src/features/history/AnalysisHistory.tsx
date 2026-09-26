import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisHistoryFilters } from '../../api/pathfinder';
import {
  ApiError,
  deleteSavedAnalysis,
  getAnalysisHistory,
  getSavedAnalysis,
} from '../../api/pathfinder';
import { SavedAnalysisDetail, SavedAnalysisSummary } from '../../types/api';
import { formatSavedTimestamp } from './formatting';
import { SavedAnalysisDetail as SavedDetailView } from './SavedAnalysisDetail';
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
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [filters, setFilters] = useState<AnalysisHistoryFilters>({});
  const [filterError, setFilterError] = useState<string | null>(null);
  const historyRequest = useRef(0);
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
    });
  };

  const clearFilters = () => {
    setQuery(''); setAi('all'); setMinScore(''); setMaxScore('');
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
    if (offset > 0 && items.length === 1) {
      setOffset(Math.max(0, offset - PAGE_SIZE));
    } else {
      await loadHistory();
    }
  };

  if (detail) {
    return (
      <SavedDetailView
        detail={detail}
        onBack={() => setDetail(null)}
        onDelete={deleteDetail}
      />
    );
  }

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
