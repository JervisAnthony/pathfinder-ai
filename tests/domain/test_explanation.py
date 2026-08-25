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
    EducationEvidence,
    EvidenceSourceKind,
    ExperienceGap,
    GapAnalysis,
    ScoreComponent,
    ScoreComponentKind,
    SkillKeywordCoverage,
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


def test_skill_keyword_coverage_consistency() -> None:
    # 0 total keywords
    with pytest.raises(
        ValueError, match=r"percentage must be None when there are no keywords\."
    ):
        SkillKeywordCoverage(matched_keywords=(), missing_keywords=(), percentage=0.0)

    # Missing keywords, percentage None
    with pytest.raises(
        ValueError, match=r"percentage cannot be None when keywords are present\."
    ):
        SkillKeywordCoverage(
            matched_keywords=(Skill("A"),), missing_keywords=(), percentage=None
        )

    # Valid out of bounds percentage
    with pytest.raises(ValueError, match=r"percentage must be between 0.0 and 100.0\."):
        SkillKeywordCoverage(
            matched_keywords=(Skill("A"),), missing_keywords=(), percentage=101.0
        )
    with pytest.raises(ValueError, match=r"percentage must be between 0.0 and 100.0\."):
        SkillKeywordCoverage(
            matched_keywords=(Skill("A"),), missing_keywords=(), percentage=-1.0
        )

    # Invalid calculated percentage
    with pytest.raises(
        ValueError, match=r"percentage 50.0 does not match expected 100.0\."
    ):
        SkillKeywordCoverage(
            matched_keywords=(Skill("A"),), missing_keywords=(), percentage=50.0
        )

    # Check 1 of 3 valid (33.33)
    SkillKeywordCoverage(
        matched_keywords=(Skill("A"),),
        missing_keywords=(Skill("B"), Skill("C")),
        percentage=33.33,
    )


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


def test_education_evidence_consistency() -> None:
    req = EducationRequirement(level=EducationLevel.BACHELOR)
    rec = EducationRecord(level=EducationLevel.BACHELOR)

    with pytest.raises(
        ValueError, match=r"satisfied cannot be True if matched_record is None\."
    ):
        EducationEvidence(requirement=req, matched_record=None, satisfied=True)

    with pytest.raises(
        ValueError, match=r"satisfied cannot be False if matched_record is not None\."
    ):
        EducationEvidence(requirement=req, matched_record=rec, satisfied=False)


def test_intended_public_api() -> None:
    from pathfinder_ai.domain import (
        DeterministicMatcher,
        EducationEvidence,
        EvidenceSource,
        EvidenceSourceKind,
        ExperienceEvidence,
        ExperienceGap,
        GapAnalysis,
        MatchedSkillEvidence,
        MatchExplanation,
        MatchScore,
        ScoreComponent,
        ScoreComponentKind,
        SkillKeywordCoverage,
    )

    assert DeterministicMatcher is not None
    assert MatchScore is not None
    assert MatchExplanation is not None
    assert ScoreComponent is not None
    assert ScoreComponentKind is not None
    assert GapAnalysis is not None
    assert ExperienceEvidence is not None
    assert ExperienceGap is not None
    assert EducationEvidence is not None
    assert SkillKeywordCoverage is not None
    assert MatchedSkillEvidence is not None
    assert EvidenceSource is not None
    assert EvidenceSourceKind is not None


def test_experience_behavior_regressions() -> None:
    # minimum_years=0
    job_0 = JobDescription(
        title=JobTitle("Dev"),
        experience_requirement=ExperienceRequirement(minimum_years=0),
    )
    candidate = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=12),)
    )
    explanation_0 = DeterministicMatcher().explain(candidate, job_0)
    assert not any(
        c.kind == ScoreComponentKind.EXPERIENCE for c in explanation_0.components
    )
    assert explanation_0.experience is None
    assert explanation_0.gaps.experience_gap is None

    # maximum-only experience
    job_max = JobDescription(
        title=JobTitle("Dev"),
        experience_requirement=ExperienceRequirement(maximum_years=5),
    )
    explanation_max = DeterministicMatcher().explain(candidate, job_max)
    assert not any(
        c.kind == ScoreComponentKind.EXPERIENCE for c in explanation_max.components
    )
    assert explanation_max.experience is None
    assert explanation_max.gaps.experience_gap is None


def test_education_behavior_regressions() -> None:
    # description-only education
    job_desc = JobDescription(
        title=JobTitle("Dev"),
        education_requirement=EducationRequirement(description="A good school"),
    )
    candidate = CandidateProfile(
        education=(EducationRecord(level=EducationLevel.BACHELOR),)
    )
    explanation_desc = DeterministicMatcher().explain(candidate, job_desc)
    assert not any(
        c.kind == ScoreComponentKind.EDUCATION for c in explanation_desc.components
    )
    assert explanation_desc.education is None
    assert explanation_desc.gaps.education_gap is None

    # multiple candidate EducationRecords satisfy the same requirement
    # the first record in deterministic candidate order is exposed
    job_mult = JobDescription(
        title=JobTitle("Dev"),
        education_requirement=EducationRequirement(level=EducationLevel.BACHELOR),
    )
    rec1 = EducationRecord(level=EducationLevel.BACHELOR, field_of_study="Math")
    rec2 = EducationRecord(level=EducationLevel.BACHELOR, field_of_study="CS")
    candidate_mult = CandidateProfile(education=(rec1, rec2))

    explanation_mult = DeterministicMatcher().explain(candidate_mult, job_mult)
    assert explanation_mult.education is not None
    assert explanation_mult.education.matched_record == rec1


def test_keyword_coverage_behavior_regressions() -> None:
    # 100% coverage
    job_100 = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
    )
    candidate_100 = CandidateProfile(skills=(Skill("Python"), Skill("Docker")))
    exp_100 = DeterministicMatcher().explain(candidate_100, job_100)
    assert exp_100.keyword_coverage.percentage == 100.0

    # 0% coverage
    job_0 = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
    )
    candidate_0 = CandidateProfile(skills=(Skill("Java"),))
    exp_0 = DeterministicMatcher().explain(candidate_0, job_0)
    assert exp_0.keyword_coverage.percentage == 0.0

    # 1 out of 3 -> 33.33
    job_33 = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("A"), Skill("B")),
        preferred_skills=(Skill("C"),),
    )
    candidate_33 = CandidateProfile(skills=(Skill("A"),))
    exp_33 = DeterministicMatcher().explain(candidate_33, job_33)
    assert exp_33.keyword_coverage.percentage == 33.33

    # coverage remains unweighted and can therefore differ from weighted MatchScore
    assert exp_33.score.value is not None
    assert exp_33.score.value != 33.33  # (1.0 / 2.5) * 100 = 40.0

    # aliases do not match
    job_alias = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("machine learning"), Skill("postgresql")),
    )
    candidate_alias = CandidateProfile(skills=(Skill("ml"), Skill("postgres")))
    exp_alias = DeterministicMatcher().explain(candidate_alias, job_alias)
    assert exp_alias.keyword_coverage.percentage == 0.0


def test_immutability_behavior_regressions() -> None:
    from dataclasses import FrozenInstanceError

    score_comp = ScoreComponent(
        kind=ScoreComponentKind.REQUIRED_SKILLS, earned_points=1.0, possible_points=1.0
    )
    with pytest.raises(FrozenInstanceError):
        score_comp.earned_points = 2.0  # type: ignore[misc]

    gap_analysis = GapAnalysis(
        missing_required_skills=(Skill("A"),),
        missing_preferred_skills=(),
        experience_gap=None,
        education_gap=None,
    )
    with pytest.raises(FrozenInstanceError):
        gap_analysis.missing_required_skills = ()  # type: ignore[misc]

    kw_cov = SkillKeywordCoverage(
        matched_keywords=(Skill("A"),), missing_keywords=(Skill("B"),), percentage=50.0
    )
    with pytest.raises(FrozenInstanceError):
        kw_cov.percentage = 100.0  # type: ignore[misc]
