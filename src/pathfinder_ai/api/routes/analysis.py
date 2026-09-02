"""FastAPI routes for Pathfinder AI analysis."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from pathfinder_ai.api.errors import (
    AIProviderExecutionError,
    AIProviderUnavailableError,
    AnalysisNotFoundError,
    DomainValidationError,
    ErrorResponseSchema,
    PersistenceUnavailableError,
)
from pathfinder_ai.api.schemas import (
    AnalysisHistoryResponseSchema,
    AnalysisRequestSchema,
    AnalysisResponseSchema,
    SavedAnalysisDetailSchema,
    SavedAnalysisMetadataSchema,
    SavedAnalysisSummarySchema,
    map_ai_enrichment_to_schema,
    map_analysis_response,
    map_candidate_profile,
    map_domain_candidate_to_schema,
    map_domain_job_to_schema,
    map_explanation_to_schema,
    map_interview_prep_to_schema,
    map_job_description,
    map_learning_recommendations_to_schema,
    map_score_to_schema,
)
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentRequest,
    AIEnrichmentService,
)
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryService,
    AnalysisRepository,
)
from pathfinder_ai.application.interview_preparation import (
    DeterministicInterviewPreparer,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
)
from pathfinder_ai.domain.matching import DeterministicMatcher

router = APIRouter(prefix="/api/v1")


class HealthResponse(BaseModel):
    status: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Minimal health check endpoint."""
    return HealthResponse(status="ok")


@router.post(
    "/analysis",
    response_model=AnalysisResponseSchema,
    responses={
        422: {
            "model": ErrorResponseSchema,
            "description": "Request or domain validation failed.",
        },
        502: {
            "model": ErrorResponseSchema,
            "description": "AI enrichment provider execution failed.",
        },
        503: {
            "model": ErrorResponseSchema,
            "description": "AI provider or persistence is unavailable.",
        },
    },
)
async def analyze(
    payload: AnalysisRequestSchema, request: Request
) -> AnalysisResponseSchema:
    """
    Perform a complete matching and interview preparation analysis.
    Optionally include AI enrichment if requested and configured.
    """
    # 1. Map input to domain
    try:
        candidate_profile = map_candidate_profile(payload.candidate_profile)
        job_description = map_job_description(payload.job_description)
    except ValueError as exc:
        raise DomainValidationError() from exc

    # 2. Run deterministic analysis
    matcher = DeterministicMatcher()
    match_explanation = matcher.explain(candidate_profile, job_description)
    match_score = match_explanation.score

    preparer = DeterministicInterviewPreparer()
    interview_prep = preparer.prepare(
        candidate_profile, job_description, match_explanation
    )

    recommender = DeterministicLearningRecommender()
    learning_recommendations = recommender.recommend(
        candidate_profile, job_description, match_explanation
    )

    # 3. Check the requested persistence prerequisite before optional AI work.
    repository: AnalysisRepository | None = None
    if payload.save_analysis:
        repository = getattr(request.app.state, "analysis_repository", None)
        if repository is None:
            raise PersistenceUnavailableError()

    # 4. Optional AI Enrichment
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

    # 5. Persistence (Explicit Opt-In)
    saved_analysis_metadata = None
    if repository is not None:
        history_service = AnalysisHistoryService(repository=repository)
        saved = history_service.save_analysis(
            candidate_profile=candidate_profile,
            job_description=job_description,
            match_explanation=match_explanation,
            interview_preparation=interview_prep,
            ai_enrichment=ai_result,
            learning_recommendations=learning_recommendations,
        )
        saved_analysis_metadata = SavedAnalysisMetadataSchema(
            analysis_id=saved.analysis_id,
            created_at=saved.created_at,
        )

    # 6. Map output to response schema
    return map_analysis_response(
        score=match_score,
        explanation=match_explanation,
        interview_preparation=interview_prep,
        learning_recommendations=learning_recommendations,
        ai_enrichment=ai_result,
        saved_analysis_metadata=saved_analysis_metadata,
    )


@router.get(
    "/analyses",
    response_model=AnalysisHistoryResponseSchema,
    responses={
        422: {
            "model": ErrorResponseSchema,
            "description": "Pagination validation failed.",
        },
        503: {
            "model": ErrorResponseSchema,
            "description": "Persistence is unavailable.",
        },
    },
)
async def list_analyses(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AnalysisHistoryResponseSchema:
    """List recent saved analyses."""
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()

    history_service = AnalysisHistoryService(repository=repository)
    summaries = history_service.list_history(limit=limit, offset=offset)

    return AnalysisHistoryResponseSchema(
        items=[
            SavedAnalysisSummarySchema(
                analysis_id=s.analysis_id,
                created_at=s.created_at,
                job_title=s.job_title,
                company_name=s.company_name,
                score=s.score,
                ai_enriched=s.ai_enriched,
            )
            for s in summaries
        ]
    )


@router.get(
    "/analyses/{analysis_id}",
    response_model=SavedAnalysisDetailSchema,
    responses={
        404: {
            "model": ErrorResponseSchema,
            "description": "Analysis not found.",
        },
        422: {
            "model": ErrorResponseSchema,
            "description": "Analysis ID validation failed.",
        },
        503: {
            "model": ErrorResponseSchema,
            "description": "Persistence is unavailable.",
        },
    },
)
async def get_analysis(
    analysis_id: uuid.UUID,
    request: Request,
) -> SavedAnalysisDetailSchema:
    """Retrieve a saved analysis by ID."""
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()

    history_service = AnalysisHistoryService(repository=repository)
    analysis = history_service.get_analysis(analysis_id)

    if analysis is None:
        raise AnalysisNotFoundError()

    return SavedAnalysisDetailSchema(
        analysis_id=analysis.analysis_id,
        created_at=analysis.created_at,
        candidate_profile=map_domain_candidate_to_schema(analysis.candidate_profile),
        job_description=map_domain_job_to_schema(analysis.job_description),
        score=map_score_to_schema(analysis.match_explanation.score),
        explanation=map_explanation_to_schema(analysis.match_explanation),
        interview_preparation=map_interview_prep_to_schema(
            analysis.interview_preparation
        ),
        learning_recommendations=map_learning_recommendations_to_schema(
            analysis.learning_recommendations
        ),
        ai_enrichment=map_ai_enrichment_to_schema(analysis.ai_enrichment),
    )
