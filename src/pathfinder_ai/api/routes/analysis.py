"""FastAPI routes for Pathfinder AI analysis."""

import json
import uuid
from dataclasses import asdict
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from pathfinder_ai.api.errors import (
    AIProviderExecutionError,
    AIProviderUnavailableError,
    AnalysisNotFoundError,
    DomainValidationError,
    ErrorResponseSchema,
    PersistenceUnavailableError,
)
from pathfinder_ai.api.schemas import (
    AnalysisFollowUpSchema,
    AnalysisHistoryResponseSchema,
    AnalysisNoteSchema,
    AnalysisRequestSchema,
    AnalysisResponseSchema,
    AnalysisTrackingSchema,
    ApplicationStatusEventSchema,
    ApplicationStatusHistoryResponseSchema,
    SavedAnalysisComparisonSchema,
    SavedAnalysisDetailSchema,
    SavedAnalysisMetadataSchema,
    SavedAnalysisSummarySchema,
    UpdateAnalysisFollowUpSchema,
    UpdateAnalysisNoteSchema,
    UpdateAnalysisTrackingSchema,
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
from pathfinder_ai.application.analysis_comparison import compare_saved_analyses
from pathfinder_ai.application.analysis_export import render_saved_analysis_markdown
from pathfinder_ai.application.analysis_follow_up import AnalysisFollowUpService
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    AnalysisHistoryService,
    AnalysisRepository,
    ApplicationStatus,
    SavedAnalysis,
)
from pathfinder_ai.application.analysis_notes import AnalysisNoteService
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
            ai_result = await run_in_threadpool(
                enrichment_service.enrich, enrichment_request
            )
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
            "description": "Pagination or history filter validation failed.",
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
    query: str | None = None,
    ai_enriched: bool | None = None,
    min_score: Annotated[float | None, Query(ge=0, le=100)] = None,
    max_score: Annotated[float | None, Query(ge=0, le=100)] = None,
    application_status: ApplicationStatus | None = None,
) -> AnalysisHistoryResponseSchema:
    """List recent saved analyses."""
    try:
        history_filter = AnalysisHistoryFilter(
            query=query,
            ai_enriched=ai_enriched,
            min_score=min_score,
            max_score=max_score,
            application_status=application_status,
        )
    except ValueError as exc:
        raise RequestValidationError(
            [{"loc": ("query",), "msg": str(exc), "type": "value_error"}]
        ) from exc

    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()

    history_service = AnalysisHistoryService(repository=repository)
    summaries = history_service.list_history(
        limit=limit, offset=offset, history_filter=history_filter
    )

    return AnalysisHistoryResponseSchema(
        items=[
            SavedAnalysisSummarySchema(
                analysis_id=s.analysis_id,
                created_at=s.created_at,
                job_title=s.job_title,
                company_name=s.company_name,
                score=s.score,
                ai_enriched=s.ai_enriched,
                application_status=s.application_status,
                status_updated_at=s.status_updated_at,
                follow_up_on=s.follow_up_on,
            )
            for s in summaries
        ]
    )


@router.get(
    "/analyses/{analysis_id}/tracking/history",
    response_model=ApplicationStatusHistoryResponseSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid request."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def get_analysis_tracking_history(
    analysis_id: uuid.UUID,
    request: Request,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApplicationStatusHistoryResponseSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    events = AnalysisHistoryService(repository).list_tracking_events(
        analysis_id, limit=limit, offset=offset
    )
    if events is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return ApplicationStatusHistoryResponseSchema(
        items=[
            ApplicationStatusEventSchema(
                previous_status=event.previous_status,
                application_status=event.application_status,
                changed_at=event.changed_at,
            )
            for event in events
        ]
    )


@router.get(
    "/analyses/{analysis_id}/note",
    response_model=AnalysisNoteSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid analysis UUID."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def get_analysis_note(
    analysis_id: uuid.UUID, request: Request, response: Response
) -> AnalysisNoteSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    note = AnalysisNoteService(repository).get_note(analysis_id)
    if note is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return AnalysisNoteSchema.model_validate(asdict(note))


@router.put(
    "/analyses/{analysis_id}/note",
    response_model=AnalysisNoteSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid note request."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def update_analysis_note(
    analysis_id: uuid.UUID,
    payload: UpdateAnalysisNoteSchema,
    request: Request,
    response: Response,
) -> AnalysisNoteSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    note = AnalysisNoteService(repository).update_note(analysis_id, payload.content)
    if note is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return AnalysisNoteSchema.model_validate(asdict(note))


@router.delete(
    "/analyses/{analysis_id}/note",
    status_code=204,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid analysis UUID."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def clear_analysis_note(analysis_id: uuid.UUID, request: Request) -> Response:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    if AnalysisNoteService(repository).clear_note(analysis_id) is None:
        raise AnalysisNotFoundError()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get(
    "/analyses/{analysis_id}/follow-up",
    response_model=AnalysisFollowUpSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid analysis UUID."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def get_analysis_follow_up(
    analysis_id: uuid.UUID, request: Request, response: Response
) -> AnalysisFollowUpSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    follow_up = AnalysisFollowUpService(repository).get_follow_up(analysis_id)
    if follow_up is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return AnalysisFollowUpSchema.model_validate(asdict(follow_up))


@router.put(
    "/analyses/{analysis_id}/follow-up",
    response_model=AnalysisFollowUpSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {
            "model": ErrorResponseSchema,
            "description": "Invalid follow-up request.",
        },
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def update_analysis_follow_up(
    analysis_id: uuid.UUID,
    payload: UpdateAnalysisFollowUpSchema,
    request: Request,
    response: Response,
) -> AnalysisFollowUpSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    follow_up = AnalysisFollowUpService(repository).update_follow_up(
        analysis_id, payload.follow_up_on
    )
    if follow_up is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return AnalysisFollowUpSchema.model_validate(asdict(follow_up))


@router.delete(
    "/analyses/{analysis_id}/follow-up",
    status_code=204,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid analysis UUID."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def clear_analysis_follow_up(
    analysis_id: uuid.UUID, request: Request
) -> Response:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    if AnalysisFollowUpService(repository).clear_follow_up(analysis_id) is None:
        raise AnalysisNotFoundError()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get(
    "/analyses/{analysis_id}/tracking",
    response_model=AnalysisTrackingSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid analysis UUID."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def get_analysis_tracking(
    analysis_id: uuid.UUID, request: Request, response: Response
) -> AnalysisTrackingSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    tracking = AnalysisHistoryService(repository).get_tracking(analysis_id)
    if tracking is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return AnalysisTrackingSchema.model_validate(asdict(tracking))


@router.put(
    "/analyses/{analysis_id}/tracking",
    response_model=AnalysisTrackingSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid UUID or status."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def update_analysis_tracking(
    analysis_id: uuid.UUID,
    payload: UpdateAnalysisTrackingSchema,
    request: Request,
    response: Response,
) -> AnalysisTrackingSchema:
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    tracking = AnalysisHistoryService(repository).update_application_status(
        analysis_id, payload.application_status
    )
    if tracking is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return AnalysisTrackingSchema.model_validate(asdict(tracking))


@router.get(
    "/analyses/compare",
    response_model=SavedAnalysisComparisonSchema,
    responses={
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid analysis UUIDs."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def compare_analyses(
    request: Request,
    response: Response,
    left_analysis_id: uuid.UUID,
    right_analysis_id: uuid.UUID,
) -> SavedAnalysisComparisonSchema:
    """Compare two existing snapshots without revealing a missing side."""
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    history = AnalysisHistoryService(repository=repository)
    left = history.get_analysis(left_analysis_id)
    right = history.get_analysis(right_analysis_id)
    if left is None or right is None:
        raise AnalysisNotFoundError()
    response.headers["Cache-Control"] = "no-store"
    return SavedAnalysisComparisonSchema.model_validate(
        asdict(compare_saved_analyses(left, right))
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

    return _map_saved_analysis_detail(analysis)


def _map_saved_analysis_detail(analysis: SavedAnalysis) -> SavedAnalysisDetailSchema:
    """Share the public snapshot contract between detail and JSON export."""
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


@router.get(
    "/analyses/{analysis_id}/export",
    response_class=Response,
    responses={
        200: {
            "model": SavedAnalysisDetailSchema,
            "description": "Saved snapshot attachment in JSON or Markdown format.",
            "content": {"text/markdown": {"schema": {"type": "string"}}},
            "headers": {
                "Content-Disposition": {"schema": {"type": "string"}},
                "Cache-Control": {"schema": {"type": "string"}},
                "X-Content-Type-Options": {"schema": {"type": "string"}},
            },
        },
        404: {"model": ErrorResponseSchema, "description": "Analysis not found."},
        422: {"model": ErrorResponseSchema, "description": "Invalid UUID or format."},
        503: {"model": ErrorResponseSchema, "description": "Persistence unavailable."},
    },
)
async def export_analysis(
    analysis_id: uuid.UUID,
    request: Request,
    format: Literal["json", "markdown"] = "json",
) -> Response:
    """Download an existing snapshot without writes, AI, or recomputation."""
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()
    analysis = AnalysisHistoryService(repository=repository).get_analysis(analysis_id)
    if analysis is None:
        raise AnalysisNotFoundError()

    if format == "json":
        content = (
            json.dumps(
                _map_saved_analysis_detail(analysis).model_dump(mode="json"),
                ensure_ascii=False,
                indent=2,
            )
            + "\n"
        )
        extension = "json"
        media_type = "application/json; charset=utf-8"
    else:
        content = render_saved_analysis_markdown(analysis)
        extension = "md"
        media_type = "text/markdown; charset=utf-8"

    return Response(
        content=content.encode("utf-8"),
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="pathfinder-analysis-{analysis_id}.{extension}"'
            ),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/analyses/{analysis_id}",
    status_code=204,
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
async def delete_analysis(analysis_id: uuid.UUID, request: Request) -> Response:
    """Delete one saved analysis from configured persistence."""
    repository = getattr(request.app.state, "analysis_repository", None)
    if repository is None:
        raise PersistenceUnavailableError()

    history_service = AnalysisHistoryService(repository=repository)
    if not history_service.delete_analysis(analysis_id):
        raise AnalysisNotFoundError()

    return Response(status_code=204)
