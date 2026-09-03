import { AnalysisResponse, SavedAnalysisDetail } from '../../types/api';

export function savedAnalysisDetailToAnalysisResponse(
  detail: SavedAnalysisDetail,
): AnalysisResponse {
  return {
    score: detail.score,
    explanation: detail.explanation,
    interview_preparation: detail.interview_preparation,
    learning_recommendations: detail.learning_recommendations ?? { items: [] },
    ai_enrichment: detail.ai_enrichment,
    saved_analysis: {
      analysis_id: detail.analysis_id,
      created_at: detail.created_at,
    },
  };
}
