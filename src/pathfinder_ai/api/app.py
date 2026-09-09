"""
FastAPI application factory.
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from pathfinder_ai.api.errors import (
    AIProviderExecutionError,
    AIProviderUnavailableError,
    AnalysisNotFoundError,
    CandidateProfileImportUnavailableError,
    DomainValidationError,
    JobDescriptionImportUnavailableError,
    PersistenceUnavailableError,
    ai_provider_execution_error_handler,
    ai_provider_unavailable_handler,
    analysis_not_found_handler,
    candidate_profile_import_error_handler,
    candidate_profile_import_unavailable_handler,
    domain_validation_error_handler,
    job_description_import_error_handler,
    job_description_import_unavailable_handler,
    persistence_unavailable_handler,
    validation_exception_handler,
)
from pathfinder_ai.api.routes.analysis import router as analysis_router
from pathfinder_ai.api.routes.candidate_profile import (
    router as candidate_profile_router,
)
from pathfinder_ai.api.routes.capabilities import router as capabilities_router
from pathfinder_ai.api.routes.job_description import router as job_description_router
from pathfinder_ai.api.routes.resume import router as resume_router
from pathfinder_ai.application.ai_enrichment import AIEnrichmentProvider
from pathfinder_ai.application.analysis_history import AnalysisRepository
from pathfinder_ai.application.candidate_profile_import import (
    CandidateProfileImportError,
    CandidateProfileImportProvider,
)
from pathfinder_ai.application.job_description_import import (
    JobDescriptionImportError,
    JobDescriptionImportProvider,
)


def create_app(
    ai_provider: AIEnrichmentProvider | None = None,
    analysis_repository: AnalysisRepository | None = None,
    job_description_import_provider: JobDescriptionImportProvider | None = None,
    candidate_profile_import_provider: CandidateProfileImportProvider | None = None,
) -> FastAPI:
    """
    Create and configure the FastAPI application.
    """
    app = FastAPI(
        title="Pathfinder AI API",
        version="0.1.0",
        description="MVP-1 Analysis API for matching and interview preparation.",
    )

    # Inject dependencies via app state
    app.state.ai_provider = ai_provider
    app.state.analysis_repository = analysis_repository
    app.state.job_description_import_provider = job_description_import_provider
    app.state.candidate_profile_import_provider = candidate_profile_import_provider
    app.add_exception_handler(
        CandidateProfileImportUnavailableError,
        candidate_profile_import_unavailable_handler,
    )
    app.add_exception_handler(
        CandidateProfileImportError, candidate_profile_import_error_handler
    )
    app.add_exception_handler(
        JobDescriptionImportUnavailableError, job_description_import_unavailable_handler
    )
    app.add_exception_handler(
        JobDescriptionImportError, job_description_import_error_handler
    )

    # Register Exception Handlers
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(DomainValidationError, domain_validation_error_handler)
    app.add_exception_handler(
        AIProviderUnavailableError,
        ai_provider_unavailable_handler,
    )
    app.add_exception_handler(
        AIProviderExecutionError,
        ai_provider_execution_error_handler,
    )
    app.add_exception_handler(
        PersistenceUnavailableError,
        persistence_unavailable_handler,
    )
    app.add_exception_handler(
        AnalysisNotFoundError,
        analysis_not_found_handler,
    )

    # Register Routes
    app.include_router(analysis_router)
    app.include_router(capabilities_router)
    app.include_router(resume_router)
    app.include_router(job_description_router)
    app.include_router(candidate_profile_router)

    return app
