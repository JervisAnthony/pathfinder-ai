"""Application note validation and service behavior."""

import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest

from pathfinder_ai.application.analysis_notes import (
    MAX_APPLICATION_NOTE_LENGTH,
    AnalysisNote,
    AnalysisNoteService,
)


class FakeNoteRepository:
    def __init__(self) -> None:
        self.known: set[uuid.UUID] = set()
        self.notes: dict[uuid.UUID, AnalysisNote] = {}
        self.writes = 0
        self.clears = 0

    def get_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        if analysis_id not in self.known:
            return None
        return self.notes.get(analysis_id, AnalysisNote(analysis_id, None, None))

    def upsert_note(self, note: AnalysisNote) -> AnalysisNote | None:
        if note.analysis_id not in self.known:
            return None
        self.writes += 1
        self.notes[note.analysis_id] = note
        return note

    def clear_note(self, analysis_id: uuid.UUID) -> AnalysisNote | None:
        if analysis_id not in self.known:
            return None
        self.clears += 1
        self.notes.pop(analysis_id, None)
        return AnalysisNote(analysis_id, None, None)


def test_note_model_preserves_plain_text_and_normalizes_utc() -> None:
    identifier = uuid.uuid4()
    assert AnalysisNote(identifier, None, None).updated_at is None
    content = "  Recruiter called\n# Follow up 🐍 <script>alert(1)</script>  "
    note = AnalysisNote(
        identifier,
        content,
        datetime(2026, 1, 1, 5, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))),
    )
    assert note.content == content
    assert note.updated_at == datetime(2026, 1, 1, tzinfo=UTC)
    assert AnalysisNote(identifier, "x" * MAX_APPLICATION_NOTE_LENGTH, note.updated_at)


@pytest.mark.parametrize("content", ["", " \n\t ", "x" * 10_001])
def test_note_rejects_invalid_content(content: str) -> None:
    with pytest.raises(ValueError):
        AnalysisNote(uuid.uuid4(), content, datetime(2026, 1, 1, tzinfo=UTC))


def test_note_rejects_inconsistent_timestamp() -> None:
    identifier = uuid.uuid4()
    with pytest.raises(ValueError, match="cannot have updated_at"):
        AnalysisNote(identifier, None, datetime(2026, 1, 1, tzinfo=UTC))
    with pytest.raises(ValueError, match="required"):
        AnalysisNote(identifier, "text", None)
    with pytest.raises(ValueError, match="timezone-aware"):
        AnalysisNote(identifier, "text", datetime(2026, 1, 1))


def test_note_service_update_idempotence_and_clear() -> None:
    repository = FakeNoteRepository()
    identifier = uuid.uuid4()
    clock_calls = 0

    def clock() -> datetime:
        nonlocal clock_calls
        clock_calls += 1
        return datetime(2026, 1, clock_calls, tzinfo=UTC)

    service = AnalysisNoteService(repository, clock=clock)
    assert service.get_note(identifier) is None
    assert service.update_note(identifier, "text") is None
    assert service.clear_note(identifier) is None
    assert clock_calls == 0
    repository.known.add(identifier)
    assert service.get_note(identifier) == AnalysisNote(identifier, None, None)
    first = service.update_note(identifier, "  first\n🐍  ")
    assert first == AnalysisNote(
        identifier, "  first\n🐍  ", datetime(2026, 1, 1, tzinfo=UTC)
    )
    assert service.update_note(identifier, "  first\n🐍  ") == first
    assert repository.writes == clock_calls == 1
    changed = service.update_note(identifier, "second")
    assert changed == AnalysisNote(
        identifier, "second", datetime(2026, 1, 2, tzinfo=UTC)
    )
    assert repository.writes == clock_calls == 2
    assert service.clear_note(identifier) == AnalysisNote(identifier, None, None)
    assert service.clear_note(identifier) == AnalysisNote(identifier, None, None)
    assert repository.clears == 2
    assert clock_calls == 2


@pytest.mark.parametrize("content", ["", "   ", "x" * 10_001])
def test_service_rejects_invalid_content_without_clock_or_write(content: str) -> None:
    repository = FakeNoteRepository()
    identifier = uuid.uuid4()
    repository.known.add(identifier)
    service = AnalysisNoteService(repository, clock=lambda: pytest.fail("clock called"))
    with pytest.raises(ValueError):
        service.update_note(identifier, content)
    assert repository.writes == 0
