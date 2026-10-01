"""Application note API contracts and separation from analysis snapshots."""

import sqlite3
import uuid
from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api.app import create_app
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


@pytest.fixture
def saved_note_client(tmp_path: Path) -> tuple[TestClient, str, Path]:
    path = tmp_path / "notes-api.db"
    client = TestClient(create_app(analysis_repository=SQLiteAnalysisRepository(path)))
    payload = {
        "candidate_profile": {
            "skills": [{"name": "Python"}],
            "experience": [],
            "education": [],
            "projects": [],
            "certifications": [],
            "preferences": None,
        },
        "job_description": {
            "title": {"title": "Fictional Engineer"},
            "responsibilities": [],
            "required_skills": [{"name": "Python"}],
            "preferred_skills": [],
            "company_info": None,
            "experience_requirement": None,
            "education_requirement": None,
        },
        "include_ai_enrichment": False,
        "save_analysis": True,
    }
    response = client.post("/api/v1/analysis", json=payload)
    assert response.status_code == 200
    return client, response.json()["saved_analysis"]["analysis_id"], path


def test_note_api_lifecycle_and_snapshot_boundaries(
    saved_note_client: tuple[TestClient, str, Path],
) -> None:
    client, identifier, path = saved_note_client
    url = f"/api/v1/analyses/{identifier}/note"
    detail_before = client.get(f"/api/v1/analyses/{identifier}").json()
    history_before = client.get("/api/v1/analyses").json()
    json_before = client.get(
        f"/api/v1/analyses/{identifier}/export?format=json"
    ).content
    markdown_before = client.get(
        f"/api/v1/analyses/{identifier}/export?format=markdown"
    ).content
    tracking_before = client.get(f"/api/v1/analyses/{identifier}/tracking").json()
    activity_before = client.get(
        f"/api/v1/analyses/{identifier}/tracking/history"
    ).json()
    with closing(sqlite3.connect(path)) as connection:
        row_before = connection.execute("SELECT * FROM saved_analyses").fetchall()
    empty = client.get(url)
    assert empty.status_code == 200
    assert empty.headers["Cache-Control"] == "no-store"
    assert empty.json() == {
        "analysis_id": identifier,
        "content": None,
        "updated_at": None,
    }
    content = "  Recruiter called\n🐍 <script>alert(1)</script> ' OR 1=1 --  "
    saved = client.put(url, json={"content": content})
    assert saved.status_code == 200
    assert saved.headers["Cache-Control"] == "no-store"
    assert set(saved.json()) == {"analysis_id", "content", "updated_at"}
    assert saved.json()["content"] == content
    assert saved.json()["updated_at"] is not None
    assert client.get(url).json() == saved.json()
    assert client.put(url, json={"content": content}).json() == saved.json()
    changed = client.put(url, json={"content": "Updated"})
    assert changed.status_code == 200
    assert changed.json()["content"] == "Updated"
    assert changed.json()["updated_at"] != saved.json()["updated_at"]
    assert client.get(f"/api/v1/analyses/{identifier}").json() == detail_before
    assert client.get("/api/v1/analyses").json() == history_before
    assert (
        client.get(f"/api/v1/analyses/{identifier}/export?format=json").content
        == json_before
    )
    assert (
        client.get(f"/api/v1/analyses/{identifier}/export?format=markdown").content
        == markdown_before
    )
    assert (
        client.get(f"/api/v1/analyses/{identifier}/tracking").json() == tracking_before
    )
    assert (
        client.get(f"/api/v1/analyses/{identifier}/tracking/history").json()
        == activity_before
    )
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT * FROM saved_analyses").fetchall() == row_before
        )
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_tracking").fetchone()[0]
            == 0
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM analysis_tracking_events"
            ).fetchone()[0]
            == 0
        )
    cleared = client.delete(url)
    assert cleared.status_code == 204
    assert cleared.content == b""
    assert client.delete(url).status_code == 204
    assert client.get(url).json() == empty.json()
    assert client.put(url, json={"content": "Final note"}).status_code == 200
    assert client.delete(f"/api/v1/analyses/{identifier}").status_code == 204
    with closing(sqlite3.connect(path)) as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM analysis_notes").fetchone()[0] == 0
        )
    assert client.get(url).status_code == 404


@pytest.mark.parametrize("content", ["", " \n\t ", "x" * 10_001])
def test_note_api_rejects_invalid_content(
    saved_note_client: tuple[TestClient, str, Path], content: str
) -> None:
    client, identifier, _ = saved_note_client
    response = client.put(
        f"/api/v1/analyses/{identifier}/note", json={"content": content}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert content not in response.text or not content


def test_note_api_accepts_exact_limit_and_rejects_extra_fields(
    saved_note_client: tuple[TestClient, str, Path],
) -> None:
    client, identifier, _ = saved_note_client
    url = f"/api/v1/analyses/{identifier}/note"
    assert client.put(url, json={"content": "🐍" * 10_000}).status_code == 200
    assert (
        client.put(url, json={"content": "text", "unexpected": True}).status_code == 422
    )


def test_note_api_errors_and_openapi(tmp_path: Path) -> None:
    missing = TestClient(
        create_app(analysis_repository=SQLiteAnalysisRepository(tmp_path / "empty.db"))
    )
    unavailable = TestClient(create_app())
    identifier = uuid.uuid4()
    for client, expected, code in (
        (missing, 404, "analysis_not_found"),
        (unavailable, 503, "persistence_unavailable"),
    ):
        url = f"/api/v1/analyses/{identifier}/note"
        for response in (
            client.get(url),
            client.put(url, json={"content": "text"}),
            client.delete(url),
        ):
            assert response.status_code == expected
            assert response.json()["error"]["code"] == code
        assert client.get("/api/v1/analyses/invalid/note").status_code == 422
        assert (
            client.put(
                "/api/v1/analyses/invalid/note", json={"content": "text"}
            ).status_code
            == 422
        )
        assert client.delete("/api/v1/analyses/invalid/note").status_code == 422
    spec = missing.get("/openapi.json").json()
    operations = spec["paths"]["/api/v1/analyses/{analysis_id}/note"]
    assert set(operations) == {"get", "put", "delete"}
    for operation in operations.values():
        assert {"404", "422", "503"} <= set(operation["responses"])
    request = spec["components"]["schemas"]["UpdateAnalysisNoteSchema"]
    assert request["properties"]["content"]["maxLength"] == 10_000
