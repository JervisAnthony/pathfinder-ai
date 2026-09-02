"""
Application models and repository contracts for analysis history.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from pathfinder_ai.application.ai_enrichment import AIEnrichmentResult
from pathfinder_ai.application.interview_preparation import InterviewPreparation
from pathfinder_ai.application.learning_recommendations import LearningRecommendations
from pathfinder_ai.domain.candidate_profile import CandidateProfile
from pathfinder_ai.domain.explanation import MatchExplanation
from pathfinder_ai.domain.job_description import JobDescription


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

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None:
            raise ValueError("created_at must be timezone-aware")

        # Ensure UTC
        object.__setattr__(self, "created_at", self.created_at.astimezone(UTC))


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

    def list_recent(
        self, *, limit: int, offset: int
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

    def list_history(
        self, limit: int = 20, offset: int = 0
    ) -> tuple[SavedAnalysisSummary, ...]:
        """
        List lightweight history summaries with pagination.
        """
        if limit < 1 or limit > 100:
            raise ValueError("Limit must be between 1 and 100")
        if offset < 0:
            raise ValueError("Offset must be non-negative")

        return self._repository.list_recent(limit=limit, offset=offset)
