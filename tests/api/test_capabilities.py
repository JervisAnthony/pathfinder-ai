"""Capability flags disclose only configured adapter presence."""

from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
from pathfinder_ai.application.ai_enrichment import AIEnrichmentProvider
from pathfinder_ai.application.analysis_history import AnalysisRepository


@pytest.mark.parametrize("ai", [False, True])
@pytest.mark.parametrize("job_import", [False, True])
@pytest.mark.parametrize("profile_import", [False, True])
@pytest.mark.parametrize("persistence", [False, True])
def test_capabilities_only_report_configuration(
    ai, job_import, profile_import, persistence
):
    provider = Mock(spec=AIEnrichmentProvider) if ai else None
    repository = Mock(spec=AnalysisRepository) if persistence else None
    importer = Mock() if job_import else None
    profile_importer = Mock() if profile_import else None
    with TestClient(
        create_app(provider, repository, importer, profile_importer)
    ) as client:
        response = client.get("/api/v1/capabilities")
    assert response.status_code == 200
    assert response.json() == {
        "ai_enrichment_available": ai,
        "job_description_import_available": job_import,
        "candidate_profile_import_available": profile_import,
        "persistence_available": persistence,
    }
    if provider is not None:
        assert provider.mock_calls == []
    if repository is not None:
        assert repository.mock_calls == []
    if importer is not None:
        assert importer.mock_calls == []
    if profile_importer is not None:
        assert profile_importer.mock_calls == []


def test_capabilities_openapi_is_typed():
    schema = create_app().openapi()
    result = schema["paths"]["/api/v1/capabilities"]["get"]["responses"]["200"]
    assert result["content"]["application/json"]["schema"]["$ref"].endswith(
        "PathfinderCapabilitiesSchema"
    )
    properties = schema["components"]["schemas"]["PathfinderCapabilitiesSchema"][
        "properties"
    ]
    assert set(properties) == {
        "ai_enrichment_available",
        "job_description_import_available",
        "candidate_profile_import_available",
        "persistence_available",
    }
    assert all(field["type"] == "boolean" for field in properties.values())
