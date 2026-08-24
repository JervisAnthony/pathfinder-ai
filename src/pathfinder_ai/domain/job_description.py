"""
Job Description Domain Model.
"""

import re
from dataclasses import dataclass
from enum import StrEnum


def _normalize_whitespace(text: str) -> str:
    """Strip leading/trailing whitespace and collapse internal whitespace."""
    return re.sub(r"\s+", " ", text).strip()


def _clean_optional_string(text: str | None) -> str | None:
    if text is None:
        return None
    normalized = _normalize_whitespace(text)
    return normalized if normalized else None


@dataclass(frozen=True, slots=True)
class JobTitle:
    title: str

    def __post_init__(self) -> None:
        if not self.title or not self.title.strip():
            raise ValueError("JobTitle cannot be blank.")
        normalized = _normalize_whitespace(self.title)
        # Bypass frozen dataclass to set the normalized value
        object.__setattr__(self, "title", normalized)


@dataclass(frozen=True, slots=True)
class CompanyInfo:
    name: str
    industry: str | None = None
    location: str | None = None

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Company name cannot be blank.")
        object.__setattr__(self, "name", _normalize_whitespace(self.name))

        normalized_industry = _clean_optional_string(self.industry)
        normalized_location = _clean_optional_string(self.location)

        object.__setattr__(self, "industry", normalized_industry)
        object.__setattr__(self, "location", normalized_location)


@dataclass(frozen=True, slots=True)
class Responsibility:
    description: str

    def __post_init__(self) -> None:
        if not self.description or not self.description.strip():
            raise ValueError("Responsibility cannot be blank.")
        object.__setattr__(self, "description", _normalize_whitespace(self.description))


@dataclass(frozen=True, slots=True)
class Skill:
    name: str

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ValueError("Skill cannot be blank.")
        object.__setattr__(self, "name", _normalize_whitespace(self.name).lower())


@dataclass(frozen=True, slots=True)
class ExperienceRequirement:
    minimum_years: int | None = None
    maximum_years: int | None = None

    def __post_init__(self) -> None:
        if self.minimum_years is None and self.maximum_years is None:
            raise ValueError(
                "ExperienceRequirement must specify at least minimum or maximum years."
            )

        if self.minimum_years is not None and self.minimum_years < 0:
            raise ValueError("Minimum years cannot be negative.")

        if self.maximum_years is not None and self.maximum_years < 0:
            raise ValueError("Maximum years cannot be negative.")

        if self.minimum_years is not None and self.maximum_years is not None:
            if self.maximum_years < self.minimum_years:
                raise ValueError("Maximum years cannot be less than minimum years.")


class EducationLevel(StrEnum):
    HIGH_SCHOOL = "high_school"
    ASSOCIATE = "associate"
    BACHELOR = "bachelor"
    MASTER = "master"
    DOCTORATE = "doctorate"
    OTHER = "other"


@dataclass(frozen=True, slots=True)
class EducationRequirement:
    level: EducationLevel | None = None
    field_of_study: str | None = None
    description: str | None = None

    def __post_init__(self) -> None:
        normalized_field = _clean_optional_string(self.field_of_study)
        normalized_description = _clean_optional_string(self.description)

        object.__setattr__(self, "field_of_study", normalized_field)
        object.__setattr__(self, "description", normalized_description)

        if (
            self.level is None
            and self.field_of_study is None
            and self.description is None
        ):
            msg = (
                "EducationRequirement must specify at least one meaningful "
                "piece of education information."
            )
            raise ValueError(msg)


@dataclass(frozen=True, slots=True)
class JobDescription:
    title: JobTitle
    responsibilities: tuple[Responsibility, ...] = ()
    required_skills: tuple[Skill, ...] = ()
    preferred_skills: tuple[Skill, ...] = ()
    company_info: CompanyInfo | None = None
    experience_requirement: ExperienceRequirement | None = None
    education_requirement: EducationRequirement | None = None

    def __post_init__(self) -> None:
        # Normalize to immutable tuples
        required_tuple = tuple(self.required_skills)
        preferred_tuple = tuple(self.preferred_skills)

        object.__setattr__(self, "required_skills", required_tuple)
        object.__setattr__(self, "preferred_skills", preferred_tuple)

        # Check duplicate required skills
        req_skills_set = set(required_tuple)
        if len(req_skills_set) != len(required_tuple):
            raise ValueError("Duplicate skills in required_skills are not allowed.")

        # Check duplicate preferred skills
        pref_skills_set = set(preferred_tuple)
        if len(pref_skills_set) != len(preferred_tuple):
            raise ValueError("Duplicate skills in preferred_skills are not allowed.")

        # Check overlap
        overlap = req_skills_set.intersection(pref_skills_set)
        if overlap:
            raise ValueError("A skill cannot be both required and preferred.")

        # De-duplicate responsibilities deterministically preserving order
        unique_resps = []
        seen_resps = set()
        for resp in self.responsibilities:
            if resp not in seen_resps:
                unique_resps.append(resp)
                seen_resps.add(resp)
        object.__setattr__(self, "responsibilities", tuple(unique_resps))
