"""Provider-neutral, reviewable Candidate Profile drafts."""

from dataclasses import dataclass
from typing import Protocol

from pathfinder_ai.application.resume_skill_import import MAX_RESUME_TEXT_LENGTH
from pathfinder_ai.domain.education import EducationLevel

MAX_CANDIDATE_DRAFT_SKILLS = 100
MAX_CANDIDATE_DRAFT_EXPERIENCE = 20
MAX_CANDIDATE_DRAFT_EDUCATION = 10
MAX_CANDIDATE_DRAFT_PROJECTS = 20
MAX_CANDIDATE_DRAFT_CERTIFICATIONS = 20
MAX_CANDIDATE_DRAFT_ENTRY_SKILLS = 30


def validate_resume_text(value: str) -> str:
    """Validate before trimming so oversized input is never silently accepted."""
    if len(value) > MAX_RESUME_TEXT_LENGTH or not value.strip():
        raise ValueError("Resume text must contain 1 to 200,000 characters.")
    return value.strip()


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(value.split()) or None


def _required(value: str, label: str) -> str:
    cleaned = _clean(value)
    if cleaned is None:
        raise ValueError(f"{label} cannot be blank.")
    return cleaned


def _skills(values: tuple[str, ...], limit: int) -> tuple[str, ...]:
    if len(values) > limit:
        raise ValueError("Draft skill collection exceeds its limit.")
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = _clean(value)
        if cleaned is not None and cleaned.casefold() not in seen:
            seen.add(cleaned.casefold())
            result.append(cleaned)
    return tuple(result)


def _records[T](values: tuple[T, ...], limit: int) -> tuple[T, ...]:
    if len(values) > limit:
        raise ValueError("Draft record collection exceeds its limit.")
    return tuple(dict.fromkeys(values))


@dataclass(frozen=True, slots=True)
class CandidateExperienceDraft:
    role_title: str
    company_name: str | None = None
    duration_months: int | None = None
    description: str | None = None
    skills: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "role_title", _required(self.role_title, "Role title"))
        object.__setattr__(self, "company_name", _clean(self.company_name))
        object.__setattr__(self, "description", _clean(self.description))
        object.__setattr__(
            self,
            "skills",
            _skills(self.skills, MAX_CANDIDATE_DRAFT_ENTRY_SKILLS),
        )
        if self.duration_months is not None and (
            type(self.duration_months) is not int or self.duration_months <= 0
        ):
            raise ValueError("Duration must be a positive integer.")


@dataclass(frozen=True, slots=True)
class CandidateEducationDraft:
    level: EducationLevel | None = None
    field_of_study: str | None = None
    institution: str | None = None
    description: str | None = None

    def __post_init__(self) -> None:
        if self.level is not None and not isinstance(self.level, EducationLevel):
            raise ValueError("Education level must use EducationLevel.")
        for name in ("field_of_study", "institution", "description"):
            object.__setattr__(self, name, _clean(getattr(self, name)))
        if all(
            value is None
            for value in (
                self.level,
                self.field_of_study,
                self.institution,
                self.description,
            )
        ):
            raise ValueError("Education draft requires usable information.")


@dataclass(frozen=True, slots=True)
class CandidateProjectDraft:
    name: str
    description: str | None = None
    skills: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", _required(self.name, "Project name"))
        object.__setattr__(self, "description", _clean(self.description))
        object.__setattr__(
            self,
            "skills",
            _skills(self.skills, MAX_CANDIDATE_DRAFT_ENTRY_SKILLS),
        )


@dataclass(frozen=True, slots=True)
class CandidateCertificationDraft:
    name: str
    issuer: str | None = None
    description: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", _required(self.name, "Certification name"))
        object.__setattr__(self, "issuer", _clean(self.issuer))
        object.__setattr__(self, "description", _clean(self.description))


@dataclass(frozen=True, slots=True)
class CandidateProfileDraft:
    """Untrusted draft evidence awaiting explicit human review and application."""

    skills: tuple[str, ...] = ()
    experience: tuple[CandidateExperienceDraft, ...] = ()
    education: tuple[CandidateEducationDraft, ...] = ()
    projects: tuple[CandidateProjectDraft, ...] = ()
    certifications: tuple[CandidateCertificationDraft, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "skills", _skills(self.skills, MAX_CANDIDATE_DRAFT_SKILLS)
        )
        for name, limit in (
            ("experience", MAX_CANDIDATE_DRAFT_EXPERIENCE),
            ("education", MAX_CANDIDATE_DRAFT_EDUCATION),
            ("projects", MAX_CANDIDATE_DRAFT_PROJECTS),
            ("certifications", MAX_CANDIDATE_DRAFT_CERTIFICATIONS),
        ):
            object.__setattr__(self, name, _records(getattr(self, name), limit))
        if not any(
            (
                self.skills,
                self.experience,
                self.education,
                self.projects,
                self.certifications,
            )
        ):
            raise ValueError("Candidate profile draft contains no usable evidence.")


class CandidateProfileImportError(Exception):
    """A provider could not produce a valid Candidate Profile draft."""


class CandidateProfileImportProvider(Protocol):
    def draft(self, raw_resume_text: str) -> CandidateProfileDraft:
        """Extract a draft from the supplied résumé text only."""
        ...


class CandidateProfileImportService:
    def __init__(self, provider: CandidateProfileImportProvider | None = None) -> None:
        self._provider = provider

    def draft(self, raw_resume_text: str) -> CandidateProfileDraft | None:
        text = validate_resume_text(raw_resume_text)
        if self._provider is None:
            return None
        try:
            result = self._provider.draft(text)
            if not isinstance(result, CandidateProfileDraft):
                raise ValueError("Invalid Candidate Profile draft result.")
            return result
        except Exception:
            raise CandidateProfileImportError(
                "Candidate Profile import failed."
            ) from None
