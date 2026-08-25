import pytest

from pathfinder_ai.domain import (
    CandidateProfile,
    EducationLevel,
    EducationRecord,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
    JobTitle,
    Skill,
    WorkExperience,
)
from pathfinder_ai.domain.explanation import (
    EvidenceSourceKind,
    ExperienceGap,
    ScoreComponent,
    ScoreComponentKind,
)
from pathfinder_ai.domain.matching import DeterministicMatcher, MatchScore


def test_match_equals_explain_score() -> None:
    job = JobDescription(
        title=JobTitle("Software Engineer"),
        required_skills=(Skill("Python"), Skill("SQL")),
        experience_requirement=ExperienceRequirement(minimum_years=2),
    )
    candidate = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(
            WorkExperience(
                role_title=JobTitle("Junior Developer"),
                duration_months=24,
            ),
        ),
    )

    matcher = DeterministicMatcher()
    score_only = matcher.match(candidate, job)
    explanation = matcher.explain(candidate, job)

    assert score_only == explanation.score
    # required possible = 2, earned = 1
    # experience possible = 1, earned = 1 (24 / 24 months)
    # total possible = 3, earned = 2 -> 66.67
    assert score_only.value == 66.67


def test_explanation_components() -> None:
    job = JobDescription(
        title=JobTitle("Engineer"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
        experience_requirement=ExperienceRequirement(minimum_years=1),
        education_requirement=EducationRequirement(level=EducationLevel.BACHELOR),
    )
    candidate = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=6),),
    )

    explanation = DeterministicMatcher().explain(candidate, job)

    assert len(explanation.components) == 4
    # Check ordering
    assert explanation.components[0].kind == ScoreComponentKind.REQUIRED_SKILLS
    assert explanation.components[1].kind == ScoreComponentKind.PREFERRED_SKILLS
    assert explanation.components[2].kind == ScoreComponentKind.EXPERIENCE
    assert explanation.components[3].kind == ScoreComponentKind.EDUCATION

    assert explanation.components[0].earned_points == 1.0
    assert explanation.components[0].possible_points == 1.0

    assert explanation.components[1].earned_points == 0.0
    assert explanation.components[1].possible_points == 0.5

    assert explanation.components[2].earned_points == 0.5  # 6/12 months
    assert explanation.components[2].possible_points == 1.0

    assert explanation.components[3].earned_points == 0.0
    assert explanation.components[3].possible_points == 1.0

    # Total score calculation test
    assert explanation.score.value == round((1.5 / 3.5) * 100, 2)


def test_matched_skill_evidence() -> None:
    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("AWS"),),
    )
    from pathfinder_ai.domain import Project

    candidate = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(
            WorkExperience(
                role_title=JobTitle("Engineer"),
                skills=(Skill("Python"), Skill("AWS")),
            ),
        ),
        projects=(Project(name="Cloud App", skills=(Skill("AWS"),)),),
    )

    explanation = DeterministicMatcher().explain(candidate, job)

    # 1 required (Python), 1 preferred (AWS)
    assert len(explanation.matched_skills) == 2

    python_ev = explanation.matched_skills[0]
    assert python_ev.skill == Skill("Python")
    assert python_ev.is_required is True
    assert len(python_ev.evidence_sources) == 2
    assert python_ev.evidence_sources[0].kind == EvidenceSourceKind.PROFILE
    assert python_ev.evidence_sources[1].kind == EvidenceSourceKind.WORK_EXPERIENCE
    assert python_ev.evidence_sources[1].label == "Engineer"

    aws_ev = explanation.matched_skills[1]
    assert aws_ev.skill == Skill("AWS")
    assert aws_ev.is_required is False
    assert len(aws_ev.evidence_sources) == 2
    assert aws_ev.evidence_sources[0].kind == EvidenceSourceKind.WORK_EXPERIENCE
    assert aws_ev.evidence_sources[1].kind == EvidenceSourceKind.PROJECT
    assert aws_ev.evidence_sources[1].label == "Cloud App"


def test_gap_analysis() -> None:
    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("A"), Skill("B")),
        preferred_skills=(Skill("C"),),
        experience_requirement=ExperienceRequirement(minimum_years=2),
        education_requirement=EducationRequirement(level=EducationLevel.MASTER),
    )
    candidate = CandidateProfile(
        skills=(Skill("A"),),
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=12),),
    )

    explanation = DeterministicMatcher().explain(candidate, job)
    gaps = explanation.gaps

    assert gaps.missing_required_skills == (Skill("B"),)
    assert gaps.missing_preferred_skills == (Skill("C"),)

    assert gaps.experience_gap is not None
    assert gaps.experience_gap.required_months == 24
    assert gaps.experience_gap.known_candidate_months == 12
    assert gaps.experience_gap.missing_months == 12

    assert gaps.education_gap is not None
    assert gaps.education_gap.level == EducationLevel.MASTER


def test_skill_keyword_coverage() -> None:
    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"), Skill("SQL")),
        preferred_skills=(Skill("Docker"), Skill("K8s")),
    )
    candidate = CandidateProfile(
        skills=(Skill("Python"), Skill("Docker")),
    )

    explanation = DeterministicMatcher().explain(candidate, job)
    kw = explanation.keyword_coverage

    assert kw.matched_keywords == (Skill("Python"), Skill("Docker"))
    assert kw.missing_keywords == (Skill("SQL"), Skill("K8s"))
    assert kw.percentage == 50.0

    # Test Unscoreable Jobs Coverage
    job_empty = JobDescription(title=JobTitle("Dev"))
    candidate_empty = CandidateProfile(skills=(Skill("A"),))
    explanation_empty = DeterministicMatcher().explain(candidate_empty, job_empty)

    assert explanation_empty.keyword_coverage.percentage is None
    assert explanation_empty.keyword_coverage.matched_keywords == ()


def test_experience_evidence() -> None:
    job = JobDescription(
        title=JobTitle("Dev"),
        experience_requirement=ExperienceRequirement(minimum_years=2),
    )
    candidate = CandidateProfile(
        experience=(
            WorkExperience(role_title=JobTitle("Dev"), duration_months=12),
            WorkExperience(role_title=JobTitle("Dev 2"), duration_months=12),
            WorkExperience(role_title=JobTitle("Unknown")),  # None duration
        )
    )

    explanation = DeterministicMatcher().explain(candidate, job)
    assert explanation.experience is not None
    assert explanation.experience.required_months == 24
    assert explanation.experience.known_candidate_months == 24
    assert explanation.experience.earned_points == 1.0

    # Gap analysis should be None since it's met
    assert explanation.gaps.experience_gap is None


def test_education_evidence() -> None:
    job = JobDescription(
        title=JobTitle("Dev"),
        education_requirement=EducationRequirement(
            level=EducationLevel.BACHELOR, field_of_study="Computer Science"
        ),
    )

    # Higher level satisfies, case-insensitive field satisfies
    matched_record = EducationRecord(
        level=EducationLevel.MASTER, field_of_study="computer science"
    )
    candidate = CandidateProfile(education=(matched_record,))

    explanation = DeterministicMatcher().explain(candidate, job)
    assert explanation.education is not None
    assert explanation.education.satisfied is True
    assert explanation.education.matched_record == matched_record
    assert explanation.gaps.education_gap is None

    # Not satisfied
    candidate_bad = CandidateProfile(
        education=(
            EducationRecord(
                level=EducationLevel.ASSOCIATE, field_of_study="Computer Science"
            ),
        )
    )
    explanation_bad = DeterministicMatcher().explain(candidate_bad, job)
    assert explanation_bad.education is not None
    assert explanation_bad.education.satisfied is False
    assert explanation_bad.education.matched_record is None
    assert explanation_bad.gaps.education_gap == job.education_requirement


def test_explanation_immutability() -> None:
    job = JobDescription(title=JobTitle("Dev"), required_skills=(Skill("Python"),))
    candidate = CandidateProfile(skills=(Skill("Python"),))
    explanation = DeterministicMatcher().explain(candidate, job)

    from dataclasses import FrozenInstanceError

    with pytest.raises(FrozenInstanceError):
        explanation.score = MatchScore(value=100.0)  # type: ignore[misc]

    assert isinstance(explanation.components, tuple)
    assert isinstance(explanation.matched_skills, tuple)
    assert isinstance(explanation.gaps.missing_required_skills, tuple)
    assert isinstance(explanation.keyword_coverage.matched_keywords, tuple)


def test_unscoreable_job() -> None:
    job = JobDescription(title=JobTitle("Engineer"))
    candidate = CandidateProfile(skills=(Skill("Python"),))

    explanation = DeterministicMatcher().explain(candidate, job)

    assert explanation.score.value is None
    assert explanation.components == ()
    assert explanation.matched_skills == ()
    assert explanation.experience is None
    assert explanation.education is None
    assert explanation.gaps.experience_gap is None
    assert explanation.gaps.education_gap is None
    assert explanation.keyword_coverage.percentage is None


def test_experience_gap_validation() -> None:
    with pytest.raises(
        ValueError, match=r"missing_months must equal required - known\."
    ):
        ExperienceGap(required_months=12, known_candidate_months=6, missing_months=5)

    with pytest.raises(ValueError, match=r"missing_months must be > 0 for a gap\."):
        ExperienceGap(required_months=12, known_candidate_months=12, missing_months=0)


def test_score_component_validation() -> None:
    with pytest.raises(ValueError, match=r"possible_points must be > 0\."):
        ScoreComponent(
            kind=ScoreComponentKind.REQUIRED_SKILLS, earned_points=0, possible_points=0
        )

    with pytest.raises(ValueError, match=r"earned_points cannot be negative\."):
        ScoreComponent(
            kind=ScoreComponentKind.REQUIRED_SKILLS, earned_points=-1, possible_points=1
        )

    with pytest.raises(
        ValueError, match=r"earned_points cannot exceed possible_points\."
    ):
        ScoreComponent(
            kind=ScoreComponentKind.REQUIRED_SKILLS, earned_points=2, possible_points=1
        )
