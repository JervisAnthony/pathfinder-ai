"""FastAPI route for deterministic role-relevant resume skill import."""

from fastapi import APIRouter

from pathfinder_ai.api.errors import DomainValidationError, ErrorResponseSchema
from pathfinder_ai.api.schemas import (
    ResumeSkillImportRequestSchema,
    ResumeSkillImportResponseSchema,
    map_resume_skill_import_to_schema,
)
from pathfinder_ai.application.resume_skill_import import (
    DeterministicResumeSkillImporter,
)
from pathfinder_ai.domain.skill import Skill

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
