import { useState } from 'react'
import { AnalysisForm } from './features/analysis/AnalysisForm'
import { AnalysisResults } from './features/analysis/AnalysisResults'
import { AnalysisHistory } from './features/history/AnalysisHistory'
import { analyzeCandidateJob, ApiError } from './api/pathfinder'
import { AnalysisRequest, AnalysisResponse } from './types/api'
import './App.css'

function App() {
  const [view, setView] = useState<'analysis' | 'history'>('analysis')
  const [results, setResults] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async (request: AnalysisRequest) => {
    setIsLoading(true)
    setError(null)
    setResults(null)

    try {
      setResults(await analyzeCandidateJob(request))
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.code === 'persistence_unavailable'
          ? 'Analysis persistence is not configured on this Pathfinder server.'
          : caught.message)
      } else {
        setError('An unexpected error occurred during analysis.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Pathfinder AI</h1>
        <p>AI-powered explainable candidate-role analysis.</p>
      </header>

      <nav className="app-navigation" aria-label="Primary navigation">
        <button type="button" aria-pressed={view === 'analysis'} onClick={() => setView('analysis')}>
          New Analysis
        </button>
        <button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}>
          History
        </button>
      </nav>

      <main className="app-main">
        {view === 'analysis' && !results && (
          <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} error={error} />
        )}

        {view === 'analysis' && results && (
          <div className="results-view">
            <button type="button" className="back-btn" onClick={() => setResults(null)}>
              ← New Analysis
            </button>
            {results.saved_analysis && (
              <div className="save-confirmation" role="status">
                <span>Analysis saved to history.</span>
                <button type="button" onClick={() => setView('history')}>View History</button>
              </div>
            )}
            <AnalysisResults results={results} />
          </div>
        )}

        {view === 'history' && <AnalysisHistory />}
      </main>
    </div>
  )
}

export default App
