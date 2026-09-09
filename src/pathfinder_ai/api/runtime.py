"""Explicit, independent runtime wiring for optional persistence and OpenAI."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from openai import OpenAI
from starlette.concurrency import run_in_threadpool

from pathfinder_ai.api.app import create_app
from pathfinder_ai.infrastructure.openai_ai_enrichment import OpenAIEnrichmentProvider
from pathfinder_ai.infrastructure.openai_candidate_profile_import import (
    OpenAICandidateProfileImportProvider,
)
from pathfinder_ai.infrastructure.openai_job_description_import import (
    OpenAIJobDescriptionImportProvider,
)
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)

SQLITE_PATH_ENVIRONMENT_VARIABLE = "PATHFINDER_SQLITE_PATH"
OPENAI_API_KEY_ENVIRONMENT_VARIABLE = "PATHFINDER_OPENAI_API_KEY"
OPENAI_MODEL_ENVIRONMENT_VARIABLE = "PATHFINDER_OPENAI_MODEL"


def create_runtime_app() -> FastAPI:
    """Configure optional adapters without probing external services."""
    api_key = os.environ.get(OPENAI_API_KEY_ENVIRONMENT_VARIABLE, "").strip()
    model = os.environ.get(OPENAI_MODEL_ENVIRONMENT_VARIABLE, "").strip()
    if bool(api_key) != bool(model):
        raise ValueError(
            "PATHFINDER_OPENAI_API_KEY and PATHFINDER_OPENAI_MODEL must both be "
            "nonblank, or both be unset."
        )

    configured_path = os.environ.get(SQLITE_PATH_ENVIRONMENT_VARIABLE)
    repository = None
    if configured_path is not None:
        database_path = Path(configured_path)
        database_path.parent.mkdir(parents=True, exist_ok=True)
        repository = SQLiteAnalysisRepository(database_path)

    if not api_key:
        return create_app(analysis_repository=repository)

    client = OpenAI(
        api_key=api_key,
        base_url="https://api.openai.com/v1",
        max_retries=0,
        timeout=30.0,
    )
    app = create_app(
        ai_provider=OpenAIEnrichmentProvider(client, model),
        job_description_import_provider=OpenAIJobDescriptionImportProvider(
            client, model
        ),
        candidate_profile_import_provider=OpenAICandidateProfileImportProvider(
            client, model
        ),
        analysis_repository=repository,
    )
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        try:
            async with original_lifespan(application):
                yield
        finally:
            await run_in_threadpool(client.close)

    app.router.lifespan_context = lifespan
    return app
