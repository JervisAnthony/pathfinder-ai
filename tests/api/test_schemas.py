"""
Tests for API Schema mapping functions.
"""

from pathfinder_ai.api.schemas import (
    CandidatePreferencesSchema,
    CandidateProfileSchema,
    CertificationSchema,
    CompanyInfoSchema,
    EducationRecordSchema,
    EducationRequirementSchema,
    ExperienceRequirementSchema,
    JobDescriptionSchema,
    JobTitleSchema,
    ProjectSchema,
    ResponsibilitySchema,
    SkillSchema,
    WorkExperienceSchema,
    map_candidate_profile,
    map_job_description,
)
from pathfinder_ai.domain.candidate_profile import WorkMode
from pathfinder_ai.domain.education import EducationLevel


def test_map_candidate_profile_success() -> None:
    schema = CandidateProfileSchema(
        skills=[SkillSchema(name="python"), SkillSchema(name="fastapi")],
        experience=[
            WorkExperienceSchema(
                role_title=JobTitleSchema(title="Software Engineer"),
                company_name="Acme Corp",
                duration_months=24,
                description="Built APIs.",
                skills=[SkillSchema(name="python")],
            )
        ],
        education=[
            EducationRecordSchema(
                level=EducationLevel.BACHELOR,
                field_of_study="Computer Science",
                institution="State University",
                description="Graduated with honors.",
            )
        ],
        projects=[
            ProjectSchema(
                name="Open Source API",
                description="A test project",
                skills=[SkillSchema(name="fastapi")],
            )
        ],
        certifications=[
            CertificationSchema(
                name="AWS Certified Developer",
                issuer="AWS",
                description="Cloud cert.",
            )
        ],
        preferences=CandidatePreferencesSchema(
            target_titles=[JobTitleSchema(title="Senior Engineer")],
            preferred_locations=["Remote"],
            acceptable_work_modes=[WorkMode.REMOTE],
        ),
    )

    domain = map_candidate_profile(schema)

    assert len(domain.skills) == 2
    assert domain.skills[0].name == "python"
    assert domain.skills[1].name == "fastapi"

    assert len(domain.experience) == 1
    assert domain.experience[0].role_title.title == "Software Engineer"
    assert domain.experience[0].company_name == "Acme Corp"
    assert domain.experience[0].duration_months == 24
    assert domain.experience[0].description == "Built APIs."
    assert domain.experience[0].skills[0].name == "python"

    assert len(domain.education) == 1
    assert domain.education[0].level == EducationLevel.BACHELOR
    assert domain.education[0].field_of_study == "Computer Science"

    assert len(domain.projects) == 1
    assert domain.projects[0].name == "Open Source API"

    assert len(domain.certifications) == 1
    assert domain.certifications[0].name == "AWS Certified Developer"

    assert domain.preferences is not None
    assert domain.preferences.target_titles[0].title == "Senior Engineer"
    assert domain.preferences.acceptable_work_modes[0] == WorkMode.REMOTE


def test_map_job_description_success() -> None:
    schema = JobDescriptionSchema(
        title=JobTitleSchema(title="Backend Engineer"),
        responsibilities=[ResponsibilitySchema(description="Develop APIs.")],
        required_skills=[SkillSchema(name="python")],
        preferred_skills=[SkillSchema(name="fastapi")],
        company_info=CompanyInfoSchema(
            name="Tech Inc", industry="Software", location="New York"
        ),
        experience_requirement=ExperienceRequirementSchema(
            minimum_years=3, maximum_years=5
        ),
        education_requirement=EducationRequirementSchema(
            level=EducationLevel.BACHELOR, field_of_study="Computer Science"
        ),
    )

    domain = map_job_description(schema)

    assert domain.title.title == "Backend Engineer"
    assert len(domain.responsibilities) == 1
    assert domain.responsibilities[0].description == "Develop APIs."

    assert len(domain.required_skills) == 1
    assert domain.required_skills[0].name == "python"

    assert len(domain.preferred_skills) == 1
    assert domain.preferred_skills[0].name == "fastapi"

    assert domain.company_info is not None
    assert domain.company_info.name == "Tech Inc"

    assert domain.experience_requirement is not None
    assert domain.experience_requirement.minimum_years == 3
    assert domain.experience_requirement.maximum_years == 5

    assert domain.education_requirement is not None
    assert domain.education_requirement.level == EducationLevel.BACHELOR
    assert domain.education_requirement.field_of_study == "Computer Science"
