"""
Application models and repository contracts for analysis history.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import StrEnum
from math import isfinite
from typing import Protocol

from pathfinder_ai.application.ai_enrichment import AIEnrichmentResult
from pathfinder_ai.application.interview_preparation import InterviewPreparation
from pathfinder_ai.application.learning_recommendations import LearningRecommendations
from pathfinder_ai.domain.candidate_profile import CandidateProfile
from pathfinder_ai.domain.explanation import MatchExplanation
from pathfinder_ai.domain.job_description import JobDescription

MAX_HISTORY_QUERY_LENGTH = 200


class ApplicationStatus(StrEnum):
    NOT_APPLIED = "not_applied"
    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


@dataclass(frozen=True, slots=True)
class AnalysisTracking:
    analysis_id: uuid.UUID
    application_status: ApplicationStatus
    updated_at: datetime | None

    def __post_init__(self) -> None:
        if self.updated_at is None:
            if self.application_status is not ApplicationStatus.NOT_APPLIED:
                raise ValueError("updated_at is required for changed status")
            return
        if self.updated_at.tzinfo is None:
            raise ValueError("updated_at must be timezone-aware")
        object.__setattr__(self, "updated_at", self.updated_at.astimezone(UTC))


@dataclass(frozen=True, slots=True)
class ApplicationStatusEvent:
    analysis_id: uuid.UUID
    previous_status: ApplicationStatus
    application_status: ApplicationStatus
    changed_at: datetime

    def __post_init__(self) -> None:
        if self.previous_status == self.application_status:
            raise ValueError("status event must represent a change")
        if self.changed_at.tzinfo is None:
            raise ValueError("changed_at must be timezone-aware")
        object.__setattr__(self, "changed_at", self.changed_at.astimezone(UTC))


@dataclass(frozen=True, slots=True)
class AnalysisHistoryFilter:
    """Optional deterministic criteria for saved-analysis history."""

    query: str | None = None
    ai_enriched: bool | None = None
    min_score: float | None = None
    max_score: float | None = None
    application_status: ApplicationStatus | None = None

    def __post_init__(self) -> None:
        normalized_query = (
            " ".join(self.query.split()) if self.query is not None else None
        )
        if not normalized_query:
            normalized_query = None
        if (
            normalized_query is not None
            and len(normalized_query) > MAX_HISTORY_QUERY_LENGTH
        ):
            raise ValueError(
                f"query must be at most {MAX_HISTORY_QUERY_LENGTH} characters"
            )
        object.__setattr__(self, "query", normalized_query)

        for field_name, value in (
            ("min_score", self.min_score),
            ("max_score", self.max_score),
        ):
            if value is not None and (not isfinite(value) or value < 0 or value > 100):
                raise ValueError(
                    f"{field_name} must be a finite value between 0 and 100"
                )

        if (
            self.min_score is not None
            and self.max_score is not None
            and self.min_score > self.max_score
        ):
            raise ValueError("min_score must be less than or equal to max_score")


@dataclass(frozen=True, slots=True)
class SavedAnalysis:
    """
    Immutable representation of a persisted analysis snapshot.
    """

    analysis_id: uuid.UUID
    created_at: datetime
    candidate_profile: CandidateProfile
    job_description: JobDescription
    match_explanation: MatchExplanation
    interview_preparation: InterviewPreparation
    ai_enrichment: AIEnrichmentResult | None = None
    learning_recommendations: LearningRecommendations | None = None

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None:
            raise ValueError("created_at must be timezone-aware")

        # Ensure UTC
        object.__setattr__(
            self,
            "created_at",
            self.created_at.astimezone(UTC),
        )


@dataclass(frozen=True, slots=True)
class SavedAnalysisSummary:
    """
    Lightweight summary model for listing analysis history.
    """

    analysis_id: uuid.UUID
    created_at: datetime
    job_title: str
    company_name: str | None
    score: float | None
    ai_enriched: bool
    application_status: ApplicationStatus = ApplicationStatus.NOT_APPLIED
    status_updated_at: datetime | None = None
    follow_up_on: date | None = None

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None:
            raise ValueError("created_at must be timezone-aware")

        # Ensure UTC
        object.__setattr__(self, "created_at", self.created_at.astimezone(UTC))
        if self.status_updated_at is not None:
            if self.status_updated_at.tzinfo is None:
                raise ValueError("status_updated_at must be timezone-aware")
            object.__setattr__(
                self, "status_updated_at", self.status_updated_at.astimezone(UTC)
            )


class AnalysisRepository(Protocol):
    """
    Provider-neutral persistence interface.
    """

    def save(self, analysis: SavedAnalysis) -> None:
        """Persist a complete analysis snapshot."""
        ...

    def get(self, analysis_id: uuid.UUID) -> SavedAnalysis | None:
        """Retrieve a complete analysis snapshot by ID."""
        ...

    def delete(self, analysis_id: uuid.UUID) -> bool:
        """Delete one analysis by ID and report whether it existed."""
        ...

    def get_tracking(self, analysis_id: uuid.UUID) -> AnalysisTracking | None:
        """Get effective tracking for an existing saved analysis."""
        ...

    def upsert_tracking(self, tracking: AnalysisTracking) -> AnalysisTracking | None:
        """Atomically store a transition and return effective persisted tracking."""
        ...

    def list_tracking_events(
        self, analysis_id: uuid.UUID, *, limit: int, offset: int
    ) -> tuple[ApplicationStatusEvent, ...] | None:
        """Return recorded transitions, or None if the analysis does not exist."""
        ...

    def list_recent(
        self,
        *,
        limit: int,
        offset: int,
        history_filter: AnalysisHistoryFilter | None = None,
    ) -> tuple[SavedAnalysisSummary, ...]:
        """List lightweight analysis summaries."""
        ...


class AnalysisHistoryService:
    """
    Application service for managing analysis history.
    """

    def __init__(
        self,
        repository: AnalysisRepository,
        id_generator: "Callable[[], uuid.UUID] | None" = None,
        clock: "Callable[[], datetime] | None" = None,
    ) -> None:
        self._repository = repository
        self._generate_id = id_generator or uuid.uuid4

        def default_clock() -> datetime:
            return datetime.now(UTC)

        self._now = clock or default_clock

    def save_analysis(
        self,
        candidate_profile: CandidateProfile,
        job_description: JobDescription,
        match_explanation: MatchExplanation,
        interview_preparation: InterviewPreparation,
        ai_enrichment: AIEnrichmentResult | None = None,
        learning_recommendations: LearningRecommendations | None = None,
    ) -> SavedAnalysis:
        """
        Create and persist a new analysis snapshot.
        """
        analysis_id = self._generate_id()
        created_at = self._now()

        analysis = SavedAnalysis(
            analysis_id=analysis_id,
            created_at=created_at,
            candidate_profile=candidate_profile,
            job_description=job_description,
            match_explanation=match_explanation,
            interview_preparation=interview_preparation,
            ai_enrichment=ai_enrichment,
            learning_recommendations=learning_recommendations,
        )
        self._repository.save(analysis)
        return analysis

    def get_analysis(self, analysis_id: uuid.UUID) -> SavedAnalysis | None:
        """
        Retrieve a specific saved analysis.
        """
        return self._repository.get(analysis_id)

    def delete_analysis(self, analysis_id: uuid.UUID) -> bool:
        """Delete a specific saved analysis without recomputing it."""
        return self._repository.delete(analysis_id)

    def get_tracking(self, analysis_id: uuid.UUID) -> AnalysisTracking | None:
        return self._repository.get_tracking(analysis_id)

    def update_application_status(
        self, analysis_id: uuid.UUID, status: ApplicationStatus
    ) -> AnalysisTracking | None:
        current = self._repository.get_tracking(analysis_id)
        if current is None or current.application_status == status:
            return current
        updated = AnalysisTracking(analysis_id, status, self._now())
        return self._repository.upsert_tracking(updated)

    def list_tracking_events(
        self, analysis_id: uuid.UUID, *, limit: int = 20, offset: int = 0
    ) -> tuple[ApplicationStatusEvent, ...] | None:
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")
        if offset < 0:
            raise ValueError("Offset must be non-negative")
        return self._repository.list_tracking_events(
            analysis_id, limit=limit, offset=offset
        )

    def list_history(
        self,
        limit: int = 20,
        offset: int = 0,
        history_filter: AnalysisHistoryFilter | None = None,
    ) -> tuple[SavedAnalysisSummary, ...]:
        """
        List lightweight history summaries with pagination.
        """
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")
        if offset < 0:
            raise ValueError("Offset must be non-negative")

        return self._repository.list_recent(
            limit=limit,
            offset=offset,
            history_filter=history_filter,
        )
