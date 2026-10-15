"""Read-only application pipeline summaries of persisted analysis metadata."""

import uuid
from dataclasses import dataclass
from datetime import date

from pathfinder_ai.application.analysis_history import (
    AnalysisRepository,
    ApplicationStatus,
)


@dataclass(frozen=True, slots=True)
class ApplicationStatusCount:
    status: ApplicationStatus
    count: int


@dataclass(frozen=True, slots=True)
class PipelineFollowUpItem:
    analysis_id: uuid.UUID
    job_title: str
    company_name: str | None
    application_status: ApplicationStatus
    follow_up_on: date


@dataclass(frozen=True, slots=True)
class ApplicationPipelineOverview:
    total_analyses: int
    status_counts: tuple[ApplicationStatusCount, ...]
    scheduled_follow_up_count: int
    unscheduled_follow_up_count: int
    earliest_follow_ups: tuple[PipelineFollowUpItem, ...]


class ApplicationPipelineOverviewService:
    def __init__(self, repository: AnalysisRepository) -> None:
        self._repository = repository

    def get_overview(self) -> ApplicationPipelineOverview:
        """Retrieve the complete collection overview without decoding snapshots."""
        return self._repository.get_pipeline_overview()
