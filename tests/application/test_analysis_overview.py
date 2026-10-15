"""Immutable pipeline contracts and persistence-only service delegation."""

import uuid
from dataclasses import FrozenInstanceError
from datetime import date
from unittest.mock import Mock

import pytest

from pathfinder_ai.application.analysis_history import (
    AnalysisRepository,
    ApplicationStatus,
)
from pathfinder_ai.application.analysis_overview import (
    ApplicationPipelineOverview,
    ApplicationPipelineOverviewService,
    ApplicationStatusCount,
    PipelineFollowUpItem,
)


def test_overview_delegates_and_preserves_typed_immutable_models() -> None:
    statuses = tuple(ApplicationStatusCount(status, 0) for status in ApplicationStatus)
    item = PipelineFollowUpItem(
        uuid.UUID(int=1),
        "Fictional engineer",
        None,
        ApplicationStatus.ACCEPTED,
        date(2000, 2, 29),
    )
    overview = ApplicationPipelineOverview(1, statuses, 1, 0, (item,))
    repository = Mock(spec=AnalysisRepository)
    repository.get_pipeline_overview.return_value = overview
    assert ApplicationPipelineOverviewService(repository).get_overview() is overview
    repository.get_pipeline_overview.assert_called_once_with()
    assert repository.mock_calls == [(("get_pipeline_overview"), (), {})]
    assert [entry.status for entry in statuses] == list(ApplicationStatus)
    assert len(statuses) == 7
    assert all(entry.count == 0 for entry in statuses)
    assert isinstance(item.follow_up_on, date)
    for value, field in (
        (overview, "total_analyses"),
        (item, "job_title"),
        (statuses[0], "count"),
    ):
        with pytest.raises(FrozenInstanceError):
            setattr(value, field, 99)
