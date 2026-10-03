"""
SQLite implementation of the analysis repository.
"""

import sqlite3
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from pathfinder_ai.application.analysis_follow_up import AnalysisFollowUp
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    AnalysisRepository,
    AnalysisTracking,
    ApplicationStatus,
    ApplicationStatusEvent,
    SavedAnalysis,
    SavedAnalysisSummary,
)
from pathfinder_ai.application.analysis_notes import AnalysisNote
from pathfinder_ai.infrastructure._analysis_codec import (
    CURRENT_PAYLOAD_VERSION,
    decode_analysis,
    encode_analysis,
)


class SQLiteAnalysisRepository(AnalysisRepository):
    """
    SQLite-backed repository for saved analyses.
    """

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._init_db()

    def _get_connection(self) -> Any:
        import contextlib

        conn = sqlite3.connect(
            self._path,
            detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return contextlib.closing(conn)

    def _init_db(self) -> None:
        """Create the schema if it does not exist."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_analyses (
                    analysis_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    job_title TEXT NOT NULL,
                    company_name TEXT NULL,
                    score REAL NULL,
                    ai_enriched INTEGER NOT NULL,
                    payload_version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            # Create an index for history listing
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_saved_analyses_created_at
                ON saved_analyses(created_at DESC, analysis_id DESC)
                """
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS analysis_tracking (
                    analysis_id TEXT PRIMARY KEY,
                    application_status TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (analysis_id) REFERENCES saved_analyses(analysis_id)
                    ON DELETE CASCADE
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS analysis_tracking_events (
                    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    analysis_id TEXT NOT NULL,
                    previous_status TEXT NOT NULL,
                    application_status TEXT NOT NULL,
                    changed_at TEXT NOT NULL,
                    FOREIGN KEY (analysis_id) REFERENCES saved_analyses(analysis_id)
                    ON DELETE CASCADE
                )"""
            )
            conn.execute(
                """CREATE INDEX IF NOT EXISTS
                idx_analysis_tracking_events_analysis_changed
                ON analysis_tracking_events(
                    analysis_id, changed_at DESC, event_id DESC
                )"""
            )
            conn.execute(
                """CREATE TABLE IF NOT EXISTS analysis_notes (
                    analysis_id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (analysis_id) REFERENCES saved_analyses(analysis_id)
                    ON DELETE CASCADE
                )"""
            )

            conn.execute(
                """CREATE TABLE IF NOT EXISTS analysis_follow_ups (
                    analysis_id TEXT PRIMARY KEY,
                    follow_up_on TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (analysis_id) REFERENCES saved_analyses(analysis_id)
                    ON DELETE CASCADE
                )"""
            )

    def save(self, analysis: SavedAnalysis) -> None:
        """Persist a complete analysis snapshot."""
        payload_json = encode_analysis(analysis)

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO saved_analyses (
                    analysis_id,
                    created_at,
                    job_title,
                    company_name,
                    score,
                    ai_enriched,
                    payload_version,
                    payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(analysis.analysis_id),
                    analysis.created_at.isoformat(),
                    analysis.job_description.title.title,
                    analysis.job_description.company_info.name
                    if analysis.job_description.company_info
                    else None,
                    analysis.match_explanation.score.value,
                    1 if analysis.ai_enrichment is not None else 0,
                    CURRENT_PAYLOAD_VERSION,
                    payload_json,
                ),
            )
            conn.commit()

    def get(self, analysis_id: uuid.UUID) -> SavedAnalysis | None:
        """Retrieve a complete analysis snapshot by ID."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT payload_version, payload_json
                FROM saved_analyses
                WHERE analysis_id = ?
                """,
                (str(analysis_id),),
            )
            row = cursor.fetchone()

        if row is None:
            return None

        return decode_analysis(row["payload_json"], row["payload_version"])

    def delete(self, analysis_id: uuid.UUID) -> bool:
        """Delete one analysis by ID and report whether it existed."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM saved_analyses WHERE analysis_id = ?",
                (str(analysis_id),),
            )
            conn.commit()
            return bool(cursor.rowcount == 1)

    def get_tracking(self, analysis_id: uuid.UUID) -> AnalysisTracking | None:
        with self._get_connection() as conn:
            row = conn.execute(
                """SELECT s.analysis_id, t.application_status, t.updated_at
                FROM saved_analyses AS s
                LEFT JOIN analysis_tracking AS t ON t.analysis_id = s.analysis_id
                WHERE s.analysis_id = ?""",
                (str(analysis_id),),
            ).fetchone()
        if row is None:
            return None
        return AnalysisTracking(
            analysis_id=analysis_id,
            application_status=ApplicationStatus(
                row["application_status"] or ApplicationStatus.NOT_APPLIED
            ),
            updated_at=(
                datetime.fromisoformat(row["updated_at"])
                if row["updated_at"] is not None
                else None
            ),
        )

    def upsert_tracking(self, tracking: AnalysisTracking) -> AnalysisTracking | None:
        if tracking.updated_at is None:
            raise ValueError("Only changed tracking can be persisted")
        with self._get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """SELECT t.application_status, t.updated_at FROM saved_analyses AS s
                LEFT JOIN analysis_tracking AS t ON t.analysis_id = s.analysis_id
                WHERE s.analysis_id = ?""",
                (str(tracking.analysis_id),),
            ).fetchone()
            if row is None:
                return None
            previous = ApplicationStatus(
                row["application_status"] or ApplicationStatus.NOT_APPLIED
            )
            if previous == tracking.application_status:
                return AnalysisTracking(
                    tracking.analysis_id,
                    previous,
                    datetime.fromisoformat(row["updated_at"])
                    if row["updated_at"] is not None
                    else None,
                )
            conn.execute(
                """INSERT INTO analysis_tracking
                (analysis_id, application_status, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(analysis_id) DO UPDATE SET
                    application_status = excluded.application_status,
                    updated_at = excluded.updated_at""",
                (
                    str(tracking.analysis_id),
                    tracking.application_status.value,
                    tracking.updated_at.isoformat(),
                ),
            )
            conn.execute(
                """INSERT INTO analysis_tracking_events
                (analysis_id, previous_status, application_status, changed_at)
                VALUES (?, ?, ?, ?)""",
                (
                    str(tracking.analysis_id),
                    previous.value,
                    tracking.application_status.value,
                    tracking.updated_at.isoformat(),
                ),
            )
            conn.commit()
            return tracking

    def list_tracking_events(
        self, analysis_id: uuid.UUID, *, limit: int, offset: int
    ) -> tuple[ApplicationStatusEvent, ...] | None:
        with self._get_connection() as conn:
            if (
                conn.execute(
                    "SELECT 1 FROM saved_analyses WHERE analysis_id = ?",
                    (str(analysis_id),),
                ).fetchone()
                is None
            ):
                return None
            rows = conn.execute(
                """SELECT previous_status, application_status, changed_at
                FROM analysis_tracking_events WHERE analysis_id = ?
                ORDER BY changed_at DESC, event_id DESC LIMIT ? OFFSET ?""",
                (str(analysis_id), limit, offset),
            ).fetchall()
        return tuple(
            ApplicationStatusEvent(
                analysis_id,
                ApplicationStatus(row["previous_status"]),
                ApplicationStatus(row["application_status"]),
                datetime.fromisoformat(row["changed_at"]),
            )
            for row in rows
        )

    def get_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        with self._get_connection() as conn:
            row = conn.execute(
                """SELECT n.content, n.updated_at FROM saved_analyses AS s
                LEFT JOIN analysis_notes AS n ON n.analysis_id = s.analysis_id
                WHERE s.analysis_id = ?""",
                (str(analysis_id),),
            ).fetchone()
        if row is None:
            return None
        return AnalysisNote(
            analysis_id,
            row["content"],
            datetime.fromisoformat(row["updated_at"])
            if row["updated_at"] is not None
            else None,
        )

    def upsert_note(self, note: AnalysisNote) -> AnalysisNote | None:
        if note.content is None or note.updated_at is None:
            raise ValueError("Only non-empty application notes can be persisted")
        with self._get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """SELECT n.content, n.updated_at FROM saved_analyses AS s
                LEFT JOIN analysis_notes AS n ON n.analysis_id = s.analysis_id
                WHERE s.analysis_id = ?""",
                (str(note.analysis_id),),
            ).fetchone()
            if row is None:
                return None
            if row["content"] == note.content:
                return AnalysisNote(
                    note.analysis_id,
                    row["content"],
                    datetime.fromisoformat(row["updated_at"]),
                )
            conn.execute(
                """INSERT INTO analysis_notes (analysis_id, content, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(analysis_id) DO UPDATE SET
                    content = excluded.content,
                    updated_at = excluded.updated_at""",
                (str(note.analysis_id), note.content, note.updated_at.isoformat()),
            )
            conn.commit()
        return note

    def clear_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        with self._get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if (
                conn.execute(
                    "SELECT 1 FROM saved_analyses WHERE analysis_id = ?",
                    (str(analysis_id),),
                ).fetchone()
                is None
            ):
                return None
            conn.execute(
                "DELETE FROM analysis_notes WHERE analysis_id = ?", (str(analysis_id),)
            )
            conn.commit()
        return AnalysisNote(analysis_id, None, None)

    def get_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        with self._get_connection() as conn:
            row = conn.execute(
                """SELECT f.follow_up_on, f.updated_at FROM saved_analyses AS s
                LEFT JOIN analysis_follow_ups AS f ON f.analysis_id = s.analysis_id
                WHERE s.analysis_id = ?""",
                (str(analysis_id),),
            ).fetchone()
        if row is None:
            return None
        return AnalysisFollowUp(
            analysis_id,
            date.fromisoformat(row["follow_up_on"])
            if row["follow_up_on"] is not None
            else None,
            datetime.fromisoformat(row["updated_at"])
            if row["updated_at"] is not None
            else None,
        )

    def upsert_follow_up(self, follow_up: AnalysisFollowUp) -> AnalysisFollowUp | None:
        if follow_up.follow_up_on is None or follow_up.updated_at is None:
            raise ValueError("Only non-empty application follow-ups can be persisted")
        with self._get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                """SELECT f.follow_up_on, f.updated_at FROM saved_analyses AS s
                LEFT JOIN analysis_follow_ups AS f ON f.analysis_id = s.analysis_id
                WHERE s.analysis_id = ?""",
                (str(follow_up.analysis_id),),
            ).fetchone()
            if row is None:
                return None
            if row["follow_up_on"] == follow_up.follow_up_on.isoformat():
                return AnalysisFollowUp(
                    follow_up.analysis_id,
                    date.fromisoformat(row["follow_up_on"]),
                    datetime.fromisoformat(row["updated_at"]),
                )
            conn.execute(
                """INSERT INTO analysis_follow_ups
                (analysis_id, follow_up_on, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(analysis_id) DO UPDATE SET
                    follow_up_on = excluded.follow_up_on,
                    updated_at = excluded.updated_at""",
                (
                    str(follow_up.analysis_id),
                    follow_up.follow_up_on.isoformat(),
                    follow_up.updated_at.isoformat(),
                ),
            )
            conn.commit()
        return follow_up

    def clear_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        with self._get_connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if (
                conn.execute(
                    "SELECT 1 FROM saved_analyses WHERE analysis_id = ?",
                    (str(analysis_id),),
                ).fetchone()
                is None
            ):
                return None
            conn.execute(
                "DELETE FROM analysis_follow_ups WHERE analysis_id = ?",
                (str(analysis_id),),
            )
            conn.commit()
        return AnalysisFollowUp(analysis_id, None, None)

    def list_recent(
        self,
        *,
        limit: int,
        offset: int,
        history_filter: AnalysisHistoryFilter | None = None,
    ) -> tuple[SavedAnalysisSummary, ...]:
        """List lightweight analysis summaries."""
        predicates: list[str] = []
        parameters: list[str | float | int] = []

        if history_filter is not None:
            if history_filter.query is not None:
                escaped_query = (
                    history_filter.query.replace("\\", "\\\\")
                    .replace("%", "\\%")
                    .replace("_", "\\_")
                )
                pattern = f"%{escaped_query}%"
                predicates.append(
                    "(LOWER(s.job_title) LIKE LOWER(?) ESCAPE '\\' "
                    "OR LOWER(COALESCE(s.company_name, '')) LIKE LOWER(?) ESCAPE '\\')"
                )
                parameters.extend((pattern, pattern))
            if history_filter.ai_enriched is not None:
                predicates.append("s.ai_enriched = ?")
                parameters.append(1 if history_filter.ai_enriched else 0)
            if history_filter.min_score is not None:
                predicates.append("s.score >= ?")
                parameters.append(history_filter.min_score)
            if history_filter.max_score is not None:
                predicates.append("s.score <= ?")
                parameters.append(history_filter.max_score)
            if history_filter.application_status is not None:
                predicates.append("COALESCE(t.application_status, 'not_applied') = ?")
                parameters.append(history_filter.application_status.value)

        where_clause = f"WHERE {' AND '.join(predicates)}" if predicates else ""
        parameters.extend((limit, offset))

        with self._get_connection() as conn:
            cursor = conn.execute(
                f"""
                SELECT
                    s.analysis_id,
                    s.created_at,
                    s.job_title,
                    s.company_name,
                    s.score,
                    s.ai_enriched,
                    COALESCE(t.application_status, 'not_applied') AS application_status,
                    t.updated_at AS status_updated_at,
                    f.follow_up_on
                FROM saved_analyses AS s
                LEFT JOIN analysis_tracking AS t ON t.analysis_id = s.analysis_id
                LEFT JOIN analysis_follow_ups AS f ON f.analysis_id = s.analysis_id
                {where_clause}
                ORDER BY s.created_at DESC, s.analysis_id DESC
                LIMIT ? OFFSET ?
                """,
                parameters,
            )
            rows = cursor.fetchall()

        return tuple(
            SavedAnalysisSummary(
                analysis_id=uuid.UUID(row["analysis_id"]),
                # Decode ISO format string back into a datetime object
                created_at=__import__("datetime").datetime.fromisoformat(
                    row["created_at"]
                ),
                job_title=row["job_title"],
                company_name=row["company_name"],
                score=row["score"],
                ai_enriched=bool(row["ai_enriched"]),
                application_status=ApplicationStatus(row["application_status"]),
                follow_up_on=(
                    date.fromisoformat(row["follow_up_on"])
                    if row["follow_up_on"] is not None
                    else None
                ),
                status_updated_at=(
                    datetime.fromisoformat(row["status_updated_at"])
                    if row["status_updated_at"] is not None
                    else None
                ),
            )
            for row in rows
        )
