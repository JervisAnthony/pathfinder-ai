"""
FastAPI routes for Pathfinder AI analysis.
"""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from pathfinder_ai.api.errors import (
    AIProviderExecutionError,
    AIProviderUnavailableError,
)
from pathfinder_ai.api.schemas import (
    AnalysisRequestSchema,
    AnalysisResponseSchema,
    map_analysis_response,
    map_candidate_profile,
    map_job_description,
)
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentRequest,
    AIEnrichmentService,
)
from pathfinder_ai.application.interview_preparation import (
    DeterministicInterviewPreparer,
)
from pathfinder_ai.domain.matching import DeterministicMatcher

router = APIRouter(prefix="/api/v1")


class HealthResponse(BaseModel):
    status: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Minimal health check endpoint."""
    return HealthResponse(status="ok")


@router.post("/analysis", response_model=AnalysisResponseSchema)
async def analyze(payload: AnalysisRequestSchema, request: Request) -> Any:
    """
    Perform a complete matching and interview preparation analysis.
    Optionally include AI enrichment if requested and configured.
    """
    # 1. Map input to domain
    candidate_profile = map_candidate_profile(payload.candidate_profile)
    job_description = map_job_description(payload.job_description)

    # 2. Run deterministic analysis
    matcher = DeterministicMatcher()
    match_score = matcher.match(candidate_profile, job_description)
    match_explanation = matcher.explain(candidate_profile, job_description)

    preparer = DeterministicInterviewPreparer()
    interview_prep = preparer.prepare(
        candidate_profile, job_description, match_explanation
    )

    # 3. Optional AI Enrichment
    ai_result = None
    if payload.include_ai_enrichment:
        provider = getattr(request.app.state, "ai_provider", None)
        if provider is None:
            raise AIProviderUnavailableError()

        enrichment_service = AIEnrichmentService(provider=provider)
        enrichment_request = AIEnrichmentRequest(
            job_description=job_description,
            match_explanation=match_explanation,
            interview_preparation=interview_prep,
        )

        try:
            ai_result = enrichment_service.enrich(enrichment_request)
        except Exception as e:
            # Mask internal exception details by raising our custom execution error
            raise AIProviderExecutionError() from e

    # 4. Map output to response schema
    return map_analysis_response(
        score=match_score,
        explanation=match_explanation,
        interview_preparation=interview_prep,
        ai_enrichment=ai_result,
    )
