"""Tests for AnalysisHistoryService."""

import uuid
from datetime import UTC, datetime, timezone

import pytest

from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryService,
    AnalysisRepository,
    SavedAnalysis,
    SavedAnalysisSummary,
)
from pathfinder_ai.application.interview_preparation import InterviewPreparation
from pathfinder_ai.domain.candidate_profile import CandidateProfile
from pathfinder_ai.domain.explanation import (
    GapAnalysis,
    MatchExplanation,
    SkillKeywordCoverage,
)
from pathfinder_ai.domain.job_description import JobDescription
from pathfinder_ai.domain.job_title import JobTitle
from pathfinder_ai.domain.matching import MatchScore


class FakeRepository(AnalysisRepository):
    def __init__(self) -> None:
        self.saved: dict[uuid.UUID, SavedAnalysis] = {}

    def save(self, analysis: SavedAnalysis) -> None:
        self.saved[analysis.analysis_id] = analysis

    def get(self, analysis_id: uuid.UUID) -> SavedAnalysis | None:
        return self.saved.get(analysis_id)

    def list_recent(
        self, *, limit: int, offset: int
    ) -> tuple[SavedAnalysisSummary, ...]:
        items = list(self.saved.values())
        items.sort(key=lambda x: (x.created_at, x.analysis_id), reverse=True)
        summaries = [
            SavedAnalysisSummary(
                analysis_id=item.analysis_id,
                created_at=item.created_at,
                job_title=item.job_description.title.title,
                company_name=item.job_description.company_info.name
                if item.job_description.company_info
                else None,
                score=item.match_explanation.score.value or 0.0,
                ai_enriched=item.ai_enrichment is not None,
            )
            for item in items
        ]
        return tuple(summaries[offset : offset + limit])


@pytest.fixture
def fake_repo() -> FakeRepository:
    return FakeRepository()


def test_save_and_get_analysis(fake_repo: FakeRepository) -> None:
    service = AnalysisHistoryService(repository=fake_repo)

    from pathfinder_ai.domain.skill import Skill

    profile = CandidateProfile(
        skills=(Skill(name="Python"),),
        experience=(),
        education=(),
        projects=(),
        certifications=(),
        preferences=None,
    )
    job = JobDescription(
        title=JobTitle(title="Dev"),
        responsibilities=(),
        required_skills=(),
        preferred_skills=(),
        company_info=None,
        experience_requirement=None,
        education_requirement=None,
    )
    explanation = MatchExplanation(
        score=MatchScore(value=50.0),
        components=(),
        matched_skills=(),
        experience=None,
        education=None,
        gaps=GapAnalysis(
            missing_required_skills=(),
            missing_preferred_skills=(),
            experience_gap=None,
            education_gap=None,
        ),
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(), missing_keywords=(), percentage=None
        ),
    )
    prep = InterviewPreparation(
        themes=(), talking_points=(), question_categories=(), candidate_questions=()
    )

    saved = service.save_analysis(
        candidate_profile=profile,
        job_description=job,
        match_explanation=explanation,
        interview_preparation=prep,
        ai_enrichment=None,
    )

    assert saved.analysis_id is not None
    assert saved.created_at.tzinfo == UTC

    retrieved = service.get_analysis(saved.analysis_id)
    assert retrieved == saved


def test_list_history_pagination(fake_repo: FakeRepository) -> None:
    service = AnalysisHistoryService(repository=fake_repo)

    from pathfinder_ai.domain.skill import Skill

    profile = CandidateProfile(
        skills=(Skill(name="Python"),),
        experience=(),
        education=(),
        projects=(),
        certifications=(),
        preferences=None,
    )
    job = JobDescription(
        title=JobTitle(title="Dev"),
        responsibilities=(),
        required_skills=(),
        preferred_skills=(),
        company_info=None,
        experience_requirement=None,
        education_requirement=None,
    )
    explanation = MatchExplanation(
        score=MatchScore(value=50.0),
        components=(),
        matched_skills=(),
        experience=None,
        education=None,
        gaps=GapAnalysis(
            missing_required_skills=(),
            missing_preferred_skills=(),
            experience_gap=None,
            education_gap=None,
        ),
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(), missing_keywords=(), percentage=None
        ),
    )
    prep = InterviewPreparation(
        themes=(), talking_points=(), question_categories=(), candidate_questions=()
    )

    # Save 5 analyses
    for _ in range(5):
        service.save_analysis(profile, job, explanation, prep)

    assert len(service.list_history()) == 5
    assert len(service.list_history(limit=2)) == 2
    assert len(service.list_history(limit=2, offset=2)) == 2
    assert len(service.list_history(limit=2, offset=4)) == 1


def test_list_history_invalid_pagination(fake_repo: FakeRepository) -> None:
    service = AnalysisHistoryService(repository=fake_repo)
    with pytest.raises(ValueError, match="Limit must be between 1 and 100"):
        service.list_history(limit=0)

    with pytest.raises(ValueError, match="Offset must be non-negative"):
        service.list_history(offset=-1)


def test_invalid_timezone_models() -> None:
    from datetime import datetime

    from pathfinder_ai.domain.skill import Skill

    with pytest.raises(ValueError, match="created_at must be timezone-aware"):
        SavedAnalysis(
            analysis_id=uuid.uuid4(),
            created_at=datetime(2023, 1, 1),  # Naive datetime
            candidate_profile=CandidateProfile(
                skills=(Skill(name="Python"),),
                experience=(),
                education=(),
                projects=(),
                certifications=(),
                preferences=None,
            ),
            job_description=JobDescription(
                title=JobTitle(title="Dev"),
                responsibilities=(),
                required_skills=(),
                preferred_skills=(),
                company_info=None,
                experience_requirement=None,
                education_requirement=None,
            ),
            match_explanation=MatchExplanation(
                score=MatchScore(value=0),
                components=(),
                matched_skills=(),
                experience=None,
                education=None,
                gaps=GapAnalysis(
                    missing_required_skills=(),
                    missing_preferred_skills=(),
                    experience_gap=None,
                    education_gap=None,
                ),
                keyword_coverage=SkillKeywordCoverage(
                    matched_keywords=(), missing_keywords=(), percentage=None
                ),
            ),
            interview_preparation=InterviewPreparation(
                themes=(),
                talking_points=(),
                question_categories=(),
                candidate_questions=(),
            ),
        )

    with pytest.raises(ValueError, match="created_at must be timezone-aware"):
        SavedAnalysisSummary(
            analysis_id=uuid.uuid4(),
            created_at=datetime(2023, 1, 1),  # Naive datetime
            job_title="",
            company_name=None,
            score=0,
            ai_enriched=False,
        )


def test_save_with_invalid_id_generator_fallback(fake_repo: FakeRepository) -> None:
    # Pass a function that returns the uuid.UUID class to test the fallback block
    def bad_gen() -> type[uuid.UUID]:
        return uuid.UUID

    service = AnalysisHistoryService(repository=fake_repo, id_generator=bad_gen)  # type: ignore[arg-type]

    from pathfinder_ai.domain.skill import Skill

    profile = CandidateProfile(
        skills=(Skill(name="Python"),),
        experience=(),
        education=(),
        projects=(),
        certifications=(),
        preferences=None,
    )
    job = JobDescription(
        title=JobTitle(title="Dev"),
        responsibilities=(),
        required_skills=(),
        preferred_skills=(),
        company_info=None,
        experience_requirement=None,
        education_requirement=None,
    )
    explanation = MatchExplanation(
        score=MatchScore(value=50.0),
        components=(),
        matched_skills=(),
        experience=None,
        education=None,
        gaps=GapAnalysis(
            missing_required_skills=(),
            missing_preferred_skills=(),
            experience_gap=None,
            education_gap=None,
        ),
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(), missing_keywords=(), percentage=None
        ),
    )
    prep = InterviewPreparation(
        themes=(), talking_points=(), question_categories=(), candidate_questions=()
    )

    saved = service.save_analysis(profile, job, explanation, prep)
    assert isinstance(saved.analysis_id, uuid.UUID)


def test_save_with_clock_and_id_generator(fake_repo: FakeRepository) -> None:
    from typing import Any

    class FixedClock:
        @staticmethod
        def now(tz: timezone) -> datetime:
            return datetime(2023, 1, 1, tzinfo=tz)

    fixed_id = uuid.uuid4()

    def id_gen() -> uuid.UUID:
        return fixed_id

    service = AnalysisHistoryService(
        repository=fake_repo, clock=FixedClock, id_generator=id_gen  # type: ignore[arg-type]
    )

    from pathfinder_ai.domain.skill import Skill

    profile = CandidateProfile(
        skills=(Skill(name="Python"),),
        experience=(),
        education=(),
        projects=(),
        certifications=(),
        preferences=None,
    )
    job = JobDescription(
        title=JobTitle(title="Dev"),
        responsibilities=(),
        required_skills=(),
        preferred_skills=(),
        company_info=None,
        experience_requirement=None,
        education_requirement=None,
    )
    explanation = MatchExplanation(
        score=MatchScore(value=50.0),
        components=(),
        matched_skills=(),
        experience=None,
        education=None,
        gaps=GapAnalysis(
            missing_required_skills=(),
            missing_preferred_skills=(),
            experience_gap=None,
            education_gap=None,
        ),
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(), missing_keywords=(), percentage=None
        ),
    )
    prep = InterviewPreparation(
        themes=(), talking_points=(), question_categories=(), candidate_questions=()
    )

    saved = service.save_analysis(profile, job, explanation, prep)

    assert saved.analysis_id == fixed_id
    assert saved.created_at == datetime(2023, 1, 1, tzinfo=UTC)
