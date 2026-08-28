"""
API Error handling and schema definitions.
"""

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from pathfinder_ai.api.schemas import BaseStrictModel


class ErrorDetailSchema(BaseStrictModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponseSchema(BaseStrictModel):
    error: ErrorDetailSchema


def create_error_response(
    status_code: int, code: str, message: str, details: Any | None = None
) -> JSONResponse:
    error_response = ErrorResponseSchema(
        error=ErrorDetailSchema(code=code, message=message, details=details)
    )
    return JSONResponse(status_code=status_code, content=error_response.model_dump())


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Safely extract validation errors
    details = exc.errors()
    # Mask potentially sensitive input
    safe_details = []
    for err in details:
        safe_err = {
            "loc": err.get("loc"),
            "msg": err.get("msg"),
            "type": err.get("type"),
        }
        safe_details.append(safe_err)

    return create_error_response(
        status_code=422,
        code="validation_error",
        message="Request validation failed.",
        details=safe_details,
    )


async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return create_error_response(
        status_code=422,
        code="domain_validation_error",
        message=str(exc),
    )


class AIProviderUnavailableError(Exception):
    pass


async def ai_provider_unavailable_handler(
    request: Request, exc: AIProviderUnavailableError
) -> JSONResponse:
    return create_error_response(
        status_code=503,
        code="ai_provider_unavailable",
        message="AI enrichment requested but no provider is configured.",
    )


class AIProviderExecutionError(Exception):
    pass


async def ai_provider_execution_error_handler(
    request: Request, exc: AIProviderExecutionError
) -> JSONResponse:
    return create_error_response(
        status_code=502,
        code="ai_provider_error",
        message="AI enrichment provider failed.",
    )
