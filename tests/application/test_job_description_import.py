"""Draft boundaries are deterministic and independent from SDKs."""

from dataclasses import FrozenInstanceError, asdict
from unittest.mock import Mock

import pytest

from pathfinder_ai.application.job_description_import import (
    JobDescriptionDraft,
    JobDescriptionImportError,
    JobDescriptionImportService,
)
from pathfinder_ai.domain.education import EducationLevel


def test_immutable_normalization_precedence_and_order():
    draft = JobDescriptionDraft(
        title="  Backend\n Engineer ",
        company_name=" ",
        responsibilities=(" Build  APIs ", "build APIs", "", "Own services"),
        required_skills=(" Python ", "python", "FastAPI"),
        preferred_skills=("PYTHON", " Docker "),
        unclassified_skills=("docker", " Kubernetes ", "kubernetes"),
        minimum_years=0,
        maximum_years=7,
        education_level=EducationLevel.BACHELOR,
    )
    assert draft.title == "Backend Engineer"
    assert draft.company_name is None
    assert draft.responsibilities == ("Build APIs", "Own services")
    assert draft.required_skills == ("Python", "FastAPI")
    assert draft.preferred_skills == ("Docker",)
    assert draft.unclassified_skills == ("Kubernetes",)
    assert JobDescriptionDraft(**asdict(draft)) == draft
    with pytest.raises(FrozenInstanceError):
        draft.title = "Changed"


@pytest.mark.parametrize(
    "values",
    [
        {},
        {"title": " \n "},
        {"minimum_years": -1},
        {"maximum_years": -1},
        {"minimum_years": True},
        {"minimum_years": 1.5},
        {"minimum_years": 7, "maximum_years": 5},
        {"education_level": "bachelor"},
        {"responsibilities": ("x",) * 31},
        *(
            {name: ("x",) * 51}
            for name in ("required_skills", "preferred_skills", "unclassified_skills")
        ),
    ],
)
def test_invalid_drafts_rejected(values):
    with pytest.raises(ValueError):
        JobDescriptionDraft(**values)


@pytest.mark.parametrize(
    "values",
    [
        {"minimum_years": 0},
        {"maximum_years": 0},
        {"education_description": "Explicit qualification"},
        {"responsibilities": tuple(str(i) for i in range(30))},
        {"unclassified_skills": tuple(str(i) for i in range(50))},
    ],
)
def test_partial_drafts_and_exact_limits(values):
    assert JobDescriptionDraft(**values).title is None


@pytest.mark.parametrize(
    "raw",
    ["", " \n ", "x" * 50001, " " + "x" * 50000],
    ids=["empty", "blank", "oversized", "before-trimming"],
)
def test_input_rejected_before_provider(raw):
    provider = Mock()
    with pytest.raises(ValueError):
        JobDescriptionImportService(provider).draft(raw)
    provider.assert_not_called()
    provider.draft.assert_not_called()


def test_service_optional_provider_and_trimmed_input():
    assert JobDescriptionImportService().draft("Job") is None
    provider = Mock()
    provider.draft.return_value = JobDescriptionDraft(title="Job")
    service = JobDescriptionImportService(provider)
    assert service.draft("  Job \n") == provider.draft.return_value
    provider.draft.assert_called_once_with("Job")
    assert service.draft("x" * 50000) is not None


@pytest.mark.parametrize("failure", [True, False])
def test_typed_safe_failure(failure):
    provider = Mock()
    if failure:
        provider.draft.side_effect = RuntimeError("PRIVATE")
    else:
        provider.draft.return_value = None
    with pytest.raises(JobDescriptionImportError) as caught:
        JobDescriptionImportService(provider).draft("PRIVATE POSTING")
    assert "PRIVATE" not in str(caught.value)
