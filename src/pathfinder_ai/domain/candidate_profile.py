"""
Candidate Profile Domain Models.
"""

from dataclasses import dataclass
from enum import StrEnum

from ._normalization import _clean_optional_string, _normalize_whitespace
from .education import EducationLevel
from .job_title import JobTitle
from .skill import Skill


@dataclass(frozen=True, slots=True)
class WorkExperience:
    role_title: JobTitle
    company_name: str | None = None
    duration_months: int | None = None
    description: str | None = None
    skills: tuple[Skill, ...] = ()

    def __post_init__(self) -> None:
        normalized_company = _clean_optional_string(self.company_name)
        normalized_description = _clean_optional_string(self.description)

        object.__setattr__(self, "company_name", normalized_company)
        object.__setattr__(self, "description", normalized_description)

        if self.duration_months is not None and self.duration_months <= 0:
            raise ValueError("duration_months must be greater than zero.")

        # Defensive copy to tuple and deduplicate deterministically preserving order
        unique_skills = []
        seen_skills = set()
        for skill in self.skills:
            if skill not in seen_skills:
                unique_skills.append(skill)
                seen_skills.add(skill)

        if len(unique_skills) != len(self.skills):
            raise ValueError("Duplicate skills in WorkExperience are not allowed.")

        object.__setattr__(self, "skills", tuple(unique_skills))


@dataclass(frozen=True, slots=True)
class EducationRecord:
    level: EducationLevel
    field_of_study: str | None = None
    institution: str | None = None
    description: str | None = None

    def __post_init__(self) -> None:
        normalized_field = _clean_optional_string(self.field_of_study)
        normalized_institution = _clean_optional_string(self.institution)
        normalized_description = _clean_optional_string(self.description)

        object.__setattr__(self, "field_of_study", normalized_field)
        object.__setattr__(self, "institution", normalized_institution)
        object.__setattr__(self, "description", normalized_description)


@dataclass(frozen=True, slots=True)
class Project:
    name: str
    description: str | None = None
    skills: tuple[Skill, ...] = ()

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Project name cannot be blank.")

        object.__setattr__(self, "name", _normalize_whitespace(self.name))
        object.__setattr__(
            self, "description", _clean_optional_string(self.description)
        )

        # Deduplicate skills and check for duplicates
        unique_skills = []
        seen_skills = set()
        for skill in self.skills:
            if skill not in seen_skills:
                unique_skills.append(skill)
                seen_skills.add(skill)

        if len(unique_skills) != len(self.skills):
            raise ValueError("Duplicate skills in Project are not allowed.")

        object.__setattr__(self, "skills", tuple(unique_skills))


@dataclass(frozen=True, slots=True)
class Certification:
    name: str
    issuer: str | None = None
    description: str | None = None

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Certification name cannot be blank.")

        object.__setattr__(self, "name", _normalize_whitespace(self.name))
        object.__setattr__(self, "issuer", _clean_optional_string(self.issuer))
        object.__setattr__(
            self, "description", _clean_optional_string(self.description)
        )


class WorkMode(StrEnum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"


@dataclass(frozen=True, slots=True)
class CandidatePreferences:
    target_titles: tuple[JobTitle, ...] = ()
    preferred_locations: tuple[str, ...] = ()
    acceptable_work_modes: tuple[WorkMode, ...] = ()

    def __post_init__(self) -> None:
        # Deduplicate deterministically preserving order
        def deduplicate(
            items: tuple[JobTitle, ...] | list[str] | tuple[WorkMode, ...],
        ) -> tuple[JobTitle, ...] | tuple[str, ...] | tuple[WorkMode, ...]:
            unique = []
            seen = set()
            for item in items:
                if item not in seen:
                    unique.append(item)
                    seen.add(item)
            return tuple(unique)  # type: ignore

        unique_titles = deduplicate(self.target_titles)
        if len(unique_titles) != len(self.target_titles):
            raise ValueError("Duplicate target titles are not allowed.")
        object.__setattr__(self, "target_titles", unique_titles)

        normalized_locations = []
        for loc in self.preferred_locations:
            clean = _clean_optional_string(loc)
            if clean:
                normalized_locations.append(clean)

        unique_locations = deduplicate(normalized_locations)
        if len(unique_locations) != len(self.preferred_locations):
            raise ValueError("Duplicate or blank locations are not allowed.")
        object.__setattr__(self, "preferred_locations", unique_locations)

        unique_modes = deduplicate(self.acceptable_work_modes)
        if len(unique_modes) != len(self.acceptable_work_modes):
            raise ValueError("Duplicate work modes are not allowed.")
        object.__setattr__(self, "acceptable_work_modes", unique_modes)


@dataclass(frozen=True, slots=True)
class CandidateProfile:
    skills: tuple[Skill, ...] = ()
    experience: tuple[WorkExperience, ...] = ()
    education: tuple[EducationRecord, ...] = ()
    projects: tuple[Project, ...] = ()
    certifications: tuple[Certification, ...] = ()
    preferences: CandidatePreferences | None = None

    def __post_init__(self) -> None:
        # Check for empty evidence
        if (
            not self.skills
            and not self.experience
            and not self.education
            and not self.projects
            and not self.certifications
        ):
            msg = (
                "CandidateProfile must contain at least one piece of evidence "
                "(skills, experience, education, projects, or certifications)."
            )
            raise ValueError(msg)

        # Process and enforce duplicate rules on top-level skills
        unique_skills = []
        seen_skills = set()
        for skill in self.skills:
            if skill not in seen_skills:
                unique_skills.append(skill)
                seen_skills.add(skill)

        if len(unique_skills) != len(self.skills):
            raise ValueError(
                "Duplicate canonical skills in CandidateProfile are not allowed."
            )

        # Ensure all collections are immutable tuples
        object.__setattr__(self, "skills", tuple(unique_skills))
        object.__setattr__(self, "experience", tuple(self.experience))
        object.__setattr__(self, "education", tuple(self.education))
        object.__setattr__(self, "projects", tuple(self.projects))
        object.__setattr__(self, "certifications", tuple(self.certifications))
