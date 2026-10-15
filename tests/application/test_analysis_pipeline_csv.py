"""CSV schema, date semantics, spreadsheet safety, and overflow rejection."""

import csv
import io
import uuid
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta, timezone
from unittest.mock import Mock

import pytest

from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    AnalysisRepository,
    ApplicationStatus,
    SavedAnalysisSummary,
)
from pathfinder_ai.application.analysis_pipeline_csv import (
    MAX_PIPELINE_CSV_ROWS,
    ApplicationPipelineCsvService,
    ExportLimitExceededError,
    sanitize_csv_text,
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


def summary() -> SavedAnalysisSummary:
    return SavedAnalysisSummary(
        analysis_id=uuid.UUID(int=1),
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        job_title="Fictional Engineer",
        company_name=None,
        score=None,
        ai_enriched=False,
    )


def export_rows(
    items: tuple[SavedAnalysisSummary, ...],
) -> tuple[bytes, list[list[str]]]:
    repository = Mock(spec=AnalysisRepository)
    repository.list_export_summaries.return_value = items
    content = ApplicationPipelineCsvService(repository).export(AnalysisHistoryFilter())
    return content, list(
        csv.reader(io.StringIO(content.decode("utf-8-sig"), newline=""))
    )


def test_header_only_and_bom() -> None:
    content, rows = export_rows(())
    assert content == b"\xef\xbb\xbf" + (",".join(HEADERS) + "\r\n").encode()
    assert rows == [HEADERS]


def test_null_fields_and_false_preserve_one_record() -> None:
    _, rows = export_rows((summary(),))
    assert rows == [
        HEADERS,
        [
            str(uuid.UUID(int=1)),
            "2026-01-01T00:00:00+00:00",
            "Fictional Engineer",
            "",
            "",
            "false",
            "not_applied",
            "",
            "",
        ],
    ]


@pytest.mark.parametrize("status", list(ApplicationStatus))
def test_every_status_precision_and_utc_dates(status: ApplicationStatus) -> None:
    item = replace(
        summary(),
        score=80.123456789,
        ai_enriched=True,
        application_status=status,
        created_at=datetime(2026, 1, 1, 3, tzinfo=timezone(timedelta(hours=3))),
        status_updated_at=datetime(2026, 1, 2, 2, tzinfo=timezone(timedelta(hours=2))),
        follow_up_on=date(2000, 2, 29),
    )
    _, rows = export_rows((item, replace(item, score=0.0)))
    assert rows[1] == [
        str(item.analysis_id),
        "2026-01-01T00:00:00+00:00",
        "Fictional Engineer",
        "",
        "80.123456789",
        "true",
        status.value,
        "2026-01-02T00:00:00+00:00",
        "2000-02-29",
    ]
    assert rows[2][4] == "0.0"


@pytest.mark.parametrize(
    "text",
    [
        "=SUM(A1:A2)",
        "+CMD(test)",
        "-formula",
        "@formula",
        "  =SUM(1)",
        "\t=SUM(1)",
        "\n=SUM(1)",
        "\r=SUM(1)",
        "\r\n=SUM(1)",
        "\u00a0=SUM(1)",
        "\u2003=SUM(1)",
        "\u202f=SUM(1)",
        "\x00=SUM(1)",
        "\x1b=SUM(1)",
        "\ufeff=SUM(1)",
        "\u200b=SUM(1)",
        ' \t\n\u2003@HYPERLINK("example","text")',
        '=SUM(1),"quoted"\r\n=CMD(1)',
    ],
)
def test_formula_text_is_inert_before_csv_quoting(text: str) -> None:
    item = replace(summary(), job_title=text, company_name=text)
    _, rows = export_rows((item,))
    assert len(rows) == 2 and all(len(row) == 9 for row in rows)
    assert rows[1][2:4] == ["'" + text, "'" + text]
    assert item.job_title == item.company_name == text


@pytest.mark.parametrize(
    "text",
    [
        None,
        "",
        "Normal engineer",
        "Ordinary = text",
        "'already quoted",
        'Engineer, "platform"\r\nSecond line',
        "\u5de5\u7a0b\u5e08 \u00e9 \U0001f680",
        "  \t\n",
        "2026-01-01",
    ],
)
def test_safe_text_round_trips_without_changes(text: str | None) -> None:
    assert sanitize_csv_text(text) == (text or "")
    _, rows = export_rows(
        (replace(summary(), job_title=text or "", company_name=text),)
    )
    assert rows[1][2:4] == [text or "", text or ""]
    assert len(rows) == 2 and len(rows[1]) == 9


def test_order_is_preserved_and_complete_filter_delegated() -> None:
    repository = Mock(spec=AnalysisRepository)
    first = replace(summary(), analysis_id=uuid.UUID(int=3), job_title="First")
    second = replace(summary(), analysis_id=uuid.UUID(int=2), job_title="Second")
    repository.list_export_summaries.return_value = (first, second)
    criteria = AnalysisHistoryFilter(
        ai_enriched=False,
        min_score=0,
        has_follow_up=True,
        follow_up_from=date(2000, 2, 29),
        sort="follow_up_asc",
    )
    content = ApplicationPipelineCsvService(repository).export(criteria)
    repository.list_export_summaries.assert_called_once_with(
        history_filter=criteria, max_rows=10_000
    )
    rows = list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))
    assert [row[2] for row in rows[1:]] == ["First", "Second"]


def test_exact_row_budget_is_allowed() -> None:
    content, rows = export_rows((summary(),) * MAX_PIPELINE_CSV_ROWS)
    assert content.startswith(b"\xef\xbb\xbf")
    assert len(rows) == 10_001


def test_overflow_rejected_before_any_csv_rendering(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = Mock(spec=AnalysisRepository)
    repository.list_export_summaries.return_value = (summary(),) * 10_001
    writer = Mock(side_effect=AssertionError("Must reject before CSV rendering"))
    monkeypatch.setattr(
        "pathfinder_ai.application.analysis_pipeline_csv.csv.writer", writer
    )
    with pytest.raises(ExportLimitExceededError):
        ApplicationPipelineCsvService(repository).export(AnalysisHistoryFilter())
    writer.assert_not_called()
