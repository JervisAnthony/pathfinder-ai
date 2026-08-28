"""
Tests for FastAPI application factory.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
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


def test_openapi_documents_versioned_routes_and_contracts() -> None:
    document = create_app().openapi()

    assert "/api/v1/health" in document["paths"]
    assert "get" in document["paths"]["/api/v1/health"]
    analysis = document["paths"]["/api/v1/analysis"]["post"]
    assert analysis["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/AnalysisRequestSchema"
    }
    responses = analysis["responses"]
    assert responses["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/AnalysisResponseSchema"
    }
    assert {"422", "502", "503"} <= responses.keys()
    for status in ("422", "502", "503"):
        assert responses[status]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponseSchema"
        }
