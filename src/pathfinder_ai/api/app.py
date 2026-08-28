"""
FastAPI application factory.
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from pathfinder_ai.api.errors import (
    AIProviderExecutionError,
    AIProviderUnavailableError,
    ai_provider_execution_error_handler,
    ai_provider_unavailable_handler,
    validation_exception_handler,
    value_error_handler,
)
from pathfinder_ai.api.routes.analysis import router as analysis_router
from pathfinder_ai.application.ai_enrichment import AIEnrichmentProvider


def create_app(ai_provider: AIEnrichmentProvider | None = None) -> FastAPI:
    """
    Create and configure the FastAPI application.
    """
    app = FastAPI(
        title="Pathfinder AI API",
        version="0.1.0",
        description="MVP-1 Analysis API for matching and interview preparation.",
    )

    # Inject dependency via app state
    app.state.ai_provider = ai_provider

    # Register Exception Handlers
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(ValueError, value_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(
        AIProviderUnavailableError,
        ai_provider_unavailable_handler,  # type: ignore[arg-type]
    )
    app.add_exception_handler(
        AIProviderExecutionError,
        ai_provider_execution_error_handler,  # type: ignore[arg-type]
    )

    # Register Routes
    app.include_router(analysis_router)

    return app
