"""Descriptive comparison of stored snapshots, without recomputation or IO."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from pathfinder_ai.application.analysis_history import SavedAnalysis
from pathfinder_ai.domain.education import EducationLevel
from pathfinder_ai.domain.explanation import ScoreComponentKind
from pathfinder_ai.domain.skill import Skill


@dataclass(frozen=True, slots=True)
class SavedAnalysisComparisonSide:
    analysis_id: UUID
    created_at: datetime
    job_title: str
    company_name: str | None
    score: float | None
    keyword_coverage_percentage: float | None
    ai_enriched: bool


@dataclass(frozen=True, slots=True)
class ScoreComponentComparison:
    kind: ScoreComponentKind
    left_earned_points: float | None
    left_possible_points: float | None
    right_earned_points: float | None
    right_possible_points: float | None
    earned_points_delta: float | None


@dataclass(frozen=True, slots=True)
class SkillSetComparison:
    in_both: tuple[str, ...]
    left_only: tuple[str, ...]
    right_only: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ExperienceGapSnapshot:
    required_months: int
    known_candidate_months: int
    missing_months: int


@dataclass(frozen=True, slots=True)
class EducationGapSnapshot:
    level: EducationLevel | None
    field_of_study: str | None
    description: str | None


@dataclass(frozen=True, slots=True)
class ExperienceGapComparison:
    left: ExperienceGapSnapshot | None
    right: ExperienceGapSnapshot | None


@dataclass(frozen=True, slots=True)
class EducationGapComparison:
    left: EducationGapSnapshot | None
    right: EducationGapSnapshot | None


@dataclass(frozen=True, slots=True)
class SavedAnalysisComparison:
    left: SavedAnalysisComparisonSide
    right: SavedAnalysisComparisonSide
    score_delta: float | None
    keyword_coverage_delta: float | None
    score_components: tuple[ScoreComponentComparison, ...]
    matched_skills: SkillSetComparison
    missing_required_skills: SkillSetComparison
    missing_preferred_skills: SkillSetComparison
    experience_gaps: ExperienceGapComparison
    education_gaps: EducationGapComparison


def _delta(left: float | None, right: float | None) -> float | None:
    return None if left is None or right is None else right - left


def _side(analysis: SavedAnalysis) -> SavedAnalysisComparisonSide:
    job = analysis.job_description
    return SavedAnalysisComparisonSide(
        analysis.analysis_id,
        analysis.created_at,
        job.title.title,
        job.company_info.name if job.company_info is not None else None,
        analysis.match_explanation.score.value,
        analysis.match_explanation.keyword_coverage.percentage,
        analysis.ai_enrichment is not None,
    )


def _skills(left: Iterable[Skill], right: Iterable[Skill]) -> SkillSetComparison:
    left_skills = tuple(dict.fromkeys(left))
    right_skills = tuple(dict.fromkeys(right))
    left_set, right_set = set(left_skills), set(right_skills)
    return SkillSetComparison(
        tuple(skill.name for skill in left_skills if skill in right_set),
        tuple(skill.name for skill in left_skills if skill not in right_set),
        tuple(skill.name for skill in right_skills if skill not in left_set),
    )


def _experience(analysis: SavedAnalysis) -> ExperienceGapSnapshot | None:
    gap = analysis.match_explanation.gaps.experience_gap
    return (
        ExperienceGapSnapshot(
            gap.required_months, gap.known_candidate_months, gap.missing_months
        )
        if gap is not None
        else None
    )


def _education(analysis: SavedAnalysis) -> EducationGapSnapshot | None:
    gap = analysis.match_explanation.gaps.education_gap
    return (
        EducationGapSnapshot(gap.level, gap.field_of_study, gap.description)
        if gap is not None
        else None
    )


def compare_saved_analyses(
    left: SavedAnalysis, right: SavedAnalysis
) -> SavedAnalysisComparison:
    """Read stored outputs only; deltas mean right minus left, without judgment."""
    left_side, right_side = _side(left), _side(right)
    left_match, right_match = left.match_explanation, right.match_explanation
    left_components = {component.kind: component for component in left_match.components}
    right_components = {
        component.kind: component for component in right_match.components
    }
    components = []
    for kind in ScoreComponentKind:
        left_component, right_component = (
            left_components.get(kind),
            right_components.get(kind),
        )
        if left_component is None and right_component is None:
            continue
        left_earned = left_component.earned_points if left_component else None
        right_earned = right_component.earned_points if right_component else None
        components.append(
            ScoreComponentComparison(
                kind,
                left_earned,
                left_component.possible_points if left_component else None,
                right_earned,
                right_component.possible_points if right_component else None,
                _delta(left_earned, right_earned),
            )
        )
    return SavedAnalysisComparison(
        left_side,
        right_side,
        _delta(left_side.score, right_side.score),
        _delta(
            left_side.keyword_coverage_percentage,
            right_side.keyword_coverage_percentage,
        ),
        tuple(components),
        _skills(
            (evidence.skill for evidence in left_match.matched_skills),
            (evidence.skill for evidence in right_match.matched_skills),
        ),
        _skills(
            left_match.gaps.missing_required_skills,
            right_match.gaps.missing_required_skills,
        ),
        _skills(
            left_match.gaps.missing_preferred_skills,
            right_match.gaps.missing_preferred_skills,
        ),
        ExperienceGapComparison(_experience(left), _experience(right)),
        EducationGapComparison(_education(left), _education(right)),
    )
