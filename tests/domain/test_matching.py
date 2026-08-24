"""
Tests for the Deterministic Matcher.
"""

from pathfinder_ai.domain import (
    CandidatePreferences,
    CandidateProfile,
    DeterministicMatcher,
    EducationLevel,
    EducationRecord,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
    JobTitle,
    Project,
    Skill,
    WorkExperience,
)


def test_basic_skill_matching() -> None:
    """Test required and preferred skill scoring."""
    job = JobDescription(
        title=JobTitle("Software Engineer"),
        required_skills=(Skill("Python"), Skill("SQL")),
        preferred_skills=(Skill("Docker"), Skill("Kubernetes")),
    )

    # Perfect match
    candidate = CandidateProfile(
        skills=(Skill("Python"), Skill("SQL"), Skill("Docker"), Skill("Kubernetes"))
    )
    matcher = DeterministicMatcher()
    score = matcher.match(candidate, job)
    assert score.value == 100.0  # 3/3 points

    # Only required
    candidate_req = CandidateProfile(skills=(Skill("Python"), Skill("SQL")))
    score_req = matcher.match(candidate_req, job)
    assert score_req.value == 66.67  # 2/3 points

    # Partial required
    candidate_part = CandidateProfile(skills=(Skill("Python"),))
    score_part = matcher.match(candidate_part, job)
    assert score_part.value == 33.33  # 1/3 points

    # No required match, only preferred
    candidate_pref = CandidateProfile(skills=(Skill("Docker"),))
    score_pref = matcher.match(candidate_pref, job)
    assert score_pref.value == 16.67  # 0.5/3 points

    # No match
    candidate_none = CandidateProfile(skills=(Skill("Java"),))
    score_none = matcher.match(candidate_none, job)
    assert score_none.value == 0.0


def test_skill_evidence_sources() -> None:
    """Test skills are extracted from multiple sources and deduplicated correctly."""
    job = JobDescription(
        title=JobTitle("Software Engineer"),
        required_skills=(Skill("Python"), Skill("SQL"), Skill("AWS")),
    )

    # Candidate with Python in skills, SQL in experience, AWS in project,
    # and duplicate Python in experience
    candidate = CandidateProfile(
        skills=(Skill("python"),),  # lowercase to test normalization implicit in domain
        experience=(
            WorkExperience(
                role_title=JobTitle("Dev"), skills=(Skill("SQL"), Skill("Python"))
            ),
        ),
        projects=(Project(name="Cloud app", skills=(Skill("AWS"),)),),
    )

    matcher = DeterministicMatcher()
    score = matcher.match(candidate, job)
    assert score.value == 100.0  # (3/3) Duplicate Python doesn't inflate score.


def test_experience_matching() -> None:
    """Test proportional experience scoring."""
    job = JobDescription(
        title=JobTitle("Engineer"),
        experience_requirement=ExperienceRequirement(minimum_years=3, maximum_years=10),
    )
    matcher = DeterministicMatcher()

    # 36 months = exactly 3 years (100% credit)
    cand_exact = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Eng"), duration_months=36),)
    )
    assert matcher.match(cand_exact, job).value == 100.0

    # 18 months = 1.5 years (50% credit)
    cand_half = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Eng"), duration_months=18),)
    )
    assert matcher.match(cand_half, job).value == 50.0

    # 60 months = 5 years (cap at 100% credit)
    cand_over = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Eng"), duration_months=60),)
    )
    assert matcher.match(cand_over, job).value == 100.0

    # Multiple experiences sum up
    cand_multi = CandidateProfile(
        experience=(
            WorkExperience(role_title=JobTitle("Eng 1"), duration_months=12),
            WorkExperience(role_title=JobTitle("Eng 2"), duration_months=24),
        )
    )
    assert matcher.match(cand_multi, job).value == 100.0

    # Unknown duration counts as 0
    cand_unknown = CandidateProfile(
        experience=(WorkExperience(role_title=JobTitle("Eng"), duration_months=None),)
    )
    assert matcher.match(cand_unknown, job).value == 0.0

    # Max-only requirement is not scored in baseline
    job_max_only = JobDescription(
        title=JobTitle("Junior"),
        experience_requirement=ExperienceRequirement(maximum_years=2),
    )
    assert matcher.match(cand_exact, job_max_only).value is None

    # Zero minimum years gets full credit immediately
    job_zero_min = JobDescription(
        title=JobTitle("Junior"),
        experience_requirement=ExperienceRequirement(minimum_years=0),
    )
    assert matcher.match(cand_unknown, job_zero_min).value == 100.0


def test_education_matching() -> None:
    """Test hierarchical and exact text education scoring."""
    job_bachelor_cs = JobDescription(
        title=JobTitle("Eng"),
        education_requirement=EducationRequirement(
            level=EducationLevel.BACHELOR, field_of_study="Computer Science"
        ),
    )
    matcher = DeterministicMatcher()

    # Exact match
    cand_exact = CandidateProfile(
        education=(
            EducationRecord(
                level=EducationLevel.BACHELOR, field_of_study="Computer Science"
            ),
        )
    )
    assert matcher.match(cand_exact, job_bachelor_cs).value == 100.0

    # Higher level, same field (satisfies)
    cand_master = CandidateProfile(
        education=(
            EducationRecord(
                level=EducationLevel.MASTER, field_of_study="computer science"
            ),
        )
    )
    assert matcher.match(cand_master, job_bachelor_cs).value == 100.0

    # Lower level (does not satisfy)
    cand_assoc = CandidateProfile(
        education=(
            EducationRecord(
                level=EducationLevel.ASSOCIATE, field_of_study="Computer Science"
            ),
        )
    )
    assert matcher.match(cand_assoc, job_bachelor_cs).value == 0.0

    # Different field (does not satisfy)
    cand_other_field = CandidateProfile(
        education=(
            EducationRecord(
                level=EducationLevel.BACHELOR, field_of_study="Mathematics"
            ),
        )
    )
    assert matcher.match(cand_other_field, job_bachelor_cs).value == 0.0

    # Test OTHER level
    job_other = JobDescription(
        title=JobTitle("Eng"),
        education_requirement=EducationRequirement(level=EducationLevel.OTHER),
    )
    cand_other = CandidateProfile(
        education=(EducationRecord(level=EducationLevel.OTHER),)
    )
    assert matcher.match(cand_other, job_other).value == 100.0
    assert (
        matcher.match(cand_exact, job_other).value == 0.0
    )  # BACHELOR does not satisfy OTHER

    # Test job requirement with level=BACHELOR but candidate has OTHER
    cand_has_other = CandidateProfile(
        education=(
            EducationRecord(
                level=EducationLevel.OTHER, field_of_study="Computer Science"
            ),
        )
    )
    assert matcher.match(cand_has_other, job_bachelor_cs).value == 0.0

    # Test job requirement with None level, but specific field
    job_field_only = JobDescription(
        title=JobTitle("Eng"),
        education_requirement=EducationRequirement(field_of_study="Computer Science"),
    )
    assert matcher.match(cand_exact, job_field_only).value == 100.0

    # Test job requirement with level=BACHELOR but no field
    job_level_only = JobDescription(
        title=JobTitle("Eng"),
        education_requirement=EducationRequirement(level=EducationLevel.BACHELOR),
    )
    assert matcher.match(cand_exact, job_level_only).value == 100.0

    # Level and field satisfied by different records -> FAILS
    cand_split = CandidateProfile(
        education=(
            EducationRecord(level=EducationLevel.BACHELOR, field_of_study="Math"),
            EducationRecord(
                level=EducationLevel.ASSOCIATE, field_of_study="Computer Science"
            ),
        )
    )
    assert matcher.match(cand_split, job_bachelor_cs).value == 0.0


def test_total_score_and_invariants() -> None:
    """Test final score determinism, limits, and unavailable scores."""
    job_empty = JobDescription(title=JobTitle("Blank"))
    cand = CandidateProfile(skills=(Skill("Python"),))
    matcher = DeterministicMatcher()

    # Job with no scoreable requirements
    assert matcher.match(cand, job_empty).value is None

    # Unsupported text fields do not affect score (e.g. description)
    job_desc_only = JobDescription(
        title=JobTitle("Eng"),
        education_requirement=EducationRequirement(description="Good school required"),
    )
    assert matcher.match(cand, job_desc_only).value is None

    # Test identical inputs give identical results
    job = JobDescription(
        title=JobTitle("Eng"),
        required_skills=(Skill("Python"),),
        experience_requirement=ExperienceRequirement(minimum_years=1),
    )
    cand_full = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(WorkExperience(role_title=JobTitle("Eng"), duration_months=12),),
    )
    score1 = matcher.match(cand_full, job)
    score2 = matcher.match(cand_full, job)
    assert score1.value == 100.0
    assert score2.value == 100.0

    # Test preferences don't affect score
    cand_pref = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(WorkExperience(role_title=JobTitle("Eng"), duration_months=12),),
        preferences=CandidatePreferences(preferred_locations=("NYC",)),
    )
    assert matcher.match(cand_pref, job).value == 100.0
