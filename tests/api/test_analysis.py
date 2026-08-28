"""
Tests for API Analysis routes.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api.app import create_app
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentProvider,
    AIEnrichmentRequest,
    AIEnrichmentResult,
)


class FakeAIProvider(AIEnrichmentProvider):
    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail
        self.called = False

    def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult:
        self.called = True
        if self.should_fail:
            raise RuntimeError("Provider simulation failure.")
        return AIEnrichmentResult(
            content="Synthetic AI insight.", provider_name="FakeProvider"
        )


@pytest.fixture
def valid_payload() -> dict[str, Any]:
    return {
        "candidate_profile": {
            "skills": [{"name": "python"}],
            "experience": [
                {
                    "role_title": {"title": "Software Engineer"},
                    "duration_months": 24,
                    "skills": [{"name": "python"}],
                }
            ],
            "education": [],
            "projects": [],
            "certifications": [],
            "preferences": None,
        },
        "job_description": {
            "title": {"title": "Backend Engineer"},
            "responsibilities": [{"description": "Write code."}],
            "required_skills": [{"name": "python"}],
            "preferred_skills": [],
            "company_info": None,
            "experience_requirement": {"minimum_years": 1, "maximum_years": None},
            "education_requirement": None,
        },
        "include_ai_enrichment": False,
    }


def test_deterministic_analysis_success(valid_payload: dict[str, Any]) -> None:
    app = create_app()
    client = TestClient(app)

    response = client.post("/api/v1/analysis", json=valid_payload)
    assert response.status_code == 200

    data = response.json()
    assert "score" in data
    assert data["score"]["value"] == 100.0
    assert "explanation" in data
    assert "interview_preparation" in data
    assert data["ai_enrichment"] is None


def test_invalid_request_validation(valid_payload: dict[str, Any]) -> None:
    app = create_app()
    client = TestClient(app)

    # Induce a validation error
    valid_payload["candidate_profile"]["experience"][0]["duration_months"] = "invalid"

    response = client.post("/api/v1/analysis", json=valid_payload)
    assert response.status_code == 422
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "validation_error"
    # Ensure raw inputs aren't dumped verbatim but loc and msg are present
    details = data["error"]["details"]
    assert any("duration_months" in str(d["loc"]) for d in details)


def test_domain_validation_error(valid_payload: dict[str, Any]) -> None:
    app = create_app()
    client = TestClient(app)

    # Induce a domain ValueError (negative duration)
    valid_payload["candidate_profile"]["experience"][0]["duration_months"] = -5

    response = client.post("/api/v1/analysis", json=valid_payload)
    assert response.status_code == 422
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "domain_validation_error"
    assert "must be greater than zero" in data["error"]["message"]


def test_optional_ai_enrichment_success(valid_payload: dict[str, Any]) -> None:
    provider = FakeAIProvider()
    app = create_app(ai_provider=provider)
    client = TestClient(app)

    valid_payload["include_ai_enrichment"] = True

    response = client.post("/api/v1/analysis", json=valid_payload)
    assert response.status_code == 200

    data = response.json()
    assert provider.called is True
    assert data["ai_enrichment"] is not None
    assert data["ai_enrichment"]["content"] == "Synthetic AI insight."
    assert data["ai_enrichment"]["provider_name"] == "FakeProvider"


def test_ai_provider_missing_error(valid_payload: dict[str, Any]) -> None:
    app = create_app(ai_provider=None)
    client = TestClient(app)

    valid_payload["include_ai_enrichment"] = True

    response = client.post("/api/v1/analysis", json=valid_payload)
    assert response.status_code == 503
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "ai_provider_unavailable"


def test_ai_provider_execution_error(valid_payload: dict[str, Any]) -> None:
    provider = FakeAIProvider(should_fail=True)
    app = create_app(ai_provider=provider)
    client = TestClient(app)

    valid_payload["include_ai_enrichment"] = True

    response = client.post("/api/v1/analysis", json=valid_payload)
    assert response.status_code == 502
    data = response.json()

    assert "error" in data
    assert data["error"]["code"] == "ai_provider_error"
    # Ensure the raw exception text isn't leaked
    assert "Provider simulation failure" not in data["error"]["message"]
