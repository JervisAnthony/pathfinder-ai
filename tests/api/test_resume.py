"""API tests for deterministic role-relevant resume skill import."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
from pathfinder_ai.domain.matching import DeterministicMatcher


@pytest.fixture
def client() -> Generator[TestClient]:
    with TestClient(create_app()) as test_client:
        yield test_client


def post_import(
    client: TestClient,
    resume_text: str = "Python and Docker",
    required: list[dict[str, str]] | None = None,
    preferred: list[dict[str, str]] | None = None,
):
    return client.post(
        "/api/v1/resume/skill-import",
        json={
            "resume_text": resume_text,
            "required_skills": required
            if required is not None
            else [{"name": "Python"}],
            "preferred_skills": preferred if preferred is not None else [],
        },
    )


def test_import_returns_stable_mixed_result_without_echoing_resume(
    client: TestClient,
) -> None:
    private_text = "PYTHON, C++, and Docker are used."
    response = post_import(
        client,
        private_text,
        [{"name": "Python"}, {"name": "FastAPI"}, {"name": "C++"}],
        [{"name": "Docker"}, {"name": "Kubernetes"}],
    )

    assert response.status_code == 200
    assert response.json() == {
        "matched_required_skills": [{"name": "python"}, {"name": "c++"}],
        "matched_preferred_skills": [{"name": "docker"}],
        "unmatched_required_skills": [{"name": "fastapi"}],
        "unmatched_preferred_skills": [{"name": "kubernetes"}],
    }
    assert private_text not in response.text


def test_import_supports_preferred_only_and_valid_zero_matches(
    client: TestClient,
) -> None:
    preferred = post_import(
        client,
        resume_text="Used Node.js",
        required=[],
        preferred=[{"name": "Node.js"}],
    )
    no_match = post_import(client, resume_text="Rust")

    assert preferred.status_code == 200
    assert preferred.json()["matched_preferred_skills"] == [{"name": "node.js"}]
    assert no_match.status_code == 200
    assert no_match.json() == {
        "matched_required_skills": [],
        "matched_preferred_skills": [],
        "unmatched_required_skills": [{"name": "python"}],
        "unmatched_preferred_skills": [],
    }


def test_required_skill_takes_precedence_over_duplicate_preferred(
    client: TestClient,
) -> None:
    response = post_import(
        client,
        required=[{"name": "Python"}, {"name": " python "}],
        preferred=[{"name": "PYTHON"}],
    )

    assert response.status_code == 200
    assert response.json()["matched_required_skills"] == [{"name": "python"}]
    assert response.json()["matched_preferred_skills"] == []


@pytest.mark.parametrize("resume_text", ["", " \n\t "])
def test_blank_resume_is_rejected_without_echoing_input(
    client: TestClient, resume_text: str
) -> None:
    response = post_import(client, resume_text=resume_text)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    if resume_text:
        assert resume_text not in response.text


def test_no_target_skills_and_oversized_resume_are_rejected(
    client: TestClient,
) -> None:
    no_skills = post_import(client, required=[], preferred=[])
    oversized = post_import(client, resume_text="x" * 200_001)

    assert no_skills.status_code == 422
    assert no_skills.json()["error"]["code"] == "validation_error"
    assert oversized.status_code == 422
    assert oversized.json()["error"]["code"] == "validation_error"
    assert "x" * 1_000 not in oversized.text


def test_invalid_skill_uses_safe_domain_error(client: TestClient) -> None:
    response = post_import(client, required=[{"name": "  "}])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "domain_validation_error"
    assert "Skill cannot be blank" not in response.text


def test_import_needs_no_matcher_persistence_or_ai_provider(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def forbidden_matcher(*args: object, **kwargs: object) -> None:
        raise AssertionError(f"matcher invoked: {args!r} {kwargs!r}")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden_matcher)

    response = post_import(client)

    assert response.status_code == 200


def test_openapi_documents_resume_import_contract() -> None:
    operation = create_app().openapi()["paths"]["/api/v1/resume/skill-import"]["post"]

    assert operation["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ResumeSkillImportRequestSchema"
    }
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ResumeSkillImportResponseSchema"
    }
    assert operation["responses"]["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ErrorResponseSchema"
    }
    assert "ResumeSkillImport" not in create_app().openapi()["components"]["schemas"]
