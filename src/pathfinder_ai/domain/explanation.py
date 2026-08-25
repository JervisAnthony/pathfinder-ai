"""
Match Explanation Domain Models.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from .candidate_profile import EducationRecord
from .job_description import EducationRequirement
from .skill import Skill

if TYPE_CHECKING:
    from .matching import MatchScore


class ScoreComponentKind(StrEnum):
    REQUIRED_SKILLS = "required_skills"
    PREFERRED_SKILLS = "preferred_skills"
    EXPERIENCE = "experience"
    EDUCATION = "education"


@dataclass(frozen=True, slots=True)
class ScoreComponent:
    kind: ScoreComponentKind
    earned_points: float
    possible_points: float

    def __post_init__(self) -> None:
        if self.possible_points <= 0:
            raise ValueError("possible_points must be > 0.")
        if self.earned_points < 0:
            raise ValueError("earned_points cannot be negative.")
        if self.earned_points > self.possible_points:
            raise ValueError("earned_points cannot exceed possible_points.")


class EvidenceSourceKind(StrEnum):
    PROFILE = "profile"
    WORK_EXPERIENCE = "work_experience"
    PROJECT = "project"


@dataclass(frozen=True, slots=True)
class EvidenceSource:
    kind: EvidenceSourceKind
    label: str | None


@dataclass(frozen=True, slots=True)
class MatchedSkillEvidence:
    skill: Skill
    is_required: bool
    evidence_sources: tuple[EvidenceSource, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "evidence_sources", tuple(self.evidence_sources))


@dataclass(frozen=True, slots=True)
class ExperienceEvidence:
    required_months: int
    known_candidate_months: int
    earned_points: float
    possible_points: float


@dataclass(frozen=True, slots=True)
class ExperienceGap:
    required_months: int
    known_candidate_months: int
    missing_months: int

    def __post_init__(self) -> None:
        expected_missing = self.required_months - self.known_candidate_months
        if self.missing_months != expected_missing:
            raise ValueError("missing_months must equal required - known.")
        if self.missing_months <= 0:
            raise ValueError("missing_months must be > 0 for a gap.")


@dataclass(frozen=True, slots=True)
class EducationEvidence:
    requirement: EducationRequirement
    matched_record: EducationRecord | None
    satisfied: bool

    def __post_init__(self) -> None:
        if self.satisfied is True and self.matched_record is None:
            raise ValueError("satisfied cannot be True if matched_record is None.")
        if self.satisfied is False and self.matched_record is not None:
            raise ValueError("satisfied cannot be False if matched_record is not None.")


@dataclass(frozen=True, slots=True)
class GapAnalysis:
    missing_required_skills: tuple[Skill, ...]
    missing_preferred_skills: tuple[Skill, ...]
    experience_gap: ExperienceGap | None
    education_gap: EducationRequirement | None

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "missing_required_skills", tuple(self.missing_required_skills)
        )
        object.__setattr__(
            self, "missing_preferred_skills", tuple(self.missing_preferred_skills)
        )


@dataclass(frozen=True, slots=True)
class SkillKeywordCoverage:
    matched_keywords: tuple[Skill, ...]
    missing_keywords: tuple[Skill, ...]
    percentage: float | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "matched_keywords", tuple(self.matched_keywords))
        object.__setattr__(self, "missing_keywords", tuple(self.missing_keywords))

        total_keywords = len(self.matched_keywords) + len(self.missing_keywords)

        if total_keywords == 0:
            if self.percentage is not None:
                raise ValueError("percentage must be None when there are no keywords.")
        else:
            if self.percentage is None:
                raise ValueError("percentage cannot be None when keywords are present.")

            if self.percentage < 0.0 or self.percentage > 100.0:
                raise ValueError("percentage must be between 0.0 and 100.0.")

            expected = round((len(self.matched_keywords) / total_keywords) * 100, 2)
            if self.percentage != expected:
                raise ValueError(
                    f"percentage {self.percentage} does not match expected {expected}."
                )


@dataclass(frozen=True, slots=True)
class MatchExplanation:
    score: "MatchScore"
    components: tuple[ScoreComponent, ...]
    matched_skills: tuple[MatchedSkillEvidence, ...]
    experience: ExperienceEvidence | None
    education: EducationEvidence | None
    gaps: GapAnalysis
    keyword_coverage: SkillKeywordCoverage

    def __post_init__(self) -> None:
        object.__setattr__(self, "components", tuple(self.components))
        object.__setattr__(self, "matched_skills", tuple(self.matched_skills))
