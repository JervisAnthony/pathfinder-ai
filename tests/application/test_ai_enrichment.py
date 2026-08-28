"""
Tests for AI Enrichment abstraction.
"""

import pytest

from pathfinder_ai.application import (
    AIEnrichmentRequest,
    AIEnrichmentResult,
    AIEnrichmentService,
    DeterministicInterviewPreparer,
)
from pathfinder_ai.domain import (
    CandidateProfile,
    DeterministicMatcher,
    JobDescription,
    JobTitle,
    Skill,
)


class FakeAIProvider:
    """Fake provider for testing."""

    def __init__(
        self,
        response_content: str,
        provider_name: str = "FakeProvider",
        should_raise: bool = False,
    ) -> None:
        self.response_content = response_content
        self.provider_name = provider_name
        self.should_raise = should_raise
        self.last_request: AIEnrichmentRequest | None = None

    def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult:
        self.last_request = request
        if self.should_raise:
            raise RuntimeError("Synthetic provider failure")
        return AIEnrichmentResult(
            content=self.response_content,
            provider_name=self.provider_name,
        )


def test_ai_enrichment_result_validation() -> None:
    """Test validation of AIEnrichmentResult."""
    multiline_content = "  \n  Line 1  \n\n  Line 2  \n  "
    result = AIEnrichmentResult(content=multiline_content, provider_name="  Provider  ")
    assert result.content == "Line 1  \n\n  Line 2"
    assert result.provider_name == "Provider"

    with pytest.raises(ValueError, match=r"content cannot be blank\."):
        AIEnrichmentResult(content=" \n  \n ", provider_name="Provider")

    with pytest.raises(ValueError, match=r"provider_name cannot be blank\."):
        AIEnrichmentResult(content="Content", provider_name="")


def test_ai_enrichment_service_optionality() -> None:
    """Test that the service can run without a provider, returning None."""
    job = JobDescription(
        title=JobTitle("Engineer"),
        required_skills=(Skill("Python"),),
    )
    candidate = CandidateProfile(skills=(Skill("Python"),))
    matcher = DeterministicMatcher()
    explanation = matcher.explain(candidate, job)

    request = AIEnrichmentRequest(
        job_description=job,
        match_explanation=explanation,
        interview_preparation=None,
    )

    service = AIEnrichmentService(provider=None)
    result = service.enrich(request)
    assert result is None


def test_ai_enrichment_service_delegation() -> None:
    """Test that the service correctly delegates to the provider."""
    job = JobDescription(
        title=JobTitle("Engineer"),
        required_skills=(Skill("Python"),),
    )
    candidate = CandidateProfile(skills=(Skill("Python"),))
    matcher = DeterministicMatcher()
    explanation = matcher.explain(candidate, job)

    preparer = DeterministicInterviewPreparer()
    prep = preparer.prepare(candidate, job, explanation)

    request = AIEnrichmentRequest(
        job_description=job,
        match_explanation=explanation,
        interview_preparation=prep,
    )

    fake_provider = FakeAIProvider(
        response_content="Looks great!", provider_name="Fake1"
    )
    service = AIEnrichmentService(provider=fake_provider)
    result = service.enrich(request)

    assert result is not None
    assert result.content == "Looks great!"
    assert result.provider_name == "Fake1"
    assert fake_provider.last_request == request


def test_ai_enrichment_multiple_providers() -> None:
    """Test that multiple providers can be swapped interchangeably."""
    job = JobDescription(title=JobTitle("Engineer"))
    candidate = CandidateProfile(skills=(Skill("Python"),))
    explanation = DeterministicMatcher().explain(candidate, job)
    request = AIEnrichmentRequest(job_description=job, match_explanation=explanation)

    provider1 = FakeAIProvider("Response A", "Prov A")
    provider2 = FakeAIProvider("Response B", "Prov B")

    service1 = AIEnrichmentService(provider=provider1)
    result1 = service1.enrich(request)
    assert result1 is not None and result1.content == "Response A"

    service2 = AIEnrichmentService(provider=provider2)
    result2 = service2.enrich(request)
    assert result2 is not None and result2.content == "Response B"


def test_core_integrity_not_altered_by_ai() -> None:
    """
    Test that deterministic generation of scores, explanations,
    and interview prep is NOT altered by AI enrichment.
    """
    job = JobDescription(
        title=JobTitle("Software Engineer"),
        required_skills=(Skill("Python"), Skill("SQL")),
    )
    candidate = CandidateProfile(skills=(Skill("Python"),))

    # Deterministic Baseline
    matcher = DeterministicMatcher()
    original_score = matcher.match(candidate, job)
    original_explanation = matcher.explain(candidate, job)
    preparer = DeterministicInterviewPreparer()
    original_prep = preparer.prepare(candidate, job, original_explanation)

    # Perform Enrichment
    request = AIEnrichmentRequest(
        job_description=job,
        match_explanation=original_explanation,
        interview_preparation=original_prep,
    )
    fake_provider = FakeAIProvider("Enrichment Content")
    service = AIEnrichmentService(provider=fake_provider)
    _ = service.enrich(request)

    # Re-run Deterministic Post-Enrichment (sanity check)
    new_score = matcher.match(candidate, job)
    new_explanation = matcher.explain(candidate, job)
    new_prep = preparer.prepare(candidate, job, new_explanation)

    # Verify no mutation occurred
    # (frozen dataclasses enforce this, but test validates intent)
    assert original_score == new_score
    assert original_explanation == new_explanation
    assert original_prep == new_prep

    # Also verify that the request itself didn't mutate the objects
    assert request.job_description == job
    assert request.match_explanation == original_explanation
    assert request.interview_preparation == original_prep


def test_ai_enrichment_provider_failure_propagation() -> None:
    """Test that provider failures are explicitly propagated and do not alter state."""
    job = JobDescription(
        title=JobTitle("Software Engineer"),
        required_skills=(Skill("Python"),),
    )
    candidate = CandidateProfile(skills=(Skill("Python"),))

    matcher = DeterministicMatcher()
    explanation = matcher.explain(candidate, job)

    request = AIEnrichmentRequest(
        job_description=job,
        match_explanation=explanation,
        interview_preparation=None,
    )

    failing_provider = FakeAIProvider("Error", should_raise=True)
    service = AIEnrichmentService(provider=failing_provider)

    with pytest.raises(RuntimeError, match="Synthetic provider failure"):
        service.enrich(request)

    # Verify deterministic object remains untouched
    assert request.job_description == job
    assert request.match_explanation == explanation
