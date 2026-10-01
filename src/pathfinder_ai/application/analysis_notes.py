"""Mutable, user-authored application notes for saved analyses."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

MAX_APPLICATION_NOTE_LENGTH = 10_000


def validate_note_content(content: str) -> None:
    """Validate without rewriting the user's plain text."""
    if not content.strip():
        raise ValueError("Application note must contain text")
    if len(content) > MAX_APPLICATION_NOTE_LENGTH:
        raise ValueError(
            f"Application note must be at most {MAX_APPLICATION_NOTE_LENGTH} characters"
        )


@dataclass(frozen=True, slots=True)
class AnalysisNote:
    analysis_id: uuid.UUID
    content: str | None
    updated_at: datetime | None

    def __post_init__(self) -> None:
        if self.content is None:
            if self.updated_at is not None:
                raise ValueError("Empty application note cannot have updated_at")
            return
        validate_note_content(self.content)
        if self.updated_at is None:
            raise ValueError("updated_at is required for an application note")
        if self.updated_at.tzinfo is None:
            raise ValueError("updated_at must be timezone-aware")
        object.__setattr__(self, "updated_at", self.updated_at.astimezone(UTC))


class AnalysisNoteRepository(Protocol):
    def get_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        """Return the effective note, or None if the analysis does not exist."""
        ...

    def upsert_note(self, note: AnalysisNote) -> AnalysisNote | None:
        """Persist changed content and return the effective note."""
        ...

    def clear_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        """Clear a note, or return None if the analysis does not exist."""
        ...


class AnalysisNoteService:
    def __init__(
        self,
        repository: AnalysisNoteRepository,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._now = clock or (lambda: datetime.now(UTC))

    def get_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        return self._repository.get_note(analysis_id)

    def update_note(self, analysis_id: uuid.UUID, content: str) -> AnalysisNote | None:
        validate_note_content(content)
        current = self._repository.get_note(analysis_id)
        if current is None or current.content == content:
            return current
        return self._repository.upsert_note(
            AnalysisNote(analysis_id, content, self._now())
        )

    def clear_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        return self._repository.clear_note(analysis_id)
