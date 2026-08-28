"""
AI Enrichment Application Service and Provider Contract.
"""

from dataclasses import dataclass
from typing import Protocol

from pathfinder_ai.domain import (
    JobDescription,
    MatchExplanation,
)

from .interview_preparation import InterviewPreparation


def _normalize_content(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("content cannot be blank.")
    return normalized


def _normalize_provider_name(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("provider_name cannot be blank.")
    return normalized


@dataclass(frozen=True, slots=True)
class AIEnrichmentRequest:
    """Structured request for generative AI enrichment."""

    job_description: JobDescription
    match_explanation: MatchExplanation
    interview_preparation: InterviewPreparation | None = None


@dataclass(frozen=True, slots=True)
class AIEnrichmentResult:
    """Structured result of generative AI enrichment."""

    content: str
    provider_name: str

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "content",
            _normalize_content(self.content),
        )
        object.__setattr__(
            self,
            "provider_name",
            _normalize_provider_name(self.provider_name),
        )


class AIEnrichmentProvider(Protocol):
    """Protocol for provider-neutral AI enrichment."""

    def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult:
        """Generate enrichment content from a structured request."""
        ...


class AIEnrichmentService:
    """Application service for generative AI enrichment."""

    def __init__(self, provider: AIEnrichmentProvider | None = None) -> None:
        self._provider = provider

    def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult | None:
        """
        Perform AI enrichment if a provider is configured.
        Returns None if no provider is configured, ensuring deterministic
        analysis can proceed without failure.
        """
        if self._provider is None:
            return None
        return self._provider.enrich(request)
