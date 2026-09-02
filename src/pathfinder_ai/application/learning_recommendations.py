"""Deterministic learning recommendations derived from match gaps."""

from dataclasses import dataclass
from enum import StrEnum

from pathfinder_ai.domain import (
    CandidateProfile,
    JobDescription,
    MatchExplanation,
    Skill,
)


def _normalize_required_text(value: str, field_name: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError(f"{field_name} cannot be blank.")
    return normalized


def _normalize_optional_text(value: str | None, field_name: str) -> str | None:
    if value is None:
        return None
    return _normalize_required_text(value, field_name)


class LearningRecommendationKind(StrEnum):
    """The deterministic gap category behind a recommendation."""

    REQUIRED_SKILL = "required_skill"
    PREFERRED_SKILL = "preferred_skill"
    EXPERIENCE = "experience"
    EDUCATION = "education"


class LearningRecommendationPriority(StrEnum):
    """Priority derived from whether a gap is required or preferred."""

    HIGH = "high"
    MEDIUM = "medium"


@dataclass(frozen=True, slots=True)
class LearningRecommendation:
    """One explainable action grounded in a deterministic match gap."""

    kind: LearningRecommendationKind
    priority: LearningRecommendationPriority
    topic: str
    title: str
    rationale: str
    suggested_course_topic: str | None

    def __post_init__(self) -> None:
        object.__setattr__(self, "topic", _normalize_required_text(self.topic, "topic"))
        object.__setattr__(self, "title", _normalize_required_text(self.title, "title"))
        object.__setattr__(
            self,
            "rationale",
            _normalize_required_text(self.rationale, "rationale"),
        )
        object.__setattr__(
            self,
            "suggested_course_topic",
            _normalize_optional_text(
                self.suggested_course_topic, "suggested_course_topic"
            ),
        )


@dataclass(frozen=True, slots=True)
class LearningRecommendations:
    """Immutable ordered recommendation result."""

    items: tuple[LearningRecommendation, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "items", tuple(self.items))


class DeterministicLearningRecommender:
    """Turn an existing deterministic gap analysis into learning guidance."""

    def recommend(
        self,
        candidate_profile: CandidateProfile,
        job_description: JobDescription,
        match_explanation: MatchExplanation,
    ) -> LearningRecommendations:
        """Return stable recommendations without recomputing the match analysis."""
        del candidate_profile, job_description
        gaps = match_explanation.gaps
        items: list[LearningRecommendation] = []
        required_skills: set[Skill] = set()

        for skill in gaps.missing_required_skills:
            if skill in required_skills:
                continue
            required_skills.add(skill)
            items.append(self._skill_recommendation(skill, required=True))

        if gaps.experience_gap is not None:
            gap = gaps.experience_gap
            items.append(
                LearningRecommendation(
                    kind=LearningRecommendationKind.EXPERIENCE,
                    priority=LearningRecommendationPriority.HIGH,
                    topic="Role-relevant experience",
                    title="Build demonstrable role-relevant experience",
                    rationale=(
                        "The role requires "
                        f"{gap.required_months} months of experience; the supplied "
                        "candidate profile contains "
                        f"{gap.known_candidate_months} known months, leaving a "
                        f"deterministic gap of {gap.missing_months} months. Practical "
                        "projects, labs, portfolio work, supervised work, "
                        "or other real role-relevant practice can build demonstrable "
                        "experience, but do not automatically count as formal "
                        "employment."
                    ),
                    suggested_course_topic=None,
                )
            )

        if gaps.education_gap is not None:
            requirement = gaps.education_gap
            details: list[str] = []
            if requirement.level is not None:
                details.append(f"level: {requirement.level.value.replace('_', ' ')}")
            if requirement.field_of_study is not None:
                details.append(f"field of study: {requirement.field_of_study}")
            if requirement.description is not None:
                details.append(f"description: {requirement.description}")
            items.append(
                LearningRecommendation(
                    kind=LearningRecommendationKind.EDUCATION,
                    priority=LearningRecommendationPriority.HIGH,
                    topic="Education requirement",
                    title="Review the role's education requirement",
                    rationale=(
                        "The supplied role specifies an education requirement "
                        f"({'; '.join(details)}), and the deterministic analysis found "
                        "no matching education evidence in the supplied candidate "
                        "profile. Reviewing this requirement can clarify what "
                        "education to strengthen; "
                        "meeting it does not guarantee qualification."
                    ),
                    suggested_course_topic=None,
                )
            )

        seen_preferred: set[Skill] = set()
        for skill in gaps.missing_preferred_skills:
            if skill in required_skills or skill in seen_preferred:
                continue
            seen_preferred.add(skill)
            items.append(self._skill_recommendation(skill, required=False))

        return LearningRecommendations(items=tuple(items))

    @staticmethod
    def _skill_recommendation(
        skill: Skill, *, required: bool
    ) -> LearningRecommendation:
        if required:
            kind = LearningRecommendationKind.REQUIRED_SKILL
            priority = LearningRecommendationPriority.HIGH
            rationale = (
                f"{skill.name} is listed as a required skill for this role, but no "
                f"matching {skill.name} evidence was found in the supplied candidate "
                "profile."
            )
        else:
            kind = LearningRecommendationKind.PREFERRED_SKILL
            priority = LearningRecommendationPriority.MEDIUM
            rationale = (
                f"{skill.name} is listed as a preferred, not mandatory, skill for this "
                "role. Strengthening it may improve role alignment because no matching "
                f"{skill.name} evidence was found in the supplied candidate profile."
            )

        return LearningRecommendation(
            kind=kind,
            priority=priority,
            topic=skill.name,
            title=f"Strengthen {skill.name}",
            rationale=rationale,
            suggested_course_topic=f"{skill.name} fundamentals",
        )
