"""Read-only overview API contracts and route compatibility."""

import sqlite3
import uuid
from dataclasses import replace
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api.app import create_app
from pathfinder_ai.application.analysis_follow_up import AnalysisFollowUpService
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryService,
    ApplicationStatus,
)
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


def test_empty_overview_and_openapi(tmp_path: Path) -> None:
    client = TestClient(
        create_app(analysis_repository=SQLiteAnalysisRepository(tmp_path / "api.db"))
    )
    response = client.get("/api/v1/analyses/overview")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {
        "total_analyses": 0,
        "status_counts": [
            {"status": status.value, "count": 0} for status in ApplicationStatus
        ],
        "scheduled_follow_up_count": 0,
        "unscheduled_follow_up_count": 0,
        "earliest_follow_ups": [],
    }
    assert client.get("/api/v1/analyses").json() == {"items": []}
    assert client.get(f"/api/v1/analyses/{uuid.UUID(int=1)}").status_code == 404
    assert client.get("/api/v1/analyses/compare").status_code == 422
    spec = client.get("/openapi.json").json()
    operation = spec["paths"]["/api/v1/analyses/overview"]["get"]
    assert "parameters" not in operation
    assert "503" in operation["responses"]
    schema = spec["components"]["schemas"]["ApplicationPipelineOverviewSchema"]
    assert schema["additionalProperties"] is False
    assert set(schema["properties"]) == set(response.json())
    assert (
        spec["components"]["schemas"]["PipelineFollowUpItemSchema"]["properties"][
            "follow_up_on"
        ]["format"]
        == "date"
    )
    for name in ("ApplicationStatusCountSchema", "PipelineFollowUpItemSchema"):
        assert spec["components"]["schemas"][name]["additionalProperties"] is False


@pytest.mark.parametrize(
    "failure",
    [
        None,
        sqlite3.OperationalError("PRIVATE database path"),
        RuntimeError("PRIVATE configuration"),
    ],
)
def test_overview_persistence_unavailable_is_safe(failure: Exception | None) -> None:
    repository = None
    if failure is not None:
        repository = Mock()
        repository.get_pipeline_overview.side_effect = failure
    response = TestClient(create_app(analysis_repository=repository)).get(
        "/api/v1/analyses/overview"
    )
    assert response.status_code == 503
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {
        "error": {
            "code": "persistence_unavailable",
            "message": "Analysis persistence is unavailable.",
            "details": None,
        }
    }
    assert "PRIVATE" not in response.text


def test_populated_overview_exact_metadata_and_route_precedence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "saved.db")
    client = TestClient(create_app(analysis_repository=repo))
    response = client.post(
        "/api/v1/analysis",
        json={
            "candidate_profile": {"skills": [{"name": "Python"}]},
            "job_description": {
                "title": {"title": "Fictional Engineer"},
                "required_skills": [{"name": "Python"}],
            },
            "save_analysis": True,
        },
    )
    assert response.status_code == 200
    original_id = uuid.UUID(response.json()["saved_analysis"]["analysis_id"])
    original = repo.get(original_id)
    assert original is not None
    repo.delete(original_id)
    timestamp = datetime(2026, 1, 1, tzinfo=UTC)
    history = AnalysisHistoryService(repo, clock=lambda: timestamp)
    follow_ups = AnalysisFollowUpService(repo, clock=lambda: timestamp)
    for index, status in enumerate(ApplicationStatus, 1):
        identifier = uuid.UUID(int=index)
        repo.save(replace(original, analysis_id=identifier, created_at=timestamp))
        history.update_application_status(identifier, status)
        follow_ups.update_follow_up(identifier, date(2000, 2, 29))
    root = f"/api/v1/analyses/{uuid.UUID(int=1)}"
    assert (
        client.put(f"{root}/note", json={"content": "PRIVATE note"}).status_code == 200
    )
    assert client.get(root).status_code == 200
    assert (
        client.get("/api/v1/analyses?has_follow_up=true&sort=follow_up_asc").status_code
        == 200
    )
    assert (
        client.get(
            f"/api/v1/analyses/compare?left_analysis_id={uuid.UUID(int=1)}&right_analysis_id={uuid.UUID(int=2)}"
        ).status_code
        == 200
    )
    monkeypatch.setattr(
        "pathfinder_ai.infrastructure.sqlite_analysis_repository.decode_analysis",
        lambda *_: pytest.fail("Overview must not decode"),
    )
    response = client.get("/api/v1/analyses/overview")
    assert response.status_code == 200
    assert response.json() == {
        "total_analyses": 7,
        "status_counts": [
            {"status": status.value, "count": 1} for status in ApplicationStatus
        ],
        "scheduled_follow_up_count": 7,
        "unscheduled_follow_up_count": 0,
        "earliest_follow_ups": [
            {
                "analysis_id": str(uuid.UUID(int=index)),
                "job_title": "Fictional Engineer",
                "company_name": None,
                "application_status": list(ApplicationStatus)[index - 1].value,
                "follow_up_on": "2000-02-29",
            }
            for index in (7, 6, 5, 4, 3)
        ],
    }
    assert "PRIVATE" not in response.text
    assert (
        "candidate_profile" not in response.text and "payload_json" not in response.text
    )
