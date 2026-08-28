"""API error handling and schema definitions."""

from typing import cast

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from pathfinder_ai.api.schemas import BaseStrictModel


class ValidationDetailSchema(BaseStrictModel):
    loc: tuple[str | int, ...]
    msg: str
    type: str


class ErrorDetailSchema(BaseStrictModel):
    code: str
    message: str
    details: list[ValidationDetailSchema] | None = None


class ErrorResponseSchema(BaseStrictModel):
    error: ErrorDetailSchema


def create_error_response(
    status_code: int,
    code: str,
    message: str,
    details: list[ValidationDetailSchema] | None = None,
) -> JSONResponse:
    error_response = ErrorResponseSchema(
        error=ErrorDetailSchema(code=code, message=message, details=details)
    )
    return JSONResponse(status_code=status_code, content=error_response.model_dump())


async def validation_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    del request
    validation_error = cast(RequestValidationError, exc)
    safe_details = [
        ValidationDetailSchema(
            loc=tuple(error["loc"]),
            msg=error["msg"],
            type=error["type"],
        )
        for error in validation_error.errors()
    ]

    return create_error_response(
        status_code=422,
        code="validation_error",
        message="Request validation failed.",
        details=safe_details,
    )


class DomainValidationError(Exception):
    """A request could not be mapped to valid domain objects."""


async def domain_validation_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    del request, exc
    return create_error_response(
        status_code=422,
        code="domain_validation_error",
        message="Domain validation failed.",
        details=[
            ValidationDetailSchema(
                loc=("body",),
                msg="Value violates domain constraints.",
                type="value_error.domain",
            )
        ],
    )


class AIProviderUnavailableError(Exception):
    """AI enrichment was requested without an injected provider."""


async def ai_provider_unavailable_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    del request, exc
    return create_error_response(
        status_code=503,
        code="ai_provider_unavailable",
        message="AI enrichment requested but no provider is configured.",
    )


class AIProviderExecutionError(Exception):
    """The injected AI enrichment provider failed during execution."""


async def ai_provider_execution_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    del request, exc
    return create_error_response(
        status_code=502,
        code="ai_provider_error",
        message="AI enrichment provider failed.",
    )


class PersistenceUnavailableError(Exception):
    """Persistence was requested or accessed but no repository is configured."""


async def persistence_unavailable_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    del request, exc
    return create_error_response(
        status_code=503,
        code="persistence_unavailable",
        message="Analysis persistence is unavailable.",
    )


class AnalysisNotFoundError(Exception):
    """A requested saved analysis ID does not exist."""


async def analysis_not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    del request, exc
    return create_error_response(
        status_code=404,
        code="analysis_not_found",
        message="Saved analysis was not found.",
    )
