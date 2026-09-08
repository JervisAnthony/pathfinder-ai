"""Transient preprocessing only; no analysis or persistence dependencies."""

from dataclasses import asdict

from fastapi import APIRouter, Request
from starlette.concurrency import run_in_threadpool

from pathfinder_ai.api.errors import (
    ErrorResponseSchema,
    JobDescriptionImportUnavailableError,
)
from pathfinder_ai.api.schemas import (
    JobDescriptionDraftRequestSchema,
    JobDescriptionDraftResponseSchema,
)
from pathfinder_ai.application.job_description_import import JobDescriptionImportService

router = APIRouter(prefix="/api/v1/job-description")


@router.post(
    "/draft",
    response_model=JobDescriptionDraftResponseSchema,
    responses={code: {"model": ErrorResponseSchema} for code in (422, 502, 503)},
)
async def create_draft(
    payload: JobDescriptionDraftRequestSchema, request: Request
) -> JobDescriptionDraftResponseSchema:
    provider = request.app.state.job_description_import_provider
    if provider is None:
        raise JobDescriptionImportUnavailableError()
    draft = await run_in_threadpool(
        JobDescriptionImportService(provider).draft, payload.raw_job_description
    )
    assert draft is not None  # Service has an explicitly configured provider.
    return JobDescriptionDraftResponseSchema(**asdict(draft))
