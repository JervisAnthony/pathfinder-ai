"""CSV metadata retrieval shares the History query across all result pages."""

import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import date
from pathlib import Path
from unittest.mock import Mock

import pytest

from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    ApplicationStatus,
)
from pathfinder_ai.application.analysis_pipeline_csv import (
    ApplicationPipelineCsvService,
    ExportLimitExceededError,
    PipelineCsvUnavailableError,
)
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


def seed(path: Path, count: int) -> None:
    with closing(sqlite3.connect(path)) as conn:
        conn.executemany(
            "INSERT INTO saved_analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    str(uuid.UUID(int=index)),
                    "2026-01-01T00:00:00+00:00",
                    'Fictional 100% Data_Engineer "role"',
                    r"Example \"Company" if index % 2 else None,
                    None if index % 5 == 0 else float(index % 101),
                    index % 2,
                    2,
                    "PRIVATE immutable snapshot",
                )
                for index in range(1, count + 1)
            ],
        )
        conn.executemany(
            "INSERT INTO analysis_tracking VALUES (?, ?, ?)",
            [
                (
                    str(uuid.UUID(int=index)),
                    list(ApplicationStatus)[index % 7].value,
                    "2026-01-02T00:00:00+00:00",
                )
                for index in range(1, count + 1)
                if index % 3
            ],
        )
        conn.executemany(
            "INSERT INTO analysis_follow_ups VALUES (?, ?, ?)",
            [
                (
                    str(uuid.UUID(int=index)),
                    "2000-02-29" if index % 2 else "2099-12-31",
                    "2026-01-03T00:00:00+00:00",
                )
                for index in range(1, count + 1)
                if index % 4
            ],
        )
        conn.execute(
            "INSERT INTO analysis_notes VALUES (?, ?, ?)",
            (str(uuid.UUID(int=1)), "PRIVATE note", "2026-01-04T00:00:00+00:00"),
        )
        conn.commit()


@pytest.mark.parametrize(
    "criteria",
    [
        AnalysisHistoryFilter(),
        AnalysisHistoryFilter(query="100%"),
        AnalysisHistoryFilter(query="Data_Engineer"),
        AnalysisHistoryFilter(query="100_"),
        AnalysisHistoryFilter(query="Example \\"),
        AnalysisHistoryFilter(query="' OR 1=1 --"),
        AnalysisHistoryFilter(query='"role"'),
        AnalysisHistoryFilter(ai_enriched=True),
        AnalysisHistoryFilter(ai_enriched=False),
        AnalysisHistoryFilter(min_score=0, max_score=0),
        AnalysisHistoryFilter(min_score=10, max_score=20),
        AnalysisHistoryFilter(application_status=ApplicationStatus.NOT_APPLIED),
        AnalysisHistoryFilter(application_status=ApplicationStatus.REJECTED),
        AnalysisHistoryFilter(has_follow_up=True),
        AnalysisHistoryFilter(has_follow_up=False),
        AnalysisHistoryFilter(follow_up_from=date(2000, 2, 29)),
        AnalysisHistoryFilter(follow_up_to=date(2000, 2, 29)),
        AnalysisHistoryFilter(
            follow_up_from=date(2000, 2, 29), follow_up_to=date(2000, 2, 29)
        ),
        AnalysisHistoryFilter(sort="follow_up_asc"),
        AnalysisHistoryFilter(has_follow_up=False, sort="follow_up_asc"),
        AnalysisHistoryFilter(
            query="100% Data_Engineer",
            ai_enriched=True,
            min_score=1,
            max_score=100,
            application_status=ApplicationStatus.APPLIED,
            has_follow_up=True,
            follow_up_from=date(2000, 2, 29),
            follow_up_to=date(2099, 12, 31),
            sort="follow_up_asc",
        ),
    ],
)
def test_csv_export_matches_every_history_page_without_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    criteria: AnalysisHistoryFilter,
) -> None:
    path = tmp_path / "parity.db"
    repo = SQLiteAnalysisRepository(path)
    seed(path, 47)
    repo = SQLiteAnalysisRepository(path)  # Existing persisted data remains compatible.
    tables = (
        "saved_analyses",
        "analysis_tracking",
        "analysis_follow_ups",
        "analysis_notes",
        "analysis_tracking_events",
    )
    with closing(sqlite3.connect(path)) as conn:
        before = {
            table: conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in tables
        }
    monkeypatch.setattr(
        "pathfinder_ai.infrastructure.sqlite_analysis_repository.decode_analysis",
        Mock(side_effect=AssertionError("No snapshot decoding")),
    )
    expected = tuple(
        item
        for offset in range(0, 60, 7)
        for item in repo.list_recent(limit=7, offset=offset, history_filter=criteria)
    )
    result = repo.list_export_summaries(history_filter=criteria, max_rows=10_000)
    assert result == expected
    if criteria.query == "Example \\":
        assert len(result) == 24
    if criteria.query == "100_":
        assert result == ()
    if criteria == AnalysisHistoryFilter():
        assert len(result) == 47
        assert result != repo.list_recent(limit=20, offset=20)
    with closing(sqlite3.connect(path)) as conn:
        assert {
            table: conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in tables
        } == before


def test_empty_and_single_statement_bounded_export_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "bounded.db"
    repo = SQLiteAnalysisRepository(path)
    assert (
        repo.list_export_summaries(
            history_filter=AnalysisHistoryFilter(), max_rows=10_000
        )
        == ()
    )
    seed(path, 27)
    original = repo._get_connection
    statements: list[str] = []
    connections: list[sqlite3.Connection] = []

    @contextmanager
    def connection() -> Iterator[sqlite3.Connection]:
        with original() as conn:
            connections.append(conn)
            conn.set_trace_callback(statements.append)
            yield conn

    monkeypatch.setattr(repo, "_get_connection", connection)
    result = repo.list_export_summaries(
        history_filter=AnalysisHistoryFilter(sort="follow_up_asc"), max_rows=10
    )
    assert len(result) == 11
    assert len(statements) == 1 and "LIMIT 11 OFFSET 0" in statements[0]
    assert "payload_json" not in statements[0] and "analysis_notes" not in statements[0]
    assert statements[0].lstrip().startswith("SELECT")
    assert result[0].follow_up_on == date(2000, 2, 29)
    with pytest.raises(sqlite3.ProgrammingError):
        connections[0].execute("SELECT 1")


@pytest.mark.parametrize("count", [10_000, 10_001])
def test_real_database_export_limit(tmp_path: Path, count: int) -> None:
    path = tmp_path / "limit.db"
    repo = SQLiteAnalysisRepository(path)
    seed(path, count)
    if count == 10_000:
        assert (
            ApplicationPipelineCsvService(repo)
            .export(AnalysisHistoryFilter())
            .startswith(b"\xef\xbb\xbf")
        )
    else:
        with pytest.raises(ExportLimitExceededError):
            ApplicationPipelineCsvService(repo).export(AnalysisHistoryFilter())


def test_storage_errors_are_scoped_and_programming_errors_propagate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "errors.db")
    monkeypatch.setattr(
        repo,
        "_get_connection",
        Mock(side_effect=sqlite3.OperationalError("PRIVATE path")),
    )
    with pytest.raises(PipelineCsvUnavailableError):
        repo.list_export_summaries(
            history_filter=AnalysisHistoryFilter(), max_rows=10_000
        )
    monkeypatch.setattr(
        repo, "_list_summaries", Mock(side_effect=RuntimeError("programming defect"))
    )
    with pytest.raises(RuntimeError, match="programming defect"):
        repo.list_export_summaries(
            history_filter=AnalysisHistoryFilter(), max_rows=10_000
        )
