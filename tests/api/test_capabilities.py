"""Capability flags disclose only configured adapter presence."""

from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
from pathfinder_ai.application.ai_enrichment import AIEnrichmentProvider
from pathfinder_ai.application.analysis_history import AnalysisRepository


@pytest.mark.parametrize("ai", [False, True])
@pytest.mark.parametrize("persistence", [False, True])
def test_capabilities_only_report_configuration(ai, persistence):
    provider = Mock(spec=AIEnrichmentProvider) if ai else None
    repository = Mock(spec=AnalysisRepository) if persistence else None
    with TestClient(create_app(provider, repository)) as client:
        response = client.get("/api/v1/capabilities")
    assert response.status_code == 200
    assert response.json() == {
        "ai_enrichment_available": ai,
        "persistence_available": persistence,
    }
    if provider is not None:
        assert provider.mock_calls == []
    if repository is not None:
        assert repository.mock_calls == []


def test_capabilities_openapi_is_typed():
    schema = create_app().openapi()
    result = schema["paths"]["/api/v1/capabilities"]["get"]["responses"]["200"]
    assert result["content"]["application/json"]["schema"]["$ref"].endswith(
        "PathfinderCapabilitiesSchema"
    )
    properties = schema["components"]["schemas"]["PathfinderCapabilitiesSchema"][
        "properties"
    ]
    assert set(properties) == {"ai_enrichment_available", "persistence_available"}
    assert all(field["type"] == "boolean" for field in properties.values())
