"""Tests for the Job Description domain model."""

import pytest

from pathfinder_ai.domain import (
    CompanyInfo,
    EducationLevel,
    EducationRequirement,
    ExperienceRequirement,
    JobDescription,
    JobTitle,
    Responsibility,
    Skill,
)


def test_job_title_valid() -> None:
    title = JobTitle(" Software Engineer ")
    assert title.title == "Software Engineer"


def test_job_title_whitespace_normalization() -> None:
    title = JobTitle("  Senior   AI Engineer  ")
    assert title.title == "Senior AI Engineer"


def test_job_title_rejects_blank() -> None:
    with pytest.raises(ValueError, match=r"JobTitle cannot be blank."):
        JobTitle("   ")


def test_job_title_immutability() -> None:
    title = JobTitle("Engineer")
    with pytest.raises(AttributeError):
        title.title = "New Engineer"  # type: ignore


def test_company_info_normalization() -> None:
    company = CompanyInfo(
        name="  Acme Corp  ",
        industry="  Tech   ",
        location="  New York  ",
    )
    assert company.name == "Acme Corp"
    assert company.industry == "Tech"
    assert company.location == "New York"


def test_company_info_optional_blank_to_none() -> None:
    company = CompanyInfo(name="Acme Corp", industry="   ", location="\t")
    assert company.name == "Acme Corp"
    assert company.industry is None
    assert company.location is None


def test_company_info_invalid_blank_name() -> None:
    with pytest.raises(ValueError, match=r"Company name cannot be blank."):
        CompanyInfo(name="   ")


def test_responsibility_normalization() -> None:
    resp = Responsibility("  Write   code.  ")
    assert resp.description == "Write code."


def test_responsibility_blank_rejection() -> None:
    with pytest.raises(ValueError, match=r"Responsibility cannot be blank."):
        Responsibility("   ")


def test_skill_normalization_and_case() -> None:
    skill1 = Skill(" Python ")
    skill2 = Skill("python")
    skill3 = Skill("PYTHON")
    assert skill1.name == "python"
    assert skill2.name == "python"
    assert skill3.name == "python"
    assert skill1 == skill2 == skill3


def test_skill_blank_rejection() -> None:
    with pytest.raises(ValueError, match=r"Skill cannot be blank."):
        Skill("   ")


def test_experience_requirement_valid() -> None:
    req = ExperienceRequirement(minimum_years=3, maximum_years=5)
    assert req.minimum_years == 3
    assert req.maximum_years == 5

    req2 = ExperienceRequirement(minimum_years=3, maximum_years=None)
    assert req2.minimum_years == 3
    assert req2.maximum_years is None


def test_experience_requirement_negative_rejection() -> None:
    with pytest.raises(ValueError, match=r"Minimum years cannot be negative."):
        ExperienceRequirement(minimum_years=-1)
    with pytest.raises(ValueError, match=r"Maximum years cannot be negative."):
        ExperienceRequirement(minimum_years=1, maximum_years=-1)


def test_experience_requirement_inverted_range_rejection() -> None:
    with pytest.raises(
        ValueError, match=r"Maximum years cannot be less than minimum years."
    ):
        ExperienceRequirement(minimum_years=5, maximum_years=3)


def test_experience_requirement_empty_rejection() -> None:
    with pytest.raises(
        ValueError,
        match=r"ExperienceRequirement must specify at least minimum or maximum years.",
    ):
        ExperienceRequirement()


def test_education_requirement_valid() -> None:
    req = EducationRequirement(
        level=EducationLevel.BACHELOR,
        field_of_study="  Computer Science  ",
        description="  Must be from an accredited university  ",
    )
    assert req.level == EducationLevel.BACHELOR
    assert req.field_of_study == "Computer Science"
    assert req.description == "Must be from an accredited university"


def test_education_requirement_meaningless_rejection() -> None:
    msg = (
        r"EducationRequirement must specify at least one "
        r"meaningful piece of education information\."
    )
    with pytest.raises(ValueError, match=msg):
        EducationRequirement(level=None, field_of_study="   ", description="   ")


def test_job_description_minimal_construction() -> None:
    jd = JobDescription(title=JobTitle("Engineer"))
    assert jd.title.title == "Engineer"
    assert jd.company_info is None
    assert jd.responsibilities == ()
    assert jd.required_skills == ()
    assert jd.preferred_skills == ()
    assert jd.experience_requirement is None
    assert jd.education_requirement is None


def test_job_description_complete_construction() -> None:
    jd = JobDescription(
        title=JobTitle("Senior AI Engineer"),
        company_info=CompanyInfo("Acme Corp"),
        responsibilities=(Responsibility("Write code"),),
        required_skills=(Skill("Python"), Skill("C++")),
        preferred_skills=(Skill("Go"),),
        experience_requirement=ExperienceRequirement(minimum_years=5),
        education_requirement=EducationRequirement(level=EducationLevel.MASTER),
    )
    assert jd.title.title == "Senior AI Engineer"
    assert jd.company_info
    assert jd.company_info.name == "Acme Corp"
    assert len(jd.responsibilities) == 1
    assert jd.responsibilities[0].description == "Write code"
    assert len(jd.required_skills) == 2
    assert jd.required_skills[0].name == "python"
    assert jd.required_skills[1].name == "c++"
    assert len(jd.preferred_skills) == 1
    assert jd.preferred_skills[0].name == "go"
    assert jd.experience_requirement
    assert jd.experience_requirement.minimum_years == 5
    assert jd.education_requirement
    assert jd.education_requirement.level == EducationLevel.MASTER


def test_job_description_duplicate_handling_responsibilities() -> None:
    # De-duplicate responsibilities deterministically while preserving first occurrence
    r1 = Responsibility("Write code")
    r2 = Responsibility("Write tests")
    r3 = Responsibility("Write code")
    jd = JobDescription(
        title=JobTitle("Engineer"),
        responsibilities=(r1, r2, r3),
    )
    assert len(jd.responsibilities) == 2
    assert jd.responsibilities[0].description == "Write code"
    assert jd.responsibilities[1].description == "Write tests"


def test_job_description_duplicate_skills_rejection() -> None:
    with pytest.raises(
        ValueError, match=r"Duplicate skills in required_skills are not allowed."
    ):
        JobDescription(
            title=JobTitle("Engineer"),
            required_skills=(Skill("Python"), Skill("python")),
        )

    with pytest.raises(
        ValueError, match=r"Duplicate skills in preferred_skills are not allowed."
    ):
        JobDescription(
            title=JobTitle("Engineer"),
            preferred_skills=(Skill("Python"), Skill("python")),
        )


def test_job_description_skill_overlap_rejection() -> None:
    with pytest.raises(
        ValueError, match=r"A skill cannot be both required and preferred."
    ):
        JobDescription(
            title=JobTitle("Engineer"),
            required_skills=(Skill("Python"),),
            preferred_skills=(Skill("Python"),),
        )


def test_job_description_immutability() -> None:
    jd = JobDescription(title=JobTitle("Engineer"))
    with pytest.raises(AttributeError):
        jd.title = JobTitle("New Engineer")  # type: ignore


def test_job_description_required_skills_immutability() -> None:
    skill_list = [Skill("Python"), Skill("Java")]
    jd = JobDescription(
        title=JobTitle("Engineer"),
        required_skills=skill_list,  # type: ignore
    )
    # Mutate the original list
    skill_list.append(Skill("C++"))

    # The jd should remain unchanged
    assert len(jd.required_skills) == 2
    assert jd.required_skills[0].name == "python"
    assert jd.required_skills[1].name == "java"
    assert isinstance(jd.required_skills, tuple)


def test_job_description_preferred_skills_immutability() -> None:
    skill_list = [Skill("Go")]
    jd = JobDescription(
        title=JobTitle("Engineer"),
        preferred_skills=skill_list,  # type: ignore
    )
    # Mutate the original list
    skill_list.append(Skill("Rust"))

    # The jd should remain unchanged
    assert len(jd.preferred_skills) == 1
    assert jd.preferred_skills[0].name == "go"
    assert isinstance(jd.preferred_skills, tuple)


def test_public_api_exports() -> None:
    from pathfinder_ai.domain import (
        CompanyInfo,
        EducationLevel,
        EducationRequirement,
        ExperienceRequirement,
        JobDescription,
        JobTitle,
        Responsibility,
        Skill,
    )

    # Just verify they are imported and are the correct types
    assert JobTitle is not None
    assert CompanyInfo is not None
    assert Responsibility is not None
    assert Skill is not None
    assert ExperienceRequirement is not None
    assert EducationLevel is not None
    assert EducationRequirement is not None
    assert JobDescription is not None
