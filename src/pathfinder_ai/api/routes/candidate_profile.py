"""Ephemeral AI-assisted Candidate Profile draft endpoints."""

from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from pathfinder_ai.api.errors import (
    CandidateProfileImportUnavailableError,
    ErrorResponseSchema,
    create_error_response,
)
from pathfinder_ai.api.routes.resume import _FILE_ERRORS
from pathfinder_ai.api.schemas import (
    CandidateProfileDraftRequestSchema,
    CandidateProfileDraftResponseSchema,
)
from pathfinder_ai.application.candidate_profile_import import (
    CandidateProfileImportService,
)
from pathfinder_ai.infrastructure.resume_document_text import (
    MAX_RESUME_FILE_BYTES,
    ResumeDocumentError,
    extract_resume_document,
)

router = APIRouter(prefix="/api/v1/candidate-profile")


async def _create_draft(
    text: str, request: Request
) -> CandidateProfileDraftResponseSchema:
    provider = request.app.state.candidate_profile_import_provider
    if provider is None:
        raise CandidateProfileImportUnavailableError()
    draft = await run_in_threadpool(CandidateProfileImportService(provider).draft, text)
    assert draft is not None
    return CandidateProfileDraftResponseSchema.from_draft(draft)


@router.post(
    "/draft",
    response_model=CandidateProfileDraftResponseSchema,
    responses={code: {"model": ErrorResponseSchema} for code in (422, 502, 503)},
)
async def create_candidate_profile_draft(
    payload: CandidateProfileDraftRequestSchema, request: Request
) -> CandidateProfileDraftResponseSchema:
    return await _create_draft(payload.raw_resume_text, request)


@router.post(
    "/file-draft",
    response_model=CandidateProfileDraftResponseSchema,
    responses={
        code: {"model": ErrorResponseSchema} for code in (413, 415, 422, 502, 503)
    },
)
async def create_candidate_profile_file_draft(
    file: Annotated[UploadFile, File()], request: Request
) -> CandidateProfileDraftResponseSchema | JSONResponse:
    try:
        if file.size is not None and file.size > MAX_RESUME_FILE_BYTES:
            raise ResumeDocumentError("file_size")
        data = await file.read(MAX_RESUME_FILE_BYTES + 1)
        if len(data) > MAX_RESUME_FILE_BYTES:
            raise ResumeDocumentError("file_size")
        document = await run_in_threadpool(
            extract_resume_document, data, file.filename or ""
        )
        return await _create_draft(document.text, request)
    except ResumeDocumentError as exc:
        status, code, message = _FILE_ERRORS[exc.reason]
        return create_error_response(status, code, message)
    finally:
        await file.close()
