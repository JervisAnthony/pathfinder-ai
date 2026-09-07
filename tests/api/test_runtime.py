"""Tests for explicit runtime persistence wiring."""

import uuid
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from tests.infrastructure.test_openai_ai_enrichment import make_client

from pathfinder_ai.api import create_app, runtime
from pathfinder_ai.api.runtime import (
    SQLITE_PATH_ENVIRONMENT_VARIABLE,
    create_runtime_app,
)
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


@pytest.fixture(autouse=True)
def clear_openai_configuration(monkeypatch):
    monkeypatch.delenv("PATHFINDER_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("PATHFINDER_OPENAI_MODEL", raising=False)


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


@pytest.mark.parametrize(
    "key,model",
    [
        ("SYNTHETIC-NOT-A-CREDENTIAL", None),
        (None, "synthetic-model"),
        ("SYNTHETIC-NOT-A-CREDENTIAL", " "),
        (" ", "synthetic-model"),
    ],
)
def test_partial_configuration_fails_without_side_effects(
    monkeypatch, tmp_path, key, model
):
    if key is not None:
        monkeypatch.setenv("PATHFINDER_OPENAI_API_KEY", key)
    if model is not None:
        monkeypatch.setenv("PATHFINDER_OPENAI_MODEL", model)
    path = tmp_path / "should-not-exist.db"
    monkeypatch.setenv("PATHFINDER_SQLITE_PATH", str(path))
    factory = Mock(side_effect=AssertionError("client constructed"))
    monkeypatch.setattr(runtime, "OpenAI", factory)
    with pytest.raises(ValueError) as caught:
        create_runtime_app()
    assert "must both be nonblank" in str(caught.value)
    assert "SYNTHETIC-NOT-A-CREDENTIAL" not in str(caught.value)
    assert not path.exists()
    factory.assert_not_called()


@pytest.mark.parametrize("ai", [False, True])
@pytest.mark.parametrize("persistence", [False, True])
def test_independent_runtime_adapters_and_fresh_clients(
    monkeypatch, tmp_path, ai, persistence
):
    monkeypatch.delenv("PATHFINDER_SQLITE_PATH", raising=False)
    if persistence:
        monkeypatch.setenv("PATHFINDER_SQLITE_PATH", str(tmp_path / "history.db"))
    if ai:
        monkeypatch.setenv("PATHFINDER_OPENAI_API_KEY", "SYNTHETIC-NOT-A-CREDENTIAL")
        monkeypatch.setenv("PATHFINDER_OPENAI_MODEL", "synthetic-configured-model")
    clients = [make_client(), make_client()]
    factory = Mock(side_effect=clients)
    monkeypatch.setattr(runtime, "OpenAI", factory)
    first_app = create_runtime_app()
    second_app = create_runtime_app()
    with TestClient(first_app) as first, TestClient(second_app) as second:
        for client in (first, second):
            assert client.get("/api/v1/capabilities").json() == {
                "ai_enrichment_available": ai,
                "persistence_available": persistence,
            }
            payload = _valid_payload()
            payload["save_analysis"] = persistence
            assert client.post("/api/v1/analysis", json=payload).status_code == 200
        if ai:
            assert first_app.state.ai_provider is not second_app.state.ai_provider
            for client in clients:
                client.responses.create.assert_not_called()
            payload["include_ai_enrichment"] = True
            response = first.post("/api/v1/analysis", json=payload)
            assert response.status_code == 200
            assert response.json()["ai_enrichment"]["provider_name"] == "OpenAI"
            assert (
                clients[0].responses.create.call_args.kwargs["model"]
                == "synthetic-configured-model"
            )
    assert factory.call_count == (2 if ai else 0)
    if ai:
        assert factory.call_args.kwargs == {
            "api_key": "SYNTHETIC-NOT-A-CREDENTIAL",
            "base_url": "https://api.openai.com/v1",
            "max_retries": 0,
            "timeout": 30.0,
        }
        for client in clients:
            client.close.assert_called_once()


def test_create_app_ignores_environment_and_runtime_treats_blank_as_unset(monkeypatch):
    monkeypatch.setenv("PATHFINDER_OPENAI_API_KEY", "SYNTHETIC-NOT-A-CREDENTIAL")
    monkeypatch.setenv("PATHFINDER_OPENAI_MODEL", "synthetic-model")
    monkeypatch.setenv("PATHFINDER_SQLITE_PATH", "unused.db")
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/capabilities").json() == {
            "ai_enrichment_available": False,
            "persistence_available": False,
        }
    monkeypatch.delenv("PATHFINDER_SQLITE_PATH")
    monkeypatch.setenv("PATHFINDER_OPENAI_API_KEY", "  ")
    monkeypatch.setenv("PATHFINDER_OPENAI_MODEL", "\n")
    assert create_runtime_app().state.ai_provider is None
