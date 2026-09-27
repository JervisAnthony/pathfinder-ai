"""Stored comparison semantics, ordering, immutability and isolation."""

import uuid
from dataclasses import FrozenInstanceError, replace
from datetime import UTC, datetime

import pytest

from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentResult,
    AIEnrichmentService,
)
from pathfinder_ai.application.analysis_comparison import compare_saved_analyses
from pathfinder_ai.application.analysis_history import SavedAnalysis
from pathfinder_ai.application.interview_preparation import (
    DeterministicInterviewPreparer,
    InterviewPreparation,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
)
from pathfinder_ai.domain.candidate_profile import CandidateProfile
from pathfinder_ai.domain.education import EducationLevel
from pathfinder_ai.domain.explanation import (
    ExperienceGap,
    GapAnalysis,
    MatchedSkillEvidence,
    MatchExplanation,
    ScoreComponent,
    ScoreComponentKind,
    SkillKeywordCoverage,
)
from pathfinder_ai.domain.job_description import (
    CompanyInfo,
    EducationRequirement,
    JobDescription,
)
from pathfinder_ai.domain.job_title import JobTitle
from pathfinder_ai.domain.matching import DeterministicMatcher, MatchScore
from pathfinder_ai.domain.skill import Skill


@pytest.fixture
def comparison_snapshot() -> SavedAnalysis:
    return SavedAnalysis(
        uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        datetime(2026, 9, 27, tzinfo=UTC),
        CandidateProfile(skills=(Skill("Python"),)),
        JobDescription(
            JobTitle("Senior AI Engineer"), company_info=CompanyInfo("Acme Labs")
        ),
        MatchExplanation(
            MatchScore(82),
            (ScoreComponent(ScoreComponentKind.REQUIRED_SKILLS, 50, 60),),
            tuple(
                MatchedSkillEvidence(Skill(name), True)
                for name in ("Python", "FastAPI", "Azure")
            ),
            None,
            None,
            GapAnalysis(
                (Skill("Kubernetes"),),
                (Skill("Docker"),),
                ExperienceGap(36, 24, 12),
                EducationRequirement(
                    EducationLevel.MASTER, "Computing", "Stored degree"
                ),
            ),
            SkillKeywordCoverage((Skill("Python"),), (Skill("SQL"),), 50),
        ),
        InterviewPreparation((), (), (), ()),
    )


def test_descriptive_sets_metadata_and_independent_gaps(
    comparison_snapshot: SavedAnalysis,
) -> None:
    left = comparison_snapshot
    right = replace(
        left,
        analysis_id=uuid.uuid4(),
        job_description=replace(
            left.job_description,
            title=JobTitle("Machine Learning Engineer"),
            company_info=CompanyInfo("Northwind"),
        ),
        ai_enrichment=AIEnrichmentResult(provider_name="fake", content="PRIVATE AI"),
        match_explanation=replace(
            left.match_explanation,
            score=MatchScore(74),
            matched_skills=tuple(
                MatchedSkillEvidence(Skill(name), True) for name in ("python", "docker")
            ),
            gaps=GapAnalysis((Skill("MLflow"),), (Skill("Azure"),), None, None),
            keyword_coverage=SkillKeywordCoverage(
                (Skill("python"), Skill("docker")), (), 100
            ),
        ),
    )
    result = compare_saved_analyses(left, right)
    assert result.score_delta == -8
    assert result.keyword_coverage_delta == 50
    assert result.left.job_title == "Senior AI Engineer"
    assert result.right.company_name == "Northwind"
    assert result.left.analysis_id == left.analysis_id
    assert result.left.created_at == left.created_at
    assert not result.left.ai_enriched and result.right.ai_enriched
    assert result.matched_skills.in_both == ("python",)
    assert result.matched_skills.left_only == ("fastapi", "azure")
    assert result.matched_skills.right_only == ("docker",)
    assert result.missing_required_skills.left_only == ("kubernetes",)
    assert result.missing_required_skills.right_only == ("mlflow",)
    assert result.missing_preferred_skills.left_only == ("docker",)
    assert result.missing_preferred_skills.right_only == ("azure",)
    assert result.experience_gaps.left.missing_months == 12
    assert result.experience_gaps.right is None
    assert result.education_gaps.left.description == "Stored degree"
    assert result.education_gaps.right is None
    reversed_result = compare_saved_analyses(right, left)
    assert reversed_result.experience_gaps.left is None
    assert reversed_result.education_gaps.right.level == EducationLevel.MASTER
    assert "PRIVATE AI" not in repr(result)
    assert "candidate_profile" not in repr(result)


@pytest.mark.parametrize(
    "left_score,right_score,expected",
    [(82, 74, -8), (0, 0, 0), (None, 74, None), (82, None, None), (None, None, None)],
)
def test_scores_do_not_invent_zero(
    comparison_snapshot: SavedAnalysis,
    left_score: float | None,
    right_score: float | None,
    expected: float | None,
) -> None:
    left = replace(
        comparison_snapshot,
        match_explanation=replace(
            comparison_snapshot.match_explanation, score=MatchScore(left_score)
        ),
    )
    right = replace(
        comparison_snapshot,
        match_explanation=replace(
            comparison_snapshot.match_explanation, score=MatchScore(right_score)
        ),
    )
    assert compare_saved_analyses(left, right).score_delta == expected


@pytest.mark.parametrize("empty_side", ["left", "right", "both"])
def test_absent_keyword_company_and_components(
    comparison_snapshot: SavedAnalysis, empty_side: str
) -> None:
    empty = replace(
        comparison_snapshot,
        job_description=replace(comparison_snapshot.job_description, company_info=None),
        match_explanation=replace(
            comparison_snapshot.match_explanation,
            components=(),
            keyword_coverage=SkillKeywordCoverage((), (), None),
        ),
    )
    result = compare_saved_analyses(
        empty if empty_side != "right" else comparison_snapshot,
        empty if empty_side != "left" else comparison_snapshot,
    )
    assert result.keyword_coverage_delta is None
    if empty_side == "both":
        assert result.score_components == ()
    else:
        component = result.score_components[0]
        assert component.earned_points_delta is None
        assert (
            component.left_earned_points
            if empty_side == "left"
            else component.right_earned_points
        ) is None
        assert (
            component.left_possible_points
            if empty_side == "left"
            else component.right_possible_points
        ) is None
    assert (result.left if empty_side != "right" else result.right).company_name is None


def test_components_use_enum_order_and_stored_values(
    comparison_snapshot: SavedAnalysis,
) -> None:
    left = replace(
        comparison_snapshot,
        match_explanation=replace(
            comparison_snapshot.match_explanation,
            components=(
                ScoreComponent(ScoreComponentKind.EDUCATION, 2, 5),
                ScoreComponent(ScoreComponentKind.REQUIRED_SKILLS, 50, 60),
            ),
        ),
    )
    right = replace(
        comparison_snapshot,
        match_explanation=replace(
            comparison_snapshot.match_explanation,
            components=(
                ScoreComponent(ScoreComponentKind.EXPERIENCE, 10, 20),
                ScoreComponent(ScoreComponentKind.REQUIRED_SKILLS, 40, 55),
            ),
        ),
    )
    components = compare_saved_analyses(left, right).score_components
    assert [component.kind for component in components] == [
        ScoreComponentKind.REQUIRED_SKILLS,
        ScoreComponentKind.EXPERIENCE,
        ScoreComponentKind.EDUCATION,
    ]
    assert components[0].earned_points_delta == -10
    assert components[0].left_possible_points == 60
    assert components[0].right_possible_points == 55
    assert components[1].left_earned_points is None
    assert components[2].right_earned_points is None


def test_exact_normalized_identity_deduplication_and_order(
    comparison_snapshot: SavedAnalysis,
) -> None:
    left_names = ("  PYTHON ", "Azure", "python", "Machine   Learning", "ML", "Café")
    right_names = ("café", "machine learning", "Python", "TensorFlow", "tensorflow")

    def snapshot(names: tuple[str, ...]) -> SavedAnalysis:
        skills = tuple(Skill(name) for name in names)
        return replace(
            comparison_snapshot,
            match_explanation=replace(
                comparison_snapshot.match_explanation,
                matched_skills=tuple(
                    MatchedSkillEvidence(skill, True) for skill in skills
                ),
                gaps=GapAnalysis(skills, skills, None, None),
            ),
        )

    result = compare_saved_analyses(snapshot(left_names), snapshot(right_names))
    for skills in (
        result.matched_skills,
        result.missing_required_skills,
        result.missing_preferred_skills,
    ):
        assert skills.in_both == ("python", "machine learning", "café")
        assert skills.left_only == ("azure", "ml")
        assert skills.right_only == ("tensorflow",)


def test_same_snapshot_is_stable_immutable_and_never_recomputes(
    comparison_snapshot: SavedAnalysis, monkeypatch: pytest.MonkeyPatch
) -> None:
    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Comparison must read stored results only")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden)
    monkeypatch.setattr(DeterministicInterviewPreparer, "prepare", forbidden)
    monkeypatch.setattr(DeterministicLearningRecommender, "recommend", forbidden)
    monkeypatch.setattr(AIEnrichmentService, "enrich", forbidden)
    before = repr(comparison_snapshot)
    result = compare_saved_analyses(comparison_snapshot, comparison_snapshot)
    assert result == compare_saved_analyses(comparison_snapshot, comparison_snapshot)
    assert result.score_delta == result.keyword_coverage_delta == 0
    assert result.score_components[0].earned_points_delta == 0
    for skills in (
        result.matched_skills,
        result.missing_required_skills,
        result.missing_preferred_skills,
    ):
        assert skills.in_both
        assert skills.left_only == skills.right_only == ()
    assert repr(comparison_snapshot) == before
    with pytest.raises(FrozenInstanceError):
        result.score_delta = 123
