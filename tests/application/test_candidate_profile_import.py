"""Candidate Profile drafts are normalized before entering any domain model."""

from dataclasses import FrozenInstanceError
from unittest.mock import Mock

import pytest

from pathfinder_ai.application.candidate_profile_import import (
    CandidateCertificationDraft,
    CandidateEducationDraft,
    CandidateExperienceDraft,
    CandidateProfileDraft,
    CandidateProfileImportError,
    CandidateProfileImportService,
    CandidateProjectDraft,
)
from pathfinder_ai.domain.education import EducationLevel


def full_draft() -> CandidateProfileDraft:
    experience = CandidateExperienceDraft(
        " Senior  Engineer ",
        " Example\nSystems ",
        60,
        " Built  APIs ",
        (" Python ", "python", "FastAPI"),
    )
    education = CandidateEducationDraft(
        EducationLevel.BACHELOR, " Computer  Science ", " Example University "
    )
    project = CandidateProjectDraft(
        " Pathfinder ", " Job analysis ", ("Python", " PYTHON ")
    )
    certification = CandidateCertificationDraft(
        " Cloud Credential ", " Example Issuer ", " Verified credential "
    )
    return CandidateProfileDraft(
        (" Python ", "python", "FastAPI", ""),
        (experience, experience),
        (education, education),
        (project, project),
        (certification, certification),
    )


def test_immutable_normalized_and_conservatively_deduplicated() -> None:
    draft = full_draft()
    assert draft.skills == ("Python", "FastAPI")
    assert len(draft.experience) == len(draft.education) == 1
    assert len(draft.projects) == len(draft.certifications) == 1
    assert draft.experience[0] == CandidateExperienceDraft(
        "Senior Engineer", "Example Systems", 60, "Built APIs", ("Python", "FastAPI")
    )
    with pytest.raises(FrozenInstanceError):
        draft.skills = ()


def test_same_role_and_company_distinct_full_records_remain() -> None:
    first = CandidateExperienceDraft("Engineer", "Example", 12, "First role")
    second = CandidateExperienceDraft("Engineer", "Example", 24, "Second role")
    assert CandidateProfileDraft(experience=(first, second)).experience == (
        first,
        second,
    )


@pytest.mark.parametrize(
    "factory,args",
    [
        (CandidateExperienceDraft, ("",)),
        (CandidateExperienceDraft, ("Engineer", None, 0)),
        (CandidateExperienceDraft, ("Engineer", None, -1)),
        (CandidateExperienceDraft, ("Engineer", None, True)),
        (CandidateProjectDraft, ("",)),
        (CandidateCertificationDraft, ("",)),
        (CandidateEducationDraft, ()),
        (CandidateEducationDraft, ("bachelor",)),
    ],
)
def test_invalid_nested_drafts(factory, args) -> None:
    with pytest.raises(ValueError):
        factory(*args)


@pytest.mark.parametrize(
    "kwargs",
    [
        {},
        {"skills": ("x",) * 101},
        {"experience": (CandidateExperienceDraft("x"),) * 21},
        {"education": (CandidateEducationDraft(description="x"),) * 11},
        {"projects": (CandidateProjectDraft("x"),) * 21},
        {"certifications": (CandidateCertificationDraft("x"),) * 21},
    ],
)
def test_empty_and_oversized_top_level_drafts_rejected(kwargs) -> None:
    with pytest.raises(ValueError):
        CandidateProfileDraft(**kwargs)


@pytest.mark.parametrize(
    "factory",
    [
        lambda: CandidateExperienceDraft("Role", skills=("x",) * 31),
        lambda: CandidateProjectDraft("Project", skills=("x",) * 31),
    ],
)
def test_entry_skill_limit(factory) -> None:
    with pytest.raises(ValueError):
        factory()


def test_partial_unknown_education_and_exact_limits_are_valid() -> None:
    draft = CandidateProfileDraft(
        skills=tuple(str(index) for index in range(100)),
        education=(CandidateEducationDraft(description="Unmapped qualification"),),
    )
    assert draft.education[0].level is None
    assert len(draft.skills) == 100


@pytest.mark.parametrize(
    "raw",
    ["", " \n ", "x" * 200_001, " " + "x" * 200_000],
    ids=["empty", "blank", "oversized", "checked-before-trim"],
)
def test_input_boundary_precedes_provider(raw: str) -> None:
    provider = Mock()
    with pytest.raises(ValueError):
        CandidateProfileImportService(provider).draft(raw)
    provider.draft.assert_not_called()


def test_optional_provider_and_trimmed_input() -> None:
    assert CandidateProfileImportService().draft("Résumé") is None
    provider = Mock()
    provider.draft.return_value = full_draft()
    assert CandidateProfileImportService(provider).draft("  Résumé \n") == full_draft()
    provider.draft.assert_called_once_with("Résumé")
    assert CandidateProfileImportService(provider).draft("x" * 200_000) is not None


@pytest.mark.parametrize("invalid_result", [None, "draft"])
def test_safe_typed_provider_failures(invalid_result) -> None:
    provider = Mock()
    provider.draft.return_value = invalid_result
    with pytest.raises(CandidateProfileImportError) as caught:
        CandidateProfileImportService(provider).draft("PRIVATE RÉSUMÉ")
    assert "PRIVATE" not in str(caught.value)


def test_provider_exception_is_safely_replaced() -> None:
    provider = Mock()
    provider.draft.side_effect = RuntimeError("PRIVATE PROVIDER DETAILS")
    with pytest.raises(CandidateProfileImportError) as caught:
        CandidateProfileImportService(provider).draft("PRIVATE RÉSUMÉ")
    assert "PRIVATE" not in str(caught.value)
