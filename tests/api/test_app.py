"""
Tests for FastAPI application factory.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from pathfinder_ai.api.app import create_app
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentProvider,
    AIEnrichmentRequest,
    AIEnrichmentResult,
)


class DummyAIProvider(AIEnrichmentProvider):
    def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult:
        return AIEnrichmentResult(content="dummy", provider_name="dummy")


def test_create_app_no_provider() -> None:
    app = create_app()
    assert isinstance(app, FastAPI)
    assert app.state.ai_provider is None


def test_create_app_with_provider() -> None:
    provider = DummyAIProvider()
    app = create_app(ai_provider=provider)
    assert isinstance(app, FastAPI)
    assert app.state.ai_provider is provider


def test_health_endpoint() -> None:
    app = create_app()
    client = TestClient(app)

    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
