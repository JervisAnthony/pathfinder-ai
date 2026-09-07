import { useEffect, useState } from 'react'
import { AnalysisForm } from './features/analysis/AnalysisForm'
import { AnalysisResults } from './features/analysis/AnalysisResults'
import { AnalysisHistory } from './features/history/AnalysisHistory'
import { analyzeCandidateJob, ApiError, getCapabilities } from './api/pathfinder'
import { AnalysisRequest, AnalysisResponse, PathfinderCapabilities } from './types/api'
import './App.css'

function App() {
  const [view, setView] = useState<'analysis' | 'history'>('analysis')
  const [results, setResults] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<PathfinderCapabilities | null>(null)
  const [capabilityFailed, setCapabilityFailed] = useState(false)

  useEffect(() => {
    let active = true
    getCapabilities().then((result) => {
      if (active) setCapabilities(result)
    }).catch(() => {
      if (active) setCapabilityFailed(true)
    })
    return () => { active = false }
  }, [])

  const handleAnalyze = async (request: AnalysisRequest) => {
    setIsLoading(true)
    setError(null)
    setResults(null)

    try {
      setResults(await analyzeCandidateJob(request))
    } catch (caught) {
      if (caught instanceof ApiError) {
        const messages: Record<string, string> = {
          persistence_unavailable: 'Analysis persistence is not configured on this Pathfinder server.',
          ai_provider_unavailable: 'AI enrichment is unavailable on this Pathfinder server. Uncheck optional AI enrichment and retry deterministic analysis.',
          ai_provider_error: 'AI enrichment could not be completed. Uncheck optional AI enrichment and retry deterministic analysis.',
        }
        setError(messages[caught.code ?? ''] ?? caught.message)
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
          <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} error={error}
            aiEnrichmentAvailable={capabilities?.ai_enrichment_available ?? false}
            aiAvailabilityMessage={capabilityFailed
              ? 'AI availability could not be checked. Deterministic analysis remains available.'
              : capabilities === null ? 'Checking AI enrichment availability…' : undefined} />
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
