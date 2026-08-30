import { useState } from 'react'
import { AnalysisForm } from './features/analysis/AnalysisForm'
import { AnalysisResults } from './features/analysis/AnalysisResults'
import { analyzeCandidateJob, ApiError } from './api/pathfinder'
import { AnalysisRequest, AnalysisResponse } from './types/api'
import './App.css'

function App() {
  const [results, setResults] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async (request: AnalysisRequest) => {
    setIsLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await analyzeCandidateJob(request)
      setResults(response)
    } catch (err) {
      if (err instanceof ApiError) {
         setError(err.message)
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

      <main className="app-main">
        {!results && (
           <AnalysisForm onSubmit={handleAnalyze} isLoading={isLoading} error={error} />
        )}

        {results && (
          <div className="results-view">
             <button className="back-btn" onClick={() => setResults(null)}>
                ← New Analysis
             </button>
             <AnalysisResults results={results} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
