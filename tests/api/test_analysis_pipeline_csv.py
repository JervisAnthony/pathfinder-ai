"""CSV transport, filter parity, row limits, errors, and snapshot boundaries."""

import csv
import io
import sqlite3
import uuid
from contextlib import closing
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api.app import create_app
from pathfinder_ai.application.analysis_history import AnalysisRepository
from pathfinder_ai.application.analysis_pipeline_csv import PipelineCsvUnavailableError
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)

HEADERS = [
    "analysis_id",
    "created_at",
    "job_title",
    "company_name",
    "match_score",
    "ai_enriched",
    "application_status",
    "status_updated_at",
    "follow_up_on",
]


def parse(content: bytes) -> list[list[str]]:
    assert content.startswith(b"\xef\xbb\xbf")
    return list(csv.reader(io.StringIO(content.decode("utf-8-sig"), newline="")))


@pytest.fixture
def saved_client(tmp_path: Path) -> tuple[TestClient, SQLiteAnalysisRepository, Path]:
    path = tmp_path / "csv.db"
    repo = SQLiteAnalysisRepository(path)
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
    identifier = uuid.UUID(response.json()["saved_analysis"]["analysis_id"])
    snapshot = repo.get(identifier)
    assert snapshot is not None
    repo.delete(identifier)
    repo.save(
        replace(
            snapshot,
            analysis_id=uuid.UUID(int=1),
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
    )
    return client, repo, path


def test_empty_csv_headers_and_openapi(tmp_path: Path) -> None:
    client = TestClient(
        create_app(analysis_repository=SQLiteAnalysisRepository(tmp_path / "empty.db"))
    )
    response = client.get("/api/v1/analyses/export.csv")
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="pathfinder-application-pipeline.csv"'
    )
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert parse(response.content) == [HEADERS]
    assert response.content.endswith(b"\r\n")
    spec = client.get("/openapi.json").json()
    operation = spec["paths"]["/api/v1/analyses/export.csv"]["get"]
    assert set(operation["responses"]) == {"200", "413", "422", "503"}
    assert set(operation["responses"]["200"]["content"]) == {"text/csv"}
    for status in ("413", "422", "503"):
        assert operation["responses"][status]["content"]["application/json"]["schema"][
            "$ref"
        ].endswith("/ErrorResponseSchema")
    listing_parameters = {
        item["name"]: item["schema"]
        for item in spec["paths"]["/api/v1/analyses"]["get"]["parameters"]
    }
    export_parameters = {
        item["name"]: item["schema"] for item in operation["parameters"]
    }
    assert export_parameters == {
        key: value
        for key, value in listing_parameters.items()
        if key not in ("limit", "offset")
    }


def test_csv_values_and_individual_exports_unchanged(
    saved_client: tuple[TestClient, SQLiteAnalysisRepository, Path],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, repo, path = saved_client
    root = f"/api/v1/analyses/{uuid.UUID(int=1)}"
    baseline = {
        format: client.get(f"{root}/export?format={format}").content
        for format in ("json", "markdown")
    }
    assert (
        client.put(f"{root}/note", json={"content": "PRIVATE note"}).status_code == 200
    )
    assert (
        client.put(
            f"{root}/tracking", json={"application_status": "applied"}
        ).status_code
        == 200
    )
    assert (
        client.put(f"{root}/follow-up", json={"follow_up_on": "2000-02-29"}).status_code
        == 200
    )
    for format, content in baseline.items():
        assert client.get(f"{root}/export?format={format}").content == content
    assert client.get("/api/v1/analyses/overview").json()["total_analyses"] == 1
    monkeypatch.setattr(
        "pathfinder_ai.infrastructure.sqlite_analysis_repository.decode_analysis",
        Mock(side_effect=AssertionError("CSV must not decode snapshots")),
    )
    tracking = repo.get_tracking(uuid.UUID(int=1))
    response = client.get("/api/v1/analyses/export.csv")
    assert response.status_code == 200
    assert tracking is not None and tracking.updated_at is not None
    assert parse(response.content) == [
        HEADERS,
        [
            str(uuid.UUID(int=1)),
            "2026-01-01T00:00:00+00:00",
            "Fictional Engineer",
            "",
            "100.0",
            "false",
            "applied",
            tracking.updated_at.isoformat(),
            "2000-02-29",
        ],
    ]
    assert (
        b"PRIVATE" not in response.content
        and b"candidate_profile" not in response.content
    )
    with closing(sqlite3.connect(path)) as conn:
        conn.execute(
            "UPDATE saved_analyses SET job_title=?, company_name=?, score=NULL",
            ('\t=SUM(1),"quoted"\r\nline', "\u5de5\u7a0b\u5e08"),
        )
        conn.commit()
    rows = parse(client.get("/api/v1/analyses/export.csv").content)
    assert rows[1][2:5] == ['\'\t=SUM(1),"quoted"\r\nline', "\u5de5\u7a0b\u5e08", ""]
    assert len(rows) == 2 and len(rows[1]) == 9


@pytest.mark.parametrize(
    "parameters",
    [
        {},
        {"ai_enriched": "false", "min_score": "0"},
        {"query": "Fictional"},
        {"query": "missing"},
        {"has_follow_up": "false", "sort": "follow_up_asc"},
        {
            "has_follow_up": "true",
            "follow_up_from": "2000-02-29",
            "follow_up_to": "2000-02-29",
        },
        {
            "application_status": "not_applied",
            "max_score": "100",
            "sort": "created_desc",
        },
    ],
)
def test_csv_exports_every_matching_page_in_history_order(
    saved_client: tuple[TestClient, SQLiteAnalysisRepository, Path],
    parameters: dict[str, str],
) -> None:
    client, repo, _ = saved_client
    snapshot = repo.get(uuid.UUID(int=1))
    assert snapshot is not None
    for index in range(2, 28):
        repo.save(replace(snapshot, analysis_id=uuid.UUID(int=index)))
    expected = [
        item["analysis_id"]
        for offset in (0, 7, 14, 21)
        for item in client.get(
            "/api/v1/analyses", params={**parameters, "limit": 7, "offset": offset}
        ).json()["items"]
    ]
    response = client.get(
        "/api/v1/analyses/export.csv",
        params={**parameters, "limit": "1", "offset": "20"},
    )
    assert response.status_code == 200
    rows = parse(response.content)
    assert rows[0] == HEADERS
    assert [row[0] for row in rows[1:]] == expected


@pytest.mark.parametrize(
    "parameters",
    [
        {"query": "x" * 201},
        {"min_score": "nan"},
        {"min_score": "80", "max_score": "20"},
        {"ai_enriched": "maybe"},
        {"has_follow_up": "maybe"},
        {"application_status": "invalid"},
        {"sort": "invalid"},
        {"follow_up_from": "2026-02-29"},
        {"follow_up_to": "20260101"},
        {"follow_up_from": "2026-01-01T00:00:00Z"},
        {"follow_up_to": "2026-01-01+00:00"},
        {"follow_up_from": "2026-01-02", "follow_up_to": "2026-01-01"},
        {"has_follow_up": "false", "follow_up_from": "2026-01-01"},
    ],
)
def test_csv_and_history_reject_the_same_invalid_filters(
    parameters: dict[str, str],
) -> None:
    client = TestClient(create_app())
    csv_response = client.get("/api/v1/analyses/export.csv", params=parameters)
    listing = client.get("/api/v1/analyses", params=parameters)
    assert csv_response.status_code == listing.status_code == 422
    assert csv_response.json() == listing.json()
    assert csv_response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("configured", [False, True])
def test_csv_persistence_unavailable_is_safe(configured: bool) -> None:
    repo = Mock(spec=AnalysisRepository) if configured else None
    if repo is not None:
        repo.list_export_summaries.side_effect = PipelineCsvUnavailableError(
            "PRIVATE path"
        )
    response = TestClient(create_app(analysis_repository=repo)).get(
        "/api/v1/analyses/export.csv"
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "persistence_unavailable"
    assert response.headers["cache-control"] == "no-store"
    assert "PRIVATE" not in response.text


@pytest.mark.parametrize("count", [10_000, 10_001])
def test_csv_real_row_limit_and_no_partial_attachment(
    tmp_path: Path, count: int
) -> None:
    path = tmp_path / "large.db"
    repo = SQLiteAnalysisRepository(path)
    with closing(sqlite3.connect(path)) as conn:
        conn.executemany(
            "INSERT INTO saved_analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    str(uuid.UUID(int=index)),
                    "2026-01-01T00:00:00+00:00",
                    "Fictional Engineer",
                    None,
                    0,
                    0,
                    2,
                    "PRIVATE snapshot",
                )
                for index in range(1, count + 1)
            ],
        )
        conn.commit()
    response = TestClient(create_app(analysis_repository=repo)).get(
        "/api/v1/analyses/export.csv"
    )
    if count == 10_000:
        assert response.status_code == 200 and len(parse(response.content)) == 10_001
    else:
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "export_limit_exceeded"
        assert "narrower filters" in response.json()["error"]["message"]
        assert "content-disposition" not in response.headers
        assert response.headers["cache-control"] == "no-store"
        assert not response.content.startswith(b"\xef\xbb\xbf")
