"""Provider-neutral, reviewable drafts; never analysis domain objects."""

from dataclasses import dataclass, fields
from typing import Protocol

from pathfinder_ai.domain.education import EducationLevel

MAX_JOB_DESCRIPTION_TEXT_LENGTH = 50_000
MAX_DRAFT_RESPONSIBILITIES = 30
MAX_DRAFT_SKILLS_PER_CATEGORY = 50


def validate_job_description_text(value: str) -> str:
    """Reject oversized input before trimming; never silently truncate."""
    if len(value) > MAX_JOB_DESCRIPTION_TEXT_LENGTH or not value.strip():
        raise ValueError("Job posting must contain 1 to 50,000 characters of text.")
    return value.strip()


def _clean(value: str | None) -> str | None:
    return " ".join(value.split()) or None if value is not None else None


def _unique(values: tuple[str, ...], limit: int, seen: set[str]) -> tuple[str, ...]:
    if len(values) > limit:
        raise ValueError("Draft collection exceeds its entry limit.")
    result = []
    for value in values:
        cleaned = _clean(value)
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            result.append(cleaned)
    return tuple(result)


@dataclass(frozen=True, slots=True)
class JobDescriptionDraft:
    """Unreviewed input convenience with bounded, normalized values."""

    title: str | None = None
    company_name: str | None = None
    company_industry: str | None = None
    company_location: str | None = None
    responsibilities: tuple[str, ...] = ()
    required_skills: tuple[str, ...] = ()
    preferred_skills: tuple[str, ...] = ()
    unclassified_skills: tuple[str, ...] = ()
    minimum_years: int | None = None
    maximum_years: int | None = None
    education_level: EducationLevel | None = None
    education_field_of_study: str | None = None
    education_description: str | None = None

    def __post_init__(self) -> None:
        for name in (
            "title",
            "company_name",
            "company_industry",
            "company_location",
            "education_field_of_study",
            "education_description",
        ):
            object.__setattr__(self, name, _clean(getattr(self, name)))
        object.__setattr__(
            self,
            "responsibilities",
            _unique(self.responsibilities, MAX_DRAFT_RESPONSIBILITIES, set()),
        )
        seen: set[str] = set()
        for name in ("required_skills", "preferred_skills", "unclassified_skills"):
            object.__setattr__(
                self,
                name,
                _unique(getattr(self, name), MAX_DRAFT_SKILLS_PER_CATEGORY, seen),
            )
        for value in (self.minimum_years, self.maximum_years):
            if value is not None and (type(value) is not int or value < 0):
                raise ValueError("Experience must be a nonnegative integer.")
        if (
            self.minimum_years is not None
            and self.maximum_years is not None
            and self.maximum_years < self.minimum_years
        ):
            raise ValueError("Maximum years cannot be less than minimum years.")
        if self.education_level is not None and not isinstance(
            self.education_level, EducationLevel
        ):
            raise ValueError("Education level must use EducationLevel.")
        if not any(
            getattr(self, field.name) is not None and getattr(self, field.name) != ()
            for field in fields(self)
        ):
            raise ValueError("Draft contains no usable information.")


class JobDescriptionImportError(Exception):
    """A provider could not produce a valid structured draft."""


class JobDescriptionImportProvider(Protocol):
    def draft(self, raw_job_description: str) -> JobDescriptionDraft:
        """Extract a draft from supplied text only."""
        ...


class JobDescriptionImportService:
    def __init__(self, provider: JobDescriptionImportProvider | None = None) -> None:
        self._provider = provider

    def draft(self, raw_job_description: str) -> JobDescriptionDraft | None:
        text = validate_job_description_text(raw_job_description)
        if self._provider is None:
            return None
        try:
            result = self._provider.draft(text)
            if not isinstance(result, JobDescriptionDraft):
                raise ValueError("Invalid draft result.")
            return result
        except Exception:
            raise JobDescriptionImportError("Job description import failed.") from None
