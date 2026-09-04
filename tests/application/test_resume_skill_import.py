"""Tests for deterministic role-relevant resume skill import."""

from dataclasses import FrozenInstanceError, fields

import pytest

from pathfinder_ai.application.resume_skill_import import (
    MAX_RESUME_TEXT_LENGTH,
    DeterministicResumeSkillImporter,
    ResumeSkillImport,
)
from pathfinder_ai.domain.skill import Skill


def import_skills(
    resume_text: str,
    required: tuple[Skill, ...] = (),
    preferred: tuple[Skill, ...] = (),
) -> ResumeSkillImport:
    return DeterministicResumeSkillImporter().import_skills(
        resume_text, required, preferred
    )


def test_exact_required_and_preferred_matches_preserve_source_order() -> None:
    python = Skill("Python")
    fastapi = Skill("FastAPI")
    docker = Skill("Docker")

    result = import_skills(
        "Docker and PYTHON are used before FastAPI is mentioned.",
        (python, fastapi),
        (docker,),
    )

    assert result.matched_required_skills == (python, fastapi)
    assert result.matched_preferred_skills == (docker,)
    assert result.unmatched_required_skills == ()
    assert result.unmatched_preferred_skills == ()
    assert result.matched_required_skills[0] is python


def test_unmatched_and_empty_results_are_deterministic() -> None:
    python = Skill("Python")
    docker = Skill("Docker")

    first = import_skills("Rust", (python,), (docker,))
    second = import_skills("Rust", (python,), (docker,))
    empty = import_skills("Rust")

    assert first == second
    assert first.matched_required_skills == ()
    assert first.matched_preferred_skills == ()
    assert first.unmatched_required_skills == (python,)
    assert first.unmatched_preferred_skills == (docker,)
    assert empty == ResumeSkillImport((), (), (), ())


def test_duplicates_are_removed_and_required_takes_precedence() -> None:
    python = Skill("Python")
    docker = Skill("Docker")

    result = import_skills(
        "Python",
        (python, Skill(" python "), python),
        (Skill("PYTHON"), docker, docker),
    )

    assert result.matched_required_skills == (python,)
    assert result.matched_preferred_skills == ()
    assert result.unmatched_required_skills == ()
    assert result.unmatched_preferred_skills == (docker,)


def test_matching_collapses_whitespace_without_reordering_tokens() -> None:
    machine_learning = Skill("Machine Learning")

    matched = import_skills("Used Machine\n   Learning daily", (machine_learning,))
    reordered = import_skills("Used Learning Machine daily", (machine_learning,))

    assert matched.matched_required_skills == (machine_learning,)
    assert reordered.unmatched_required_skills == (machine_learning,)


@pytest.mark.parametrize(
    ("resume_text", "skill_name"),
    [
        ("Built services in C++.", "C++"),
        ("Built services in C#.", "C#"),
        ("Built services on .NET.", ".NET"),
        ("Built services with Node.js.", "Node.js"),
        ("Maintained CI/CD pipelines.", "CI/CD"),
    ],
)
def test_punctuation_heavy_skills_match(resume_text: str, skill_name: str) -> None:
    skill = Skill(skill_name)
    assert import_skills(resume_text, (skill,)).matched_required_skills == (skill,)


@pytest.mark.parametrize(
    ("resume_text", "skill_name"),
    [
        ("Worked at Google", "Go"),
        ("Built unrelated products", "R"),
        ("Used scalable systems", "C"),
        ("Used ASP.NET", ".NET"),
        ("Used Node.jsx", "Node.js"),
        ("Used CICD", "CI/CD"),
        ("Used Kubernetes", "K8s"),
        ("Used JavaScript", "Java"),
        ("技能Go开发", "Go"),
    ],
)
def test_boundaries_and_exact_matching_reject_partial_alias_or_fuzzy_matches(
    resume_text: str, skill_name: str
) -> None:
    skill = Skill(skill_name)
    assert import_skills(resume_text, (skill,)).unmatched_required_skills == (skill,)


def test_result_is_immutable_and_does_not_contain_resume_text() -> None:
    result = import_skills("private resume text", (Skill("Python"),))

    assert all(
        isinstance(getattr(result, field.name), tuple) for field in fields(result)
    )
    assert {field.name for field in fields(result)} == {
        "matched_required_skills",
        "matched_preferred_skills",
        "unmatched_required_skills",
        "unmatched_preferred_skills",
    }
    with pytest.raises(FrozenInstanceError):
        result.matched_required_skills = ()


def test_oversized_resume_text_is_rejected_without_truncation() -> None:
    with pytest.raises(ValueError, match="cannot exceed 200000 characters"):
        import_skills("x" * (MAX_RESUME_TEXT_LENGTH + 1), (Skill("Python"),))
