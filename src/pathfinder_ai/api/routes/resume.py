"""FastAPI route for deterministic role-relevant resume skill import."""

from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from pathfinder_ai.api.errors import (
    DomainValidationError,
    ErrorResponseSchema,
    create_error_response,
)
from pathfinder_ai.api.schemas import (
    ResumeSkillImportRequestSchema,
    ResumeSkillImportResponseSchema,
    map_resume_skill_import_to_schema,
)
from pathfinder_ai.application.resume_skill_import import (
    DeterministicResumeSkillImporter,
)
from pathfinder_ai.domain.skill import Skill
from pathfinder_ai.infrastructure.resume_document_text import (
    MAX_RESUME_FILE_BYTES,
    ResumeDocumentError,
    extract_resume_document,
)

router = APIRouter(prefix="/api/v1/resume")


@router.post(
    "/skill-import",
    response_model=ResumeSkillImportResponseSchema,
    responses={
        422: {
            "model": ErrorResponseSchema,
            "description": "Request or domain validation failed.",
        }
    },
)
async def import_resume_skills(
    payload: ResumeSkillImportRequestSchema,
) -> ResumeSkillImportResponseSchema:
    """Find exact supplied target-job skill phrases in ephemeral resume text."""
    try:
        required_skills = tuple(Skill(skill.name) for skill in payload.required_skills)
        preferred_skills = tuple(
            Skill(skill.name) for skill in payload.preferred_skills
        )
    except ValueError as exc:
        raise DomainValidationError() from exc

    result = DeterministicResumeSkillImporter().import_skills(
        payload.resume_text,
        required_skills,
        preferred_skills,
    )
    return map_resume_skill_import_to_schema(result)


_FILE_ERRORS = {
    "file_size": (
        413,
        "resume_file_too_large",
        "Resume files must be 10 MiB or smaller.",
    ),
    "unsupported": (
        415,
        "unsupported_resume_file",
        "Only PDF and DOCX resume files are supported.",
    ),
    "unreadable": (
        422,
        "resume_file_unreadable",
        "Pathfinder could not read this resume file.",
    ),
    "encrypted": (
        422,
        "resume_file_unreadable",
        "Encrypted resume files are not supported. Upload an unprotected PDF or DOCX.",
    ),
    "limit": (
        422,
        "resume_file_content_too_large",
        "This resume file exceeds document extraction limits.",
    ),
    "no_text": (
        422,
        "resume_file_no_text",
        "No extractable text was found in this resume file.",
    ),
}


@router.post(
    "/file-skill-import",
    response_model=ResumeSkillImportResponseSchema,
    responses={status: {"model": ErrorResponseSchema} for status in (413, 415, 422)},
)
async def import_resume_file_skills(
    file: Annotated[UploadFile, File()],
    required_skills: Annotated[list[str] | None, Form()] = None,
    preferred_skills: Annotated[list[str] | None, Form()] = None,
) -> ResumeSkillImportResponseSchema | JSONResponse:
    """Extract transient document text and delegate exact target-skill import."""
    try:
        try:
            required = tuple(Skill(name) for name in required_skills or [])
            preferred = tuple(Skill(name) for name in preferred_skills or [])
            if not required and not preferred:
                raise ValueError
        except ValueError as exc:
            raise DomainValidationError() from exc
        if file.size is not None and file.size > MAX_RESUME_FILE_BYTES:
            raise ResumeDocumentError("file_size")
        data = await file.read(MAX_RESUME_FILE_BYTES + 1)
        if len(data) > MAX_RESUME_FILE_BYTES:
            raise ResumeDocumentError("file_size")
        document = await run_in_threadpool(
            extract_resume_document, data, file.filename or ""
        )
        result = DeterministicResumeSkillImporter().import_skills(
            document.text, required, preferred
        )
        return map_resume_skill_import_to_schema(result)
    except ResumeDocumentError as exc:
        status, code, message = _FILE_ERRORS[exc.reason]
        return create_error_response(status, code, message)
    finally:
        await file.close()
