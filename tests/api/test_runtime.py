"""Tests for explicit runtime persistence wiring."""

import uuid
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from pathfinder_ai.api.runtime import (
    SQLITE_PATH_ENVIRONMENT_VARIABLE,
    create_runtime_app,
)
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


def _valid_payload() -> dict[str, Any]:
    return {
        "candidate_profile": {
            "skills": [{"name": "Python"}],
            "experience": [],
            "education": [],
            "projects": [],
            "certifications": [],
            "preferences": None,
        },
        "job_description": {
            "title": {"title": "Backend Engineer"},
            "responsibilities": [{"description": "Build reliable APIs."}],
            "required_skills": [{"name": "Python"}],
            "preferred_skills": [],
            "company_info": {"name": "Example Company"},
            "experience_requirement": None,
            "education_requirement": None,
        },
        "include_ai_enrichment": False,
        "save_analysis": True,
    }


def test_runtime_without_environment_remains_stateless(
    monkeypatch: Any, tmp_path: Path
) -> None:
    monkeypatch.delenv(SQLITE_PATH_ENVIRONMENT_VARIABLE, raising=False)
    database_path = tmp_path / "not-created.db"

    app = create_runtime_app()
    response = TestClient(app).post("/api/v1/analysis", json=_valid_payload())

    assert app.state.analysis_repository is None
    assert response.status_code == 503
    assert not database_path.exists()


def test_configured_runtime_creates_parent_and_supports_history(
    monkeypatch: Any, tmp_path: Path
) -> None:
    database_path = tmp_path / "nested" / "history.db"
    monkeypatch.setenv(SQLITE_PATH_ENVIRONMENT_VARIABLE, str(database_path))
    assert not database_path.exists()

    app = create_runtime_app()
    client = TestClient(app)

    assert isinstance(app.state.analysis_repository, SQLiteAnalysisRepository)
    assert database_path.is_file()

    saved_response = client.post("/api/v1/analysis", json=_valid_payload())
    assert saved_response.status_code == 200
    saved = saved_response.json()["saved_analysis"]
    analysis_id = saved["analysis_id"]

    history_response = client.get("/api/v1/analyses")
    assert history_response.status_code == 200
    assert history_response.json()["items"][0]["analysis_id"] == analysis_id

    detail_response = client.get(f"/api/v1/analyses/{analysis_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["analysis_id"] == analysis_id
    assert detail_response.json()["job_description"]["title"] == {
        "title": "Backend Engineer"
    }


def test_fresh_runtime_app_reopens_explicit_database(
    monkeypatch: Any, tmp_path: Path
) -> None:
    database_path = tmp_path / "history.db"
    monkeypatch.setenv(SQLITE_PATH_ENVIRONMENT_VARIABLE, str(database_path))

    first_app = create_runtime_app()
    first_response = TestClient(first_app).post(
        "/api/v1/analysis", json=_valid_payload()
    )
    analysis_id = first_response.json()["saved_analysis"]["analysis_id"]

    second_app = create_runtime_app()
    assert (
        second_app.state.analysis_repository is not first_app.state.analysis_repository
    )
    detail_response = TestClient(second_app).get(f"/api/v1/analyses/{analysis_id}")

    assert detail_response.status_code == 200
    assert detail_response.json()["analysis_id"] == analysis_id


def test_runtime_http_errors_do_not_expose_database_path(
    monkeypatch: Any, tmp_path: Path
) -> None:
    database_path = tmp_path / "private-location" / "history.db"
    monkeypatch.setenv(SQLITE_PATH_ENVIRONMENT_VARIABLE, str(database_path))
    client = TestClient(create_runtime_app())

    response = client.get(f"/api/v1/analyses/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "analysis_not_found"
    assert str(database_path) not in response.text
