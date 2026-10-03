"""Calendar follow-up validation and service behavior."""

import uuid
from dataclasses import FrozenInstanceError
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from pathfinder_ai.application.analysis_follow_up import (
    AnalysisFollowUp,
    AnalysisFollowUpService,
)


class FakeFollowUpRepository:
    def __init__(self) -> None:
        self.known: set[uuid.UUID] = set()
        self.follow_ups: dict[uuid.UUID, AnalysisFollowUp] = {}
        self.writes = 0

    def get_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        if analysis_id not in self.known:
            return None
        return self.follow_ups.get(
            analysis_id, AnalysisFollowUp(analysis_id, None, None)
        )

    def upsert_follow_up(self, follow_up: AnalysisFollowUp) -> AnalysisFollowUp:
        self.writes += 1
        self.follow_ups[follow_up.analysis_id] = follow_up
        return follow_up

    def clear_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        if analysis_id not in self.known:
            return None
        self.follow_ups.pop(analysis_id, None)
        return AnalysisFollowUp(analysis_id, None, None)


@pytest.mark.parametrize("scheduled", [date(2000, 1, 1), date(2099, 12, 31)])
def test_model_accepts_past_and_future_calendar_dates(scheduled: date) -> None:
    identifier = uuid.uuid4()
    assert AnalysisFollowUp(identifier, None, None).follow_up_on is None
    follow_up = AnalysisFollowUp(
        identifier,
        scheduled,
        datetime(2026, 1, 1, 5, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))),
    )
    assert follow_up.follow_up_on == scheduled
    assert follow_up.updated_at == datetime(2026, 1, 1, tzinfo=UTC)
    assert follow_up.updated_at.tzinfo is UTC
    with pytest.raises(FrozenInstanceError):
        follow_up.follow_up_on = None


def test_model_rejects_inconsistent_or_naive_timestamp() -> None:
    identifier = uuid.uuid4()
    with pytest.raises(ValueError, match="cannot have updated_at"):
        AnalysisFollowUp(identifier, None, datetime(2026, 1, 1, tzinfo=UTC))
    with pytest.raises(ValueError, match="required"):
        AnalysisFollowUp(identifier, date(2026, 1, 1), None)
    with pytest.raises(ValueError, match="timezone-aware"):
        AnalysisFollowUp(identifier, date(2026, 1, 1), datetime(2026, 1, 1))
    with pytest.raises(ValueError, match="calendar date"):
        AnalysisFollowUp(identifier, datetime(2026, 1, 1), None)


def test_service_lifecycle_only_reads_clock_for_changed_dates() -> None:
    # This narrow fake has no analysis, matching, AI, tracking, or note operations.
    repository = FakeFollowUpRepository()
    identifier = uuid.uuid4()
    calls = 0

    def clock() -> datetime:
        nonlocal calls
        calls += 1
        return datetime(2026, 1, calls, tzinfo=UTC)

    service = AnalysisFollowUpService(repository, clock)
    assert service.get_follow_up(identifier) is None
    assert service.update_follow_up(identifier, date(2026, 10, 12)) is None
    assert service.clear_follow_up(identifier) is None
    assert calls == 0
    repository.known.add(identifier)
    empty = AnalysisFollowUp(identifier, None, None)
    assert service.get_follow_up(identifier) == empty
    first = service.update_follow_up(identifier, date(2026, 10, 12))
    assert first == AnalysisFollowUp(
        identifier, date(2026, 10, 12), datetime(2026, 1, 1, tzinfo=UTC)
    )
    assert service.update_follow_up(identifier, date(2026, 10, 12)) == first
    assert repository.writes == calls == 1
    changed = service.update_follow_up(identifier, date(2000, 1, 1))
    assert changed == AnalysisFollowUp(
        identifier, date(2000, 1, 1), datetime(2026, 1, 2, tzinfo=UTC)
    )
    assert repository.writes == calls == 2
    assert service.clear_follow_up(identifier) == empty
    assert service.clear_follow_up(identifier) == empty
    assert calls == 2


def test_service_default_clock_and_invalid_date() -> None:
    repository = FakeFollowUpRepository()
    identifier = uuid.uuid4()
    repository.known.add(identifier)
    service = AnalysisFollowUpService(repository)
    result = service.update_follow_up(identifier, date(2000, 1, 1))
    assert result is not None and result.updated_at is not None
    assert result.updated_at.tzinfo is UTC
    with pytest.raises(ValueError, match="calendar date"):
        service.update_follow_up(identifier, datetime(2026, 1, 1))
    assert repository.writes == 1
