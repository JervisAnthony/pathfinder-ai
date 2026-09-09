"""Expose configuration availability without probing providers or storage."""

from fastapi import APIRouter, Request

from pathfinder_ai.api.schemas import PathfinderCapabilitiesSchema

router = APIRouter(prefix="/api/v1")


@router.get("/capabilities", response_model=PathfinderCapabilitiesSchema)
async def get_capabilities(request: Request) -> PathfinderCapabilitiesSchema:
    return PathfinderCapabilitiesSchema(
        ai_enrichment_available=request.app.state.ai_provider is not None,
        job_description_import_available=request.app.state.job_description_import_provider
        is not None,
        candidate_profile_import_available=request.app.state.candidate_profile_import_provider
        is not None,
        persistence_available=request.app.state.analysis_repository is not None,
    )
