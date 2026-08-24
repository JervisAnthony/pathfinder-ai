"""Tests for the Candidate Profile domain model."""

import pytest

from pathfinder_ai.domain import (
    CandidatePreferences,
    CandidateProfile,
    Certification,
    EducationLevel,
    EducationRecord,
    JobTitle,
    Project,
    Skill,
    WorkExperience,
    WorkMode,
)


# Work Experience Tests
def test_work_experience_valid_construction() -> None:
    exp = WorkExperience(
        role_title=JobTitle("Software Engineer"),
        company_name="Acme Corp",
        duration_months=24,
        description="Wrote some code",
        skills=(Skill("Python"), Skill("Django")),
    )
    assert exp.role_title.title == "Software Engineer"
    assert exp.company_name == "Acme Corp"
    assert exp.duration_months == 24
    assert exp.description == "Wrote some code"
    assert len(exp.skills) == 2
    assert exp.skills[0].name == "python"
    assert exp.skills[1].name == "django"


def test_work_experience_normalization_and_blank_to_none() -> None:
    exp = WorkExperience(
        role_title=JobTitle("Engineer"),
        company_name="   ",
        duration_months=None,
        description=" \t ",
        skills=(),
    )
    assert exp.company_name is None
    assert exp.duration_months is None
    assert exp.description is None


def test_work_experience_duration_validation() -> None:
    with pytest.raises(ValueError, match=r"duration_months must be greater than zero."):
        WorkExperience(role_title=JobTitle("Engineer"), duration_months=0)
    with pytest.raises(ValueError, match=r"duration_months must be greater than zero."):
        WorkExperience(role_title=JobTitle("Engineer"), duration_months=-5)


def test_work_experience_duplicate_skill_rejection() -> None:
    with pytest.raises(
        ValueError, match=r"Duplicate skills in WorkExperience are not allowed."
    ):
        WorkExperience(
            role_title=JobTitle("Engineer"),
            skills=(Skill("Python"), Skill("PYTHON")),
        )


def test_work_experience_immutability() -> None:
    exp = WorkExperience(role_title=JobTitle("Engineer"))
    with pytest.raises(AttributeError):
        exp.company_name = "New Corp"  # type: ignore

    skill_list = [Skill("Python")]
    exp2 = WorkExperience(role_title=JobTitle("Engineer"), skills=skill_list)  # type: ignore
    skill_list.append(Skill("Java"))
    assert len(exp2.skills) == 1
    assert exp2.skills[0].name == "python"
    assert isinstance(exp2.skills, tuple)


# Education Record Tests
def test_education_record_valid_construction() -> None:
    edu = EducationRecord(
        level=EducationLevel.BACHELOR,
        field_of_study="Computer Science",
        institution="State University",
        description="Graduated with honors",
    )
    assert edu.level == EducationLevel.BACHELOR
    assert edu.field_of_study == "Computer Science"
    assert edu.institution == "State University"
    assert edu.description == "Graduated with honors"


def test_education_record_normalization() -> None:
    edu = EducationRecord(
        level=EducationLevel.MASTER,
        field_of_study="  ",
        institution="   \t",
        description="   ",
    )
    assert edu.field_of_study is None
    assert edu.institution is None
    assert edu.description is None


def test_education_record_immutability() -> None:
    edu = EducationRecord(level=EducationLevel.BACHELOR)
    with pytest.raises(AttributeError):
        edu.institution = "MIT"  # type: ignore


# Project Tests
def test_project_valid_construction() -> None:
    proj = Project(
        name="Personal Website",
        description="Built a cool site",
        skills=(Skill("HTML"), Skill("CSS")),
    )
    assert proj.name == "Personal Website"
    assert proj.description == "Built a cool site"
    assert len(proj.skills) == 2


def test_project_name_normalization() -> None:
    proj = Project(name="  Awesome   App  ", description="   ")
    assert proj.name == "Awesome App"
    assert proj.description is None


def test_project_blank_name_rejection() -> None:
    with pytest.raises(ValueError, match=r"Project name cannot be blank."):
        Project(name="   ")


def test_project_duplicate_skill_rejection() -> None:
    with pytest.raises(
        ValueError, match=r"Duplicate skills in Project are not allowed."
    ):
        Project(name="App", skills=(Skill("Go"), Skill("GO")))


def test_project_immutability() -> None:
    proj = Project(name="App")
    with pytest.raises(AttributeError):
        proj.name = "New App"  # type: ignore

    skill_list = [Skill("C")]
    proj2 = Project(name="App2", skills=skill_list)  # type: ignore
    skill_list.append(Skill("C++"))
    assert len(proj2.skills) == 1
    assert isinstance(proj2.skills, tuple)


# Certification Tests
def test_certification_valid_construction() -> None:
    cert = Certification(
        name="AWS Certified Solutions Architect",
        issuer="Amazon",
        description="Cloud stuff",
    )
    assert cert.name == "AWS Certified Solutions Architect"
    assert cert.issuer == "Amazon"
    assert cert.description == "Cloud stuff"


def test_certification_normalization() -> None:
    cert = Certification(name="  Cert  ", issuer="  ", description="\t")
    assert cert.name == "Cert"
    assert cert.issuer is None
    assert cert.description is None


def test_certification_blank_name_rejection() -> None:
    with pytest.raises(ValueError, match=r"Certification name cannot be blank."):
        Certification(name="   ")


def test_certification_immutability() -> None:
    cert = Certification(name="Cert")
    with pytest.raises(AttributeError):
        cert.issuer = "Issuer"  # type: ignore


# Candidate Preferences Tests
def test_candidate_preferences_valid_construction() -> None:
    prefs = CandidatePreferences(
        target_titles=(JobTitle("Engineer"), JobTitle("Manager")),
        preferred_locations=("New York", "Remote"),
        acceptable_work_modes=(WorkMode.REMOTE, WorkMode.HYBRID),
    )
    assert len(prefs.target_titles) == 2
    assert len(prefs.preferred_locations) == 2
    assert len(prefs.acceptable_work_modes) == 2


def test_candidate_preferences_empty() -> None:
    prefs = CandidatePreferences()
    assert prefs.target_titles == ()
    assert prefs.preferred_locations == ()
    assert prefs.acceptable_work_modes == ()


def test_candidate_preferences_duplicate_handling() -> None:
    with pytest.raises(ValueError, match=r"Duplicate target titles are not allowed."):
        CandidatePreferences(target_titles=(JobTitle("Dev"), JobTitle("Dev")))

    with pytest.raises(
        ValueError, match=r"Duplicate or blank locations are not allowed."
    ):
        CandidatePreferences(preferred_locations=("NYC", "NYC"))

    with pytest.raises(ValueError, match=r"Duplicate work modes are not allowed."):
        CandidatePreferences(acceptable_work_modes=(WorkMode.REMOTE, WorkMode.REMOTE))


def test_candidate_preferences_location_normalization() -> None:
    prefs = CandidatePreferences(preferred_locations=("  New York  ",))
    assert prefs.preferred_locations[0] == "New York"

    with pytest.raises(
        ValueError, match=r"Duplicate or blank locations are not allowed."
    ):
        CandidatePreferences(preferred_locations=("  ",))


def test_candidate_preferences_immutability() -> None:
    locations = ["NYC"]
    prefs = CandidatePreferences(preferred_locations=locations)  # type: ignore
    locations.append("LA")
    assert len(prefs.preferred_locations) == 1
    assert isinstance(prefs.preferred_locations, tuple)


# Candidate Profile Tests
def test_candidate_profile_minimal_valid() -> None:
    # A profile must have at least one piece of evidence
    profile = CandidateProfile(skills=(Skill("Python"),))
    assert len(profile.skills) == 1
    assert profile.experience == ()
    assert profile.education == ()
    assert profile.projects == ()
    assert profile.certifications == ()
    assert profile.preferences is None


def test_candidate_profile_complete_valid() -> None:
    profile = CandidateProfile(
        skills=(Skill("Python"),),
        experience=(WorkExperience(role_title=JobTitle("Dev")),),
        education=(EducationRecord(level=EducationLevel.BACHELOR),),
        projects=(Project(name="App"),),
        certifications=(Certification(name="Cert"),),
        preferences=CandidatePreferences(),
    )
    assert len(profile.skills) == 1
    assert len(profile.experience) == 1
    assert len(profile.education) == 1
    assert len(profile.projects) == 1
    assert len(profile.certifications) == 1
    assert profile.preferences is not None


def test_candidate_profile_empty_rejection() -> None:
    with pytest.raises(
        ValueError,
        match=r"CandidateProfile must contain at least one piece of evidence",
    ):
        CandidateProfile()

    with pytest.raises(
        ValueError,
        match=r"CandidateProfile must contain at least one piece of evidence",
    ):
        CandidateProfile(preferences=CandidatePreferences())


def test_candidate_profile_duplicate_skill_rejection() -> None:
    with pytest.raises(
        ValueError,
        match=r"Duplicate canonical skills in CandidateProfile are not allowed.",
    ):
        CandidateProfile(skills=(Skill("Java"), Skill("JAVA")))


def test_candidate_profile_immutability() -> None:
    skill_list = [Skill("Ruby")]
    profile = CandidateProfile(skills=skill_list)  # type: ignore
    skill_list.append(Skill("Rails"))
    assert len(profile.skills) == 1
    assert isinstance(profile.skills, tuple)

    with pytest.raises(AttributeError):
        profile.experience = ()  # type: ignore


def test_public_api_exports_all_types() -> None:
    from pathfinder_ai.domain import (
        CandidatePreferences,
        CandidateProfile,
        Certification,
        CompanyInfo,
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
        WorkMode,
    )

    # Just verify they are successfully imported
    assert CandidatePreferences is not None
    assert CandidateProfile is not None
    assert Certification is not None
    assert CompanyInfo is not None
    assert EducationLevel is not None
    assert EducationRecord is not None
    assert EducationRequirement is not None
    assert ExperienceRequirement is not None
    assert JobDescription is not None
    assert JobTitle is not None
    assert Project is not None
    assert Responsibility is not None
    assert Skill is not None
    assert WorkExperience is not None
    assert WorkMode is not None
