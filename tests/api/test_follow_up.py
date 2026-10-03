"""Follow-up API contracts and immutable snapshot boundaries."""

import sqlite3
import uuid
from contextlib import closing
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api.app import create_app
from pathfinder_ai.api.routes import analysis as analysis_routes
from pathfinder_ai.application.ai_enrichment import AIEnrichmentResult
from pathfinder_ai.application.analysis_follow_up import AnalysisFollowUpService
from pathfinder_ai.application.interview_preparation import (
    DeterministicInterviewPreparer,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
)
from pathfinder_ai.domain.job_description import CompanyInfo
from pathfinder_ai.domain.job_title import JobTitle
from pathfinder_ai.domain.matching import DeterministicMatcher, MatchScore
from pathfinder_ai.infrastructure._analysis_codec import CURRENT_PAYLOAD_VERSION
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


@pytest.fixture
def saved_follow_up_client(tmp_path: Path) -> tuple[TestClient, str, Path]:
    path = tmp_path / "follow-up-api.db"
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


def test_follow_up_lifecycle_and_all_snapshot_boundaries(
    saved_follow_up_client: tuple[TestClient, str, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, identifier, path = saved_follow_up_client
    root = f"/api/v1/analyses/{identifier}"
    url = f"{root}/follow-up"
    repo = client.app.state.analysis_repository
    snapshot = repo.get(uuid.UUID(identifier))
    other = replace(snapshot, analysis_id=uuid.uuid4())
    repo.save(other)
    assert (
        client.put(
            f"{root}/tracking", json={"application_status": "applied"}
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"{root}/note", json={"content": "Fictional recruiter conversation"}
        ).status_code
        == 200
    )
    comparison_url = (
        f"/api/v1/analyses/compare?left_analysis_id={identifier}"
        f"&right_analysis_id={other.analysis_id}"
    )
    urls = [
        root,
        f"{root}/tracking",
        f"{root}/tracking/history",
        f"{root}/note",
        f"{root}/export?format=json",
        f"{root}/export?format=markdown",
        comparison_url,
    ]
    baseline = {endpoint: client.get(endpoint).content for endpoint in urls}
    history = client.get("/api/v1/analyses").json()
    assert all(item["follow_up_on"] is None for item in history["items"])
    tables = (
        "saved_analyses",
        "analysis_tracking",
        "analysis_tracking_events",
        "analysis_notes",
    )
    with closing(sqlite3.connect(path)) as connection:
        rows = {
            table: connection.execute(f"SELECT * FROM {table}").fetchall()
            for table in tables
        }
    calls = 0
    today = date(2026, 10, 3)

    def clock() -> datetime:
        nonlocal calls
        calls += 1
        return datetime(2026, 10, 3, tzinfo=UTC) + timedelta(seconds=calls)

    monkeypatch.setattr(
        analysis_routes,
        "AnalysisFollowUpService",
        lambda repository: AnalysisFollowUpService(repository, clock),
    )

    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("Follow-up invoked analysis, providers, or unrelated writes")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden)
    monkeypatch.setattr(DeterministicInterviewPreparer, "prepare", forbidden)
    monkeypatch.setattr(DeterministicLearningRecommender, "recommend", forbidden)
    monkeypatch.setattr(repo, "save", forbidden)
    monkeypatch.setattr(repo, "upsert_tracking", forbidden)
    monkeypatch.setattr(repo, "upsert_note", forbidden)
    # An injected provider must remain unused even when configured.
    provider = Mock()
    provider.enrich.side_effect = forbidden
    client.app.state.ai_provider = provider
    empty = client.get(url)
    assert empty.status_code == 200
    assert empty.headers["Cache-Control"] == "no-store"
    assert empty.json() == {
        "analysis_id": identifier,
        "follow_up_on": None,
        "updated_at": None,
    }
    assert client.delete(url).status_code == 204
    for index, scheduled in enumerate(
        (date(2099, 12, 31), today, date(2000, 1, 1)), start=1
    ):
        saved = client.put(url, json={"follow_up_on": scheduled.isoformat()})
        assert saved.status_code == 200
        assert saved.headers["Cache-Control"] == "no-store"
        assert saved.json() == {
            "analysis_id": identifier,
            "follow_up_on": scheduled.isoformat(),
            "updated_at": (datetime(2026, 10, 3, tzinfo=UTC) + timedelta(seconds=index))
            .isoformat()
            .replace("+00:00", "Z"),
        }
        fetched = client.get(url)
        assert fetched.status_code == 200
        assert fetched.headers["Cache-Control"] == "no-store"
        assert fetched.json() == saved.json()
        assert (
            client.put(url, json={"follow_up_on": scheduled.isoformat()}).json()
            == saved.json()
        )
        assert calls == index
        assert {endpoint: client.get(endpoint).content for endpoint in urls} == baseline
        assert client.get("/api/v1/analyses").json() == {
            "items": [
                {
                    **item,
                    "follow_up_on": scheduled.isoformat()
                    if item["analysis_id"] == identifier
                    else None,
                }
                for item in history["items"]
            ]
        }
    for _ in range(2):
        cleared = client.delete(url)
        assert cleared.status_code == 204
        assert cleared.content == b""
        assert cleared.headers["Cache-Control"] == "no-store"
        assert client.get(url).json() == empty.json()
        assert {endpoint: client.get(endpoint).content for endpoint in urls} == baseline
        assert client.get("/api/v1/analyses").json() == history
    assert calls == 3
    provider.enrich.assert_not_called()
    assert CURRENT_PAYLOAD_VERSION == 2
    with closing(sqlite3.connect(path)) as connection:
        assert {
            table: connection.execute(f"SELECT * FROM {table}").fetchall()
            for table in tables
        } == rows


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "private-invalid-date",
        "2026-02-30",
        "2026-13-01",
        "0000-01-01",
        "2026-1-01",
        "20261012",
        "2026-W42-1",
        "2026-10-12T00:00:00",
        "2026-10-12T00:00:00Z",
        "2026-10-12T05:30:00+05:30",
        "2026-10-12 00:00:00",
        " 2026-10-12",
        "2026-10-12\n",
        1791763200,
        1791763200.0,
        True,
        [],
        {},
    ],
)
def test_follow_up_put_rejects_non_calendar_dates(
    saved_follow_up_client: tuple[TestClient, str, Path], value: object
) -> None:
    client, identifier, _ = saved_follow_up_client
    url = f"/api/v1/analyses/{identifier}/follow-up"
    response = client.put(url, json={"follow_up_on": value})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "private-invalid-date" not in response.text
    assert client.get(url).json()["follow_up_on"] is None


@pytest.mark.parametrize(
    "field", ["analysis_id", "updated_at", "status", "content", "reminder_settings"]
)
def test_follow_up_put_rejects_extra_fields(
    saved_follow_up_client: tuple[TestClient, str, Path], field: str
) -> None:
    client, identifier, _ = saved_follow_up_client
    response = client.put(
        f"/api/v1/analyses/{identifier}/follow-up",
        json={"follow_up_on": "2026-10-12", field: "private-extra-value"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "private-extra-value" not in response.text


def test_follow_up_errors_and_openapi(tmp_path: Path) -> None:
    path = tmp_path / "private-location.db"
    missing = TestClient(create_app(analysis_repository=SQLiteAnalysisRepository(path)))
    unavailable = TestClient(create_app())
    for client, expected, code in (
        (missing, 404, "analysis_not_found"),
        (unavailable, 503, "persistence_unavailable"),
    ):
        url = f"/api/v1/analyses/{uuid.uuid4()}/follow-up"
        for response in (
            client.get(url),
            client.put(url, json={"follow_up_on": "2026-10-12"}),
            client.delete(url),
        ):
            assert response.status_code == expected
            assert response.json()["error"]["code"] == code
            assert str(path) not in response.text
            assert "payload_json" not in response.text
        invalid = "/api/v1/analyses/invalid/follow-up"
        for response in (
            client.get(invalid),
            client.put(invalid, json={"follow_up_on": "2026-10-12"}),
            client.delete(invalid),
        ):
            assert response.status_code == 422
            assert response.json()["error"]["code"] == "validation_error"
        assert client.put(url, json={}).status_code == 422
    spec = missing.get("/openapi.json").json()
    operations = spec["paths"]["/api/v1/analyses/{analysis_id}/follow-up"]
    assert set(operations) == {"get", "put", "delete"}
    for operation in operations.values():
        assert {"404", "422", "503"} <= set(operation["responses"])
    schemas = spec["components"]["schemas"]
    request = schemas["UpdateAnalysisFollowUpSchema"]
    assert request["properties"]["follow_up_on"]["type"] == "string"
    assert request["properties"]["follow_up_on"]["format"] == "date"
    assert request["required"] == ["follow_up_on"]
    assert request["additionalProperties"] is False
    response = schemas["AnalysisFollowUpSchema"]
    assert set(response["properties"]) == {"analysis_id", "follow_up_on", "updated_at"}
    assert response["additionalProperties"] is False
    parameters = spec["paths"]["/api/v1/analyses"]["get"]["parameters"]
    assert {parameter["name"] for parameter in parameters} == {
        "limit",
        "offset",
        "query",
        "ai_enriched",
        "min_score",
        "max_score",
        "application_status",
    }


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"query": "fictional"},
        {"query": "acme"},
        {"ai_enriched": "true"},
        {"ai_enriched": "false"},
        {"min_score": 60},
        {"max_score": 60},
        {"application_status": "applied"},
        {"application_status": "not_applied"},
        {
            "query": "fictional",
            "ai_enriched": "true",
            "min_score": 60,
            "max_score": 80,
            "application_status": "applied",
        },
    ],
)
def test_follow_up_history_filters_order_and_pagination(
    saved_follow_up_client: tuple[TestClient, str, Path], params: dict[str, str | int]
) -> None:
    client, identifier, _ = saved_follow_up_client
    repo = client.app.state.analysis_repository
    snapshot = repo.get(uuid.UUID(identifier))
    records = [
        replace(
            snapshot,
            analysis_id=uuid.uuid4(),
            created_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=i // 2),
            job_description=replace(
                snapshot.job_description,
                title=JobTitle("Fictional Engineer" if i % 2 else "Designer"),
            ),
            ai_enrichment=AIEnrichmentResult("Fictional enrichment", "fake")
            if i % 2
            else None,
            match_explanation=replace(
                snapshot.match_explanation, score=MatchScore(60.0 if i % 2 else 90.0)
            ),
        )
        for i in range(6)
    ]
    for i, record in enumerate(records):
        repo.save(
            replace(
                record,
                job_description=replace(
                    record.job_description,
                    company_info=CompanyInfo("Acme" if i % 3 else "Elsewhere"),
                ),
            )
        )
        if i % 2:
            assert (
                client.put(
                    f"/api/v1/analyses/{record.analysis_id}/tracking",
                    json={"application_status": "applied"},
                ).status_code
                == 200
            )
    before = client.get("/api/v1/analyses", params=params).json()
    page_params = {**params, "limit": 2, "offset": 1}
    before_page = client.get("/api/v1/analyses", params=page_params).json()
    scheduled = {
        str(record.analysis_id): date(2030 - i, 1, 1).isoformat()
        for i, record in enumerate(records)
        if i % 3
    }
    for analysis_id, scheduled_date in scheduled.items():
        assert (
            client.put(
                f"/api/v1/analyses/{analysis_id}/follow-up",
                json={"follow_up_on": scheduled_date},
            ).status_code
            == 200
        )
    for query, expected in ((params, before), (page_params, before_page)):
        assert client.get("/api/v1/analyses", params=query).json() == {
            "items": [
                {**item, "follow_up_on": scheduled.get(item["analysis_id"])}
                for item in expected["items"]
            ]
        }
