"""
SQLite implementation of the analysis repository.
"""

import sqlite3
import uuid
from pathlib import Path
from typing import Any

from pathfinder_ai.application.analysis_history import (
    AnalysisRepository,
    SavedAnalysis,
    SavedAnalysisSummary,
)
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

    def list_recent(
        self, *, limit: int, offset: int
    ) -> tuple[SavedAnalysisSummary, ...]:
        """List lightweight analysis summaries."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT
                    analysis_id,
                    created_at,
                    job_title,
                    company_name,
                    score,
                    ai_enriched
                FROM saved_analyses
                ORDER BY created_at DESC, analysis_id DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
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
            )
            for row in rows
        )
