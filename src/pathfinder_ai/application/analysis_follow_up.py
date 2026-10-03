"""User-managed calendar follow-up dates, separate from saved snapshots."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Protocol


def validate_follow_up_date(follow_up_on: date) -> None:
    """Require a calendar date without a time of day."""
    if not isinstance(follow_up_on, date) or isinstance(follow_up_on, datetime):
        raise ValueError("follow_up_on must be a calendar date")


@dataclass(frozen=True, slots=True)
class AnalysisFollowUp:
    analysis_id: uuid.UUID
    follow_up_on: date | None
    updated_at: datetime | None

    def __post_init__(self) -> None:
        if self.follow_up_on is None:
            if self.updated_at is not None:
                raise ValueError("Empty follow-up cannot have updated_at")
            return
        validate_follow_up_date(self.follow_up_on)
        if self.updated_at is None:
            raise ValueError("updated_at is required for a follow-up date")
        if self.updated_at.utcoffset() is None:
            raise ValueError("updated_at must be timezone-aware")
        object.__setattr__(self, "updated_at", self.updated_at.astimezone(UTC))


class AnalysisFollowUpRepository(Protocol):
    def get_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        """Return effective metadata, or None when the parent is missing."""
        ...

    def upsert_follow_up(self, follow_up: AnalysisFollowUp) -> AnalysisFollowUp | None:
        """Persist a date, preserving the timestamp for an unchanged date."""
        ...

    def clear_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        """Delete metadata, or return None when the parent is missing."""
        ...


class AnalysisFollowUpService:
    def __init__(
        self,
        repository: AnalysisFollowUpRepository,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._now = clock or (lambda: datetime.now(UTC))

    def get_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        return self._repository.get_follow_up(analysis_id)

    def update_follow_up(
        self, analysis_id: uuid.UUID, follow_up_on: date
    ) -> AnalysisFollowUp | None:
        validate_follow_up_date(follow_up_on)
        current = self._repository.get_follow_up(analysis_id)
        if current is None or current.follow_up_on == follow_up_on:
            return current
        return self._repository.upsert_follow_up(
            AnalysisFollowUp(analysis_id, follow_up_on, self._now())
        )

    def clear_follow_up(self, analysis_id: uuid.UUID) -> AnalysisFollowUp | None:
        return self._repository.clear_follow_up(analysis_id)
