from dataclasses import FrozenInstanceError

import pytest

from pathfinder_ai.application import (
    DeterministicInterviewPreparer,
    InterviewPreparation,
    InterviewQuestionCategory,
    InterviewThemeKind,
)
from pathfinder_ai.domain import (
    CandidateProfile,
    DeterministicMatcher,
    EducationLevel,
    EducationRecord,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
    JobTitle,
    Project,
    Responsibility,
    Skill,
    WorkExperience,
)


def test_general_behavior() -> None:
    preparer = DeterministicInterviewPreparer()
    job = JobDescription(
        title=JobTitle("Developer"),
        required_skills=(Skill("Python"),),
    )
    candidate = CandidateProfile(skills=(Skill("Python"),))
    explanation = DeterministicMatcher().explain(candidate, job)

    prep = preparer.prepare(candidate, job, explanation)

    assert isinstance(prep, InterviewPreparation)
    assert isinstance(prep.themes, tuple)
    assert isinstance(prep.talking_points, tuple)
    assert isinstance(prep.question_categories, tuple)
    assert isinstance(prep.candidate_questions, tuple)

    # Deterministic repeated output
    prep2 = preparer.prepare(candidate, job, explanation)
    assert prep == prep2


def test_immutability() -> None:
    prep = InterviewPreparation(
        themes=(),
        talking_points=(),
        question_categories=(),
        candidate_questions=(),
    )
    with pytest.raises(FrozenInstanceError):
        prep.themes = ()  # type: ignore[misc]  # type: ignore[misc]


def test_consistency_validation_contradictions() -> None:
    preparer = DeterministicInterviewPreparer()

    job = JobDescription(title=JobTitle("Dev"))
    candidate = CandidateProfile(skills=(Skill("Python"),))

    # Generate an explanation for a mismatched job to force inconsistency
    mismatched_job = JobDescription(
        title=JobTitle("Dev"), required_skills=(Skill("Python"),)
    )
    explanation = DeterministicMatcher().explain(candidate, mismatched_job)

    with pytest.raises(ValueError, match="is not required by the job"):
        preparer.prepare(candidate, job, explanation)

    # Test matched skill not preferred
    mismatched_job2 = JobDescription(
        title=JobTitle("Dev"), preferred_skills=(Skill("Python"),)
    )
    explanation2 = DeterministicMatcher().explain(candidate, mismatched_job2)
    with pytest.raises(ValueError, match="is not preferred by the job"):
        preparer.prepare(candidate, job, explanation2)


def test_matched_skill_strengths() -> None:
    preparer = DeterministicInterviewPreparer()

    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
    )
    candidate = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(
            WorkExperience(
                role_title=JobTitle("Dev"),
                duration_months=12,
                skills=(Skill("Docker"),),
            ),
        ),
        projects=(Project(name="App", description="...", skills=(Skill("Python"),)),),
    )

    explanation = DeterministicMatcher().explain(candidate, job)
    prep = preparer.prepare(candidate, job, explanation)

    themes = [t.kind for t in prep.themes]
    assert InterviewThemeKind.REQUIRED_SKILL_STRENGTH in themes
    assert InterviewThemeKind.PREFERRED_SKILL_STRENGTH in themes

    tps = [tp.description for tp in prep.talking_points]
    assert any("Evidence in profile: python" in tp for tp in tps)
    assert any("Proj: App" in tp for tp in tps)
    assert any("Exp: Dev" in tp for tp in tps)


def test_skill_gaps() -> None:
    preparer = DeterministicInterviewPreparer()

    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
    )
    candidate = CandidateProfile(skills=(Skill("Unrelated"),))

    explanation = DeterministicMatcher().explain(candidate, job)
    prep = preparer.prepare(candidate, job, explanation)

    themes = [t.kind for t in prep.themes]
    assert InterviewThemeKind.REQUIRED_SKILL_GAP in themes
    assert InterviewThemeKind.PREFERRED_SKILL_GAP in themes

    assert any("Missing required skill: python" in t.description for t in prep.themes)
    assert any("Missing preferred skill: docker" in t.description for t in prep.themes)


def test_experience() -> None:
    preparer = DeterministicInterviewPreparer()

    # 1. Meets experience
    job_meets = JobDescription(
        title=JobTitle("Dev"),
        experience_requirement=ExperienceRequirement(minimum_years=2),
    )
    cand_meets = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=24),)
    )
    exp_meets = DeterministicMatcher().explain(cand_meets, job_meets)
    prep_meets = preparer.prepare(cand_meets, job_meets, exp_meets)

    themes_meets = [t.kind for t in prep_meets.themes]
    assert InterviewThemeKind.EXPERIENCE_STRENGTH in themes_meets
    assert InterviewThemeKind.EXPERIENCE_GAP not in themes_meets

    tps_meets = [tp.description for tp in prep_meets.talking_points]
    assert "Candidate meets minimum experience requirement" in tps_meets

    # 2. Experience Gap
    job_gap = JobDescription(
        title=JobTitle("Dev"),
        experience_requirement=ExperienceRequirement(minimum_years=2),
    )
    cand_gap = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=12),)
    )
    exp_gap = DeterministicMatcher().explain(cand_gap, job_gap)
    prep_gap = preparer.prepare(cand_gap, job_gap, exp_gap)

    themes_gap = [t.kind for t in prep_gap.themes]
    assert InterviewThemeKind.EXPERIENCE_GAP in themes_gap

    tps_gap = [tp.description for tp in prep_gap.talking_points]
    assert "Experience gap identified" in tps_gap


def test_education() -> None:
    preparer = DeterministicInterviewPreparer()

    # 1. Meets education
    job_meets = JobDescription(
        title=JobTitle("Dev"),
        education_requirement=EducationRequirement(level=EducationLevel.BACHELOR),
    )
    cand_meets = CandidateProfile(
        education=(EducationRecord(level=EducationLevel.BACHELOR),)
    )
    exp_meets = DeterministicMatcher().explain(cand_meets, job_meets)
    prep_meets = preparer.prepare(cand_meets, job_meets, exp_meets)

    themes_meets = [t.kind for t in prep_meets.themes]
    assert InterviewThemeKind.EDUCATION_ALIGNMENT in themes_meets

    tps_meets = [tp.description for tp in prep_meets.talking_points]
    assert "Candidate satisfies education bachelor" in tps_meets

    # 2. Education Gap
    cand_gap = CandidateProfile(
        education=(EducationRecord(level=EducationLevel.ASSOCIATE),)
    )
    exp_gap = DeterministicMatcher().explain(cand_gap, job_meets)
    prep_gap = preparer.prepare(cand_gap, job_meets, exp_gap)

    themes_gap = [t.kind for t in prep_gap.themes]
    assert InterviewThemeKind.EDUCATION_GAP in themes_gap

    tps_gap = [tp.description for tp in prep_gap.talking_points]
    assert "Candidate does not satisfy education bachelor" in tps_gap


def test_unscoreable_inputs() -> None:
    preparer = DeterministicInterviewPreparer()

    # MatchScore None
    job = JobDescription(title=JobTitle("Dev"))
    cand = CandidateProfile(skills=(Skill("Python"),))
    exp = DeterministicMatcher().explain(cand, job)

    assert exp.score.value is None

    prep = preparer.prepare(cand, job, exp)
    assert prep.themes == ()
    assert prep.talking_points == ()
    assert prep.question_categories == ()
    assert prep.candidate_questions == ()


def test_responsibilities_and_candidate_questions() -> None:
    preparer = DeterministicInterviewPreparer()

    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
        responsibilities=(
            Responsibility(description="Develop APIs"),
            Responsibility(description="Deploy to AWS"),
            Responsibility(description="Write tests"),
        ),
    )
    cand = CandidateProfile(skills=(Skill("Python"),))
    exp = DeterministicMatcher().explain(cand, job)

    prep = preparer.prepare(cand, job, exp)

    # Responsibility Theme
    themes = [t.description for t in prep.themes]
    assert "Role responsibility discussion: Develop APIs" in themes
    assert "Role responsibility discussion: Deploy to AWS" in themes

    # Candidate Questions
    cqs = [q.description for q in prep.candidate_questions]

    # Responsibility questions
    assert any("Day-to-day: Develop APIs" in q for q in cqs)
    assert any("Success for: Deploy to AWS" in q for q in cqs)

    # Required/Preferred questions
    assert any("How is this required skill used day to day" in q for q in cqs)
    assert any("How does this preferred skill fit workflow" in q for q in cqs)


def test_question_categories() -> None:
    preparer = DeterministicInterviewPreparer()

    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
        experience_requirement=ExperienceRequirement(minimum_years=2),
        education_requirement=EducationRequirement(level=EducationLevel.BACHELOR),
        responsibilities=(Responsibility("Code"),),
    )
    cand = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=12),),
        education=(EducationRecord(level=EducationLevel.ASSOCIATE),),
    )

    exp = DeterministicMatcher().explain(cand, job)
    prep = preparer.prepare(cand, job, exp)

    categories = prep.question_categories
    assert InterviewQuestionCategory.REQUIRED_SKILL_VALIDATION in categories
    assert InterviewQuestionCategory.PREFERRED_SKILL_GAP_DISCUSSION in categories
    assert InterviewQuestionCategory.EXPERIENCE_DISCUSSION in categories
    assert InterviewQuestionCategory.EXPERIENCE_GAP_DISCUSSION in categories
    assert InterviewQuestionCategory.EDUCATION_DISCUSSION in categories
    assert InterviewQuestionCategory.RESPONSIBILITY_DISCUSSION in categories

    # Deterministic order (Alphabetical by enum string value due to sorting by value)
    assert list(categories) == sorted(list(categories), key=lambda c: c.value)


def test_experience_consistency_failures() -> None:
    preparer = DeterministicInterviewPreparer()
    job = JobDescription(
        title=JobTitle("Dev"),
        experience_requirement=ExperienceRequirement(minimum_years=2),
    )
    cand = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Dev"), duration_months=12),)
    )
    exp = DeterministicMatcher().explain(cand, job)

    # Mutate to make known months inconsistent
    from dataclasses import replace

    from pathfinder_ai.domain import ExperienceGap

    bad_exp_1 = replace(
        exp,
        gaps=replace(
            exp.gaps,
            experience_gap=ExperienceGap(
                required_months=24, known_candidate_months=10, missing_months=14
            ),
        ),
    )
    with pytest.raises(
        ValueError, match="Experience evidence and gap known months are inconsistent"
    ):
        preparer.prepare(cand, job, bad_exp_1)

    bad_exp_2 = replace(
        exp,
        gaps=replace(
            exp.gaps,
            experience_gap=ExperienceGap(
                required_months=36, known_candidate_months=12, missing_months=24
            ),
        ),
    )
    with pytest.raises(
        ValueError, match="Experience evidence and gap required months are inconsistent"
    ):
        preparer.prepare(cand, job, bad_exp_2)


def test_education_consistency_failures() -> None:
    preparer = DeterministicInterviewPreparer()
    job = JobDescription(
        title=JobTitle("Dev"),
        education_requirement=EducationRequirement(level=EducationLevel.BACHELOR),
    )
    cand = CandidateProfile(education=(EducationRecord(level=EducationLevel.BACHELOR),))
    exp = DeterministicMatcher().explain(cand, job)

    from dataclasses import replace

    # education satisfied but gap exists
    bad_exp_1 = replace(
        exp, gaps=replace(exp.gaps, education_gap=job.education_requirement)
    )
    with pytest.raises(
        ValueError, match="Education is satisfied but an education gap exists"
    ):
        preparer.prepare(cand, job, bad_exp_1)

    cand2 = CandidateProfile(
        education=(EducationRecord(level=EducationLevel.ASSOCIATE),)
    )
    exp2 = DeterministicMatcher().explain(cand2, job)
    # education not satisfied but gap missing
    bad_exp_2 = replace(exp2, gaps=replace(exp2.gaps, education_gap=None))
    with pytest.raises(
        ValueError, match="Education is not satisfied but no education gap exists"
    ):
        preparer.prepare(cand2, job, bad_exp_2)


def test_keyword_coverage_consistency_failures() -> None:
    preparer = DeterministicInterviewPreparer()
    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
    )
    cand = CandidateProfile(skills=(Skill("Python"),))
    exp = DeterministicMatcher().explain(cand, job)

    from dataclasses import replace

    from pathfinder_ai.domain import SkillKeywordCoverage

    # matched keyword not in job
    bad_exp_1 = replace(
        exp,
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(Skill("Java"),), missing_keywords=(), percentage=100.0
        ),
    )
    with pytest.raises(
        ValueError,
        match="Matched keyword 'Skill\\(name='java'\\)' is not in job skills",
    ):
        preparer.prepare(cand, job, bad_exp_1)

    # missing keyword not in job
    bad_exp_2 = replace(
        exp,
        keyword_coverage=SkillKeywordCoverage(
            matched_keywords=(), missing_keywords=(Skill("Java"),), percentage=0.0
        ),
    )
    with pytest.raises(
        ValueError,
        match="Missing keyword 'Skill\\(name='java'\\)' is not in job skills",
    ):
        preparer.prepare(cand, job, bad_exp_2)


def test_missing_skill_consistency_failures() -> None:
    preparer = DeterministicInterviewPreparer()
    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
        preferred_skills=(Skill("Docker"),),
    )
    cand = CandidateProfile(skills=(Skill("Python"), Skill("Docker")))
    exp = DeterministicMatcher().explain(cand, job)

    from dataclasses import replace

    bad_exp_1 = replace(
        exp, gaps=replace(exp.gaps, missing_required_skills=(Skill("Python"),))
    )
    with pytest.raises(ValueError, match="matched and missing \\(required\\)"):
        preparer.prepare(cand, job, bad_exp_1)

    bad_exp_2 = replace(
        exp, gaps=replace(exp.gaps, missing_preferred_skills=(Skill("Docker"),))
    )
    with pytest.raises(ValueError, match="matched and missing \\(preferred\\)"):
        preparer.prepare(cand, job, bad_exp_2)


def test_regression_deterministic_matching_unchanged() -> None:
    # Ensure our preparer doesn't inadvertently alter explanation properties
    # by making defensive tests on the explanation itself.
    preparer = DeterministicInterviewPreparer()
    job = JobDescription(
        title=JobTitle("Dev"),
        required_skills=(Skill("Python"),),
    )
    cand = CandidateProfile(skills=(Skill("Python"),))

    exp = DeterministicMatcher().explain(cand, job)

    # Store initial state loosely
    initial_score = exp.score.value
    initial_req_skills = len(exp.matched_skills)

    _ = preparer.prepare(cand, job, exp)

    # Ensure they haven't changed.
    assert exp.score.value == initial_score
    assert len(exp.matched_skills) == initial_req_skills
