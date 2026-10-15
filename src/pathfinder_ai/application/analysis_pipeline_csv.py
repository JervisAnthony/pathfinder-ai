"""Deterministic, metadata-only CSV reports with spreadsheet text protection."""

import csv
import io
import unicodedata

from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    AnalysisRepository,
)

MAX_PIPELINE_CSV_ROWS = 10_000
PIPELINE_CSV_COLUMNS = (
    "analysis_id",
    "created_at",
    "job_title",
    "company_name",
    "match_score",
    "ai_enriched",
    "application_status",
    "status_updated_at",
    "follow_up_on",
)


class ExportLimitExceededError(Exception):
    """The complete matching result exceeds the CSV row budget."""


class PipelineCsvUnavailableError(Exception):
    """The repository could not retrieve CSV summary metadata."""


def sanitize_csv_text(value: str | None) -> str:
    """Protect formulas, including prefixes concealed by whitespace/controls."""
    if value is None:
        return ""
    for character in value:
        if character.isspace() or unicodedata.category(character) in ("Cc", "Cf"):
            continue
        if character in "=+-@":
            return "'" + value
        break
    return value


class ApplicationPipelineCsvService:
    def __init__(self, repository: AnalysisRepository) -> None:
        self._repository = repository

    def export(self, history_filter: AnalysisHistoryFilter) -> bytes:
        summaries = self._repository.list_export_summaries(
            history_filter=history_filter, max_rows=MAX_PIPELINE_CSV_ROWS
        )
        if len(summaries) > MAX_PIPELINE_CSV_ROWS:
            raise ExportLimitExceededError()
        output = io.StringIO(newline="")
        writer = csv.writer(output, lineterminator="\r\n")
        writer.writerow(PIPELINE_CSV_COLUMNS)
        for item in summaries:
            writer.writerow(
                (
                    str(item.analysis_id),
                    item.created_at.isoformat(),
                    sanitize_csv_text(item.job_title),
                    sanitize_csv_text(item.company_name),
                    "" if item.score is None else str(item.score),
                    str(item.ai_enriched).lower(),
                    item.application_status.value,
                    item.status_updated_at.isoformat()
                    if item.status_updated_at
                    else "",
                    item.follow_up_on.isoformat() if item.follow_up_on else "",
                )
            )
        return output.getvalue().encode("utf-8-sig")
