"""Tests for AnalysisHistoryService."""

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta, timezone

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
from pathfinder_ai.domain.skill import Skill


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
                score=item.match_explanation.score.value,
                ai_enriched=item.ai_enrichment is not None,
            )
            for item in items
        ]
        return tuple(summaries[offset : offset + limit])


@pytest.fixture
def fake_repo() -> FakeRepository:
    return FakeRepository()


def _minimal_analysis_parts() -> tuple[
    CandidateProfile, JobDescription, MatchExplanation, InterviewPreparation
]:
    profile = CandidateProfile(skills=(Skill(name="Python"),))
    job = JobDescription(title=JobTitle(title="Dev"))
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
    preparation = InterviewPreparation(
        themes=(), talking_points=(), question_categories=(), candidate_questions=()
    )
    return profile, job, explanation, preparation


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


def test_fake_repository_preserves_none_and_zero_scores(
    fake_repo: FakeRepository,
) -> None:
    profile, job, explanation, preparation = _minimal_analysis_parts()
    service = AnalysisHistoryService(repository=fake_repo)
    none_saved = service.save_analysis(
        profile,
        job,
        replace(explanation, score=MatchScore(value=None)),
        preparation,
    )
    zero_saved = service.save_analysis(
        profile,
        job,
        replace(explanation, score=MatchScore(value=0.0)),
        preparation,
    )

    summaries = {item.analysis_id: item for item in service.list_history()}

    assert summaries[none_saved.analysis_id].score is None
    assert summaries[zero_saved.analysis_id].score == 0.0


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

    source_time = datetime(2023, 1, 1, 3, tzinfo=timezone(timedelta(hours=3)))
    summary = SavedAnalysisSummary(
        analysis_id=uuid.uuid4(),
        created_at=source_time,
        job_title="Developer",
        company_name=None,
        score=None,
        ai_enriched=False,
    )
    assert summary.created_at == datetime(2023, 1, 1, tzinfo=UTC)
    assert summary.created_at.timestamp() == source_time.timestamp()


def test_save_with_clock_and_id_generator(fake_repo: FakeRepository) -> None:
    source_time = datetime(
        2023, 1, 1, 5, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))
    )

    def fixed_clock() -> datetime:
        return source_time

    fixed_id = uuid.uuid4()

    def id_gen() -> uuid.UUID:
        return fixed_id

    service = AnalysisHistoryService(
        repository=fake_repo,
        clock=fixed_clock,
        id_generator=id_gen,
    )

    profile, job, explanation, preparation = _minimal_analysis_parts()

    saved = service.save_analysis(profile, job, explanation, preparation)

    assert saved.analysis_id == fixed_id
    assert saved.created_at == datetime(2023, 1, 1, tzinfo=UTC)
    assert saved.created_at.tzinfo is UTC
    assert saved.created_at.timestamp() == source_time.timestamp()


def test_service_rejects_naive_clock(fake_repo: FakeRepository) -> None:
    service = AnalysisHistoryService(
        repository=fake_repo,
        clock=lambda: datetime(2023, 1, 1),
    )
    profile, job, explanation, preparation = _minimal_analysis_parts()

    with pytest.raises(ValueError, match="created_at must be timezone-aware"):
        service.save_analysis(profile, job, explanation, preparation)

    assert fake_repo.saved == {}
