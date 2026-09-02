from dataclasses import FrozenInstanceError, replace

import pytest

from pathfinder_ai.application import (
    DeterministicLearningRecommender,
    LearningRecommendation,
    LearningRecommendationKind,
    LearningRecommendationPriority,
    LearningRecommendations,
)
from pathfinder_ai.domain import (
    CandidateProfile,
    DeterministicMatcher,
    EducationLevel,
    EducationRequirement,
    ExperienceGap,
    GapAnalysis,
    JobDescription,
    JobTitle,
    Skill,
)


def _recommend(
    *,
    required: tuple[Skill, ...] = (),
    preferred: tuple[Skill, ...] = (),
    experience_gap: ExperienceGap | None = None,
    education_gap: EducationRequirement | None = None,
) -> LearningRecommendations:
    candidate = CandidateProfile(skills=(Skill("existing skill"),))
    job = JobDescription(title=JobTitle("Engineer"))
    explanation = DeterministicMatcher().explain(candidate, job)
    explanation = replace(
        explanation,
        gaps=GapAnalysis(
            missing_required_skills=required,
            missing_preferred_skills=preferred,
            experience_gap=experience_gap,
            education_gap=education_gap,
        ),
    )
    return DeterministicLearningRecommender().recommend(candidate, job, explanation)


def test_required_skills_are_high_priority_and_preserve_source_order() -> None:
    result = _recommend(required=(Skill("Docker"), Skill("Python")))

    assert [item.topic for item in result.items] == ["docker", "python"]
    assert all(
        item.kind is LearningRecommendationKind.REQUIRED_SKILL for item in result.items
    )
    assert all(
        item.priority is LearningRecommendationPriority.HIGH for item in result.items
    )
    assert result.items[0].title == "Strengthen docker"
    assert result.items[0].suggested_course_topic == "docker fundamentals"
    assert "required skill" in result.items[0].rationale
    assert "no matching docker evidence" in result.items[0].rationale


def test_preferred_skill_is_medium_priority_and_not_mandatory() -> None:
    item = _recommend(preferred=(Skill("Kubernetes"),)).items[0]

    assert item.kind is LearningRecommendationKind.PREFERRED_SKILL
    assert item.priority is LearningRecommendationPriority.MEDIUM
    assert item.topic == "kubernetes"
    assert item.suggested_course_topic == "kubernetes fundamentals"
    assert "preferred, not mandatory" in item.rationale


def test_required_skill_takes_precedence_and_duplicate_gaps_are_deduplicated() -> None:
    docker = Skill("Docker")
    result = _recommend(
        required=(docker, docker),
        preferred=(docker, Skill("Python"), Skill("Python")),
    )

    assert [(item.kind, item.topic) for item in result.items] == [
        (LearningRecommendationKind.REQUIRED_SKILL, "docker"),
        (LearningRecommendationKind.PREFERRED_SKILL, "python"),
    ]


def test_experience_gap_uses_exact_values_without_fabrication() -> None:
    item = _recommend(
        experience_gap=ExperienceGap(
            required_months=36, known_candidate_months=12, missing_months=24
        )
    ).items[0]

    assert item.kind is LearningRecommendationKind.EXPERIENCE
    assert item.priority is LearningRecommendationPriority.HIGH
    assert item.suggested_course_topic is None
    assert "36 months" in item.rationale
    assert "12 known months" in item.rationale
    assert "gap of 24 months" in item.rationale
    assert "do not automatically count as formal employment" in item.rationale
    assert "http" not in item.rationale.lower()
    assert "coursera" not in item.rationale.lower()


@pytest.mark.parametrize(
    ("requirement", "expected"),
    [
        (EducationRequirement(level=EducationLevel.BACHELOR), "level: bachelor"),
        (
            EducationRequirement(field_of_study="Computer Science"),
            "field of study: Computer Science",
        ),
        (
            EducationRequirement(description="Equivalent practical background"),
            "description: Equivalent practical background",
        ),
    ],
)
def test_education_gap_uses_only_structured_requirement(
    requirement: EducationRequirement, expected: str
) -> None:
    item = _recommend(education_gap=requirement).items[0]

    assert item.kind is LearningRecommendationKind.EDUCATION
    assert item.priority is LearningRecommendationPriority.HIGH
    assert item.suggested_course_topic is None
    assert expected in item.rationale
    assert "does not guarantee qualification" in item.rationale


def test_order_is_required_experience_education_then_preferred() -> None:
    result = _recommend(
        required=(Skill("Required one"), Skill("Required two")),
        preferred=(Skill("Preferred one"), Skill("Preferred two")),
        experience_gap=ExperienceGap(
            required_months=24, known_candidate_months=6, missing_months=18
        ),
        education_gap=EducationRequirement(
            level=EducationLevel.MASTER,
            field_of_study="Data Science",
            description="or comparable education",
        ),
    )

    assert [item.kind for item in result.items] == [
        LearningRecommendationKind.REQUIRED_SKILL,
        LearningRecommendationKind.REQUIRED_SKILL,
        LearningRecommendationKind.EXPERIENCE,
        LearningRecommendationKind.EDUCATION,
        LearningRecommendationKind.PREFERRED_SKILL,
        LearningRecommendationKind.PREFERRED_SKILL,
    ]


def test_no_gaps_returns_empty_immutable_deterministic_result() -> None:
    first = _recommend()
    second = _recommend()

    assert first == second == LearningRecommendations(items=())
    assert first.items == ()
    assert isinstance(first.items, tuple)
    with pytest.raises(FrozenInstanceError):
        first.items = ()  # type: ignore[misc]


def test_models_normalize_text_and_defensively_convert_tuple() -> None:
    item = LearningRecommendation(
        kind=LearningRecommendationKind.REQUIRED_SKILL,
        priority=LearningRecommendationPriority.HIGH,
        topic="  data   engineering ",
        title=" Strengthen   data engineering ",
        rationale=" Evidence   was not found. ",
        suggested_course_topic=" data engineering   fundamentals ",
    )
    items = [item]
    result = LearningRecommendations(items=items)  # type: ignore[arg-type]
    items.clear()

    assert item.topic == "data engineering"
    assert item.title == "Strengthen data engineering"
    assert item.rationale == "Evidence was not found."
    assert item.suggested_course_topic == "data engineering fundamentals"
    assert result.items == (item,)


@pytest.mark.parametrize("field", ["topic", "title", "rationale"])
def test_required_public_text_rejects_blank(field: str) -> None:
    values = {
        "kind": LearningRecommendationKind.REQUIRED_SKILL,
        "priority": LearningRecommendationPriority.HIGH,
        "topic": "python",
        "title": "Strengthen python",
        "rationale": "Evidence-grounded rationale.",
        "suggested_course_topic": None,
    }
    values[field] = " \n "

    with pytest.raises(ValueError, match=rf"{field} cannot be blank"):
        LearningRecommendation(**values)  # type: ignore[arg-type]


def test_optional_course_topic_rejects_blank() -> None:
    with pytest.raises(ValueError, match=r"suggested_course_topic cannot be blank"):
        LearningRecommendation(
            kind=LearningRecommendationKind.REQUIRED_SKILL,
            priority=LearningRecommendationPriority.HIGH,
            topic="python",
            title="Strengthen python",
            rationale="Evidence-grounded rationale.",
            suggested_course_topic=" ",
        )
