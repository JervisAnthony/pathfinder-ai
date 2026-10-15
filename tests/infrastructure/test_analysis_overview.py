"""Pipeline aggregates read only summary metadata in a consistent snapshot."""

import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from pathfinder_ai.application.analysis_follow_up import AnalysisFollowUpService
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryService,
    ApplicationStatus,
)
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)

STAMP = datetime(2026, 1, 1, tzinfo=UTC)


def seed(path: Path, count: int) -> None:
    with closing(sqlite3.connect(path)) as conn:
        for index in range(1, count + 1):
            conn.execute(
                "INSERT INTO saved_analyses VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.UUID(int=index)),
                    STAMP.isoformat(),
                    "Fictional Engineer",
                    None if index == 1 else "Example Company",
                    50,
                    0,
                    2,
                    "PRIVATE snapshot deliberately cannot be decoded",
                ),
            )
        conn.commit()


def test_empty_and_preexisting_metadata_database(tmp_path: Path) -> None:
    path = tmp_path / "existing.db"
    repo = SQLiteAnalysisRepository(path)
    empty = repo.get_pipeline_overview()
    assert (
        empty.total_analyses
        == empty.scheduled_follow_up_count
        == empty.unscheduled_follow_up_count
        == 0
    )
    assert empty.earliest_follow_ups == ()
    assert [(item.status, item.count) for item in empty.status_counts] == [
        (status, 0) for status in ApplicationStatus
    ]
    seed(path, 1)
    # Reopening the existing database neither changes schema nor creates metadata.
    with closing(sqlite3.connect(path)) as conn:
        schema = conn.execute("SELECT sql FROM sqlite_master ORDER BY name").fetchall()
    reopened = SQLiteAnalysisRepository(path)
    overview = reopened.get_pipeline_overview()
    assert overview.total_analyses == overview.unscheduled_follow_up_count == 1
    assert overview.scheduled_follow_up_count == 0
    assert overview.status_counts[0].count == 1
    assert all(item.count == 0 for item in overview.status_counts[1:])
    with closing(sqlite3.connect(path)) as conn:
        assert (
            conn.execute("SELECT sql FROM sqlite_master ORDER BY name").fetchall()
            == schema
        )
        for table in (
            "analysis_tracking",
            "analysis_follow_ups",
            "analysis_notes",
            "analysis_tracking_events",
        ):
            assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0


@pytest.mark.parametrize("scheduled", [0, 1, 4, 5, 8])
def test_overview_counts_dates_tiebreakers_and_immutability(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    scheduled: int,
) -> None:
    path = tmp_path / "overview.db"
    repo = SQLiteAnalysisRepository(path)
    seed(path, 9)
    history = AnalysisHistoryService(repo, clock=lambda: STAMP)
    follow_ups = AnalysisFollowUpService(repo, clock=lambda: STAMP)
    # Missing tracking rows and an explicit not_applied row; all categories.
    history.update_application_status(uuid.UUID(int=2), ApplicationStatus.APPLIED)
    for index, status in enumerate(ApplicationStatus, 2):
        history.update_application_status(uuid.UUID(int=index), status)
    dates = [
        date(1999, 12, 31),
        date(2024, 2, 29),
        date(2024, 2, 29),
        date(2024, 2, 29),
        date(2099, 1, 1),
        date(2099, 1, 1),
        date(2099, 1, 1),
        date(2099, 1, 1),
    ]
    for index, day in enumerate(dates[:scheduled], 1):
        follow_ups.update_follow_up(uuid.UUID(int=index), day)
    with closing(sqlite3.connect(path)) as conn:
        # ID 2 wins the timestamp tie; ID 4 beats ID 3 on identifier.
        conn.execute(
            "UPDATE saved_analyses SET created_at=? WHERE analysis_id=?",
            ("2026-01-02T00:00:00+00:00", str(uuid.UUID(int=2))),
        )
        conn.commit()
        tables = [
            "saved_analyses",
            "analysis_tracking",
            "analysis_follow_ups",
            "analysis_notes",
            "analysis_tracking_events",
        ]
        baseline = {
            table: conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in tables
        }
    monkeypatch.setattr(
        "pathfinder_ai.infrastructure.sqlite_analysis_repository.decode_analysis",
        lambda *_: pytest.fail("Overview must not decode snapshots"),
    )
    overview = repo.get_pipeline_overview()
    assert overview.total_analyses == 9
    assert [item.status for item in overview.status_counts] == list(ApplicationStatus)
    assert [item.count for item in overview.status_counts] == [3, 1, 1, 1, 1, 1, 1]
    assert sum(item.count for item in overview.status_counts) == 9
    assert overview.scheduled_follow_up_count == scheduled
    assert overview.unscheduled_follow_up_count == 9 - scheduled
    expected = sorted(
        range(1, scheduled + 1),
        key=lambda index: (dates[index - 1], -(2 if index == 2 else 1), -index),
    )[:5]
    assert [item.analysis_id.int for item in overview.earliest_follow_ups] == expected
    assert [item.follow_up_on for item in overview.earliest_follow_ups] == [
        dates[index - 1] for index in expected
    ]
    assert overview == repo.get_pipeline_overview()
    with closing(sqlite3.connect(path)) as conn:
        assert {
            table: conn.execute(f"SELECT * FROM {table} ORDER BY 1").fetchall()
            for table in tables
        } == baseline


def test_overview_reflects_workflow_changes_and_deletion(tmp_path: Path) -> None:
    path = tmp_path / "mutations.db"
    repo = SQLiteAnalysisRepository(path)
    seed(path, 1)
    history = AnalysisHistoryService(repo, clock=lambda: STAMP)
    follow_ups = AnalysisFollowUpService(repo, clock=lambda: STAMP)
    identifier = uuid.UUID(int=1)
    for status in ApplicationStatus:
        history.update_application_status(identifier, status)
        follow_ups.update_follow_up(identifier, date(2000, 1, 1))
        overview = repo.get_pipeline_overview()
        assert (
            next(item.count for item in overview.status_counts if item.status == status)
            == 1
        )
        assert overview.earliest_follow_ups[0].application_status is status
    follow_ups.update_follow_up(identifier, date(2099, 12, 31))
    assert repo.get_pipeline_overview().earliest_follow_ups[0].follow_up_on == date(
        2099, 12, 31
    )
    follow_ups.clear_follow_up(identifier)
    overview = repo.get_pipeline_overview()
    assert overview.scheduled_follow_up_count == 0
    assert overview.unscheduled_follow_up_count == 1
    assert overview.earliest_follow_ups == ()
    follow_ups.update_follow_up(identifier, date(2000, 1, 1))
    assert history.delete_analysis(identifier)
    empty = repo.get_pipeline_overview()
    assert (
        empty.total_analyses
        == empty.scheduled_follow_up_count
        == empty.unscheduled_follow_up_count
        == 0
    )
    assert empty.earliest_follow_ups == ()
    assert sum(item.count for item in empty.status_counts) == 0


def test_overview_queries_share_snapshot_during_concurrent_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "consistent.db"
    repo = SQLiteAnalysisRepository(path)
    seed(path, 1)
    with closing(sqlite3.connect(path)) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
    original = repo._get_connection
    statements: list[str] = []
    connections: list[sqlite3.Connection] = []

    @contextmanager
    def connection() -> Iterator[sqlite3.Connection]:
        with original() as reader:
            connections.append(reader)

            def trace(sql: str) -> None:
                statements.append(sql)
                if "LIMIT 5" in sql:
                    assert reader.in_transaction
                    with closing(sqlite3.connect(path)) as writer:
                        writer.execute(
                            "INSERT INTO analysis_follow_ups VALUES (?, ?, ?)",
                            (str(uuid.UUID(int=1)), "2000-01-01", STAMP.isoformat()),
                        )
                        writer.commit()

            reader.set_trace_callback(trace)
            yield reader

    monkeypatch.setattr(repo, "_get_connection", connection)
    overview = repo.get_pipeline_overview()
    assert overview.scheduled_follow_up_count == 0
    assert overview.earliest_follow_ups == ()
    assert sum(sql.lstrip().startswith("SELECT") for sql in statements) == 2
    assert statements[0] == "BEGIN" and statements[-1] == "COMMIT"
    assert all(
        "payload_json" not in sql and "analysis_notes" not in sql for sql in statements
    )
    with pytest.raises(sqlite3.ProgrammingError):
        connections[0].execute("SELECT 1")
    monkeypatch.setattr(repo, "_get_connection", original)
    assert repo.get_pipeline_overview().scheduled_follow_up_count == 1


def test_overview_failed_read_rolls_back_and_closes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo = SQLiteAnalysisRepository(tmp_path / "failed.db")
    original = repo._get_connection
    statements: list[str] = []
    connections: list[sqlite3.Connection] = []

    @contextmanager
    def connection() -> Iterator[sqlite3.Connection]:
        with original() as conn:
            connections.append(conn)
            conn.set_trace_callback(statements.append)
            conn.set_authorizer(
                lambda action, _table, column, *_: (
                    sqlite3.SQLITE_DENY
                    if action == sqlite3.SQLITE_READ and column == "job_title"
                    else sqlite3.SQLITE_OK
                )
            )
            yield conn

    monkeypatch.setattr(repo, "_get_connection", connection)
    with pytest.raises(sqlite3.DatabaseError):
        repo.get_pipeline_overview()
    assert statements[-1] == "ROLLBACK"
    with pytest.raises(sqlite3.ProgrammingError):
        connections[0].execute("SELECT 1")
