import { useCallback, useEffect, useState } from 'react';
import { ApiError, getAnalysisHistory, getSavedAnalysis } from '../../api/pathfinder';
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

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAnalysisHistory(PAGE_SIZE, offset);
      setItems(response.items);
    } catch (caught) {
      setItems([]);
      setError(errorMessage(caught, 'history'));
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

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

  if (detail) {
    return <SavedDetailView detail={detail} onBack={() => setDetail(null)} />;
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

      {loading && <p role="status">Loading saved analyses…</p>}
      {!loading && error && <div className="history-message error-message" role="alert">{error}</div>}
      {detailLoading && <p role="status">Loading saved analysis…</p>}
      {detailError && <div className="history-message error-message" role="alert">{detailError}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="history-message">
          <h3>No saved analyses yet.</h3>
          <p>Run a new analysis and enable “Save this analysis to local history” to keep a snapshot here.</p>
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
