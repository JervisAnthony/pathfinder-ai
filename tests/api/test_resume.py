"""API tests for deterministic role-relevant resume skill import."""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from tests.infrastructure.test_resume_document_text import make_docx, make_pdf

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


def post_file(
    client,
    data=None,
    filename="PRIVATE-CANDIDATE-CONTENT-12345.pdf",
    required=None,
    preferred=None,
):
    fields = [
        (
            "file",
            (
                filename,
                data if data is not None else make_pdf(),
                "application/octet-stream",
            ),
        )
    ]
    fields.extend(
        ("required_skills", (None, skill))
        for skill in (
            required if required is not None else ["Python", "FastAPI", "Kubernetes"]
        )
    )
    fields.extend(
        ("preferred_skills", (None, skill))
        for skill in (preferred if preferred is not None else ["Docker", "Terraform"])
    )
    return client.post("/api/v1/resume/file-skill-import", files=fields)


@pytest.mark.parametrize("factory,extension", [(make_pdf, "PDF"), (make_docx, "DOCX")])
def test_file_import_mixed_matches_and_private_response(
    client, factory, extension, monkeypatch
):
    def forbidden(*args, **kwargs):
        raise AssertionError("analysis invoked")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden)
    text = "PRIVATE-CANDIDATE-CONTENT-12345 Python FastAPI Docker C++ .NET"
    filename = f"private-filename.{extension}"
    response = post_file(client, factory(text), filename)
    assert response.status_code == 200
    assert response.json() == {
        "matched_required_skills": [{"name": "python"}, {"name": "fastapi"}],
        "unmatched_required_skills": [{"name": "kubernetes"}],
        "matched_preferred_skills": [{"name": "docker"}],
        "unmatched_preferred_skills": [{"name": "terraform"}],
    }
    assert filename not in response.text
    assert "PRIVATE-CANDIDATE-CONTENT-12345" not in response.text


@pytest.mark.parametrize(
    "required,preferred,matched_required,matched_preferred",
    [
        (
            ["Python", " python "],
            ["PYTHON", "C++", ".NET"],
            ["python"],
            ["c++", ".net"],
        ),
        ([], ["C++"], [], ["c++"]),
        (["Rust"], [], [], []),
    ],
)
def test_file_matching_delegates_to_existing_importer(
    client, required, preferred, matched_required, matched_preferred
):
    response = post_file(
        client, make_docx("Python C++ .NET"), "r.docx", required, preferred
    )
    assert response.status_code == 200
    assert response.json()["matched_required_skills"] == [
        {"name": name} for name in matched_required
    ]
    assert response.json()["matched_preferred_skills"] == [
        {"name": name} for name in matched_preferred
    ]


@pytest.mark.parametrize(
    "data,extension,status,code",
    [
        (b"PRIVATE-CANDIDATE-CONTENT-12345", "txt", 415, "unsupported_resume_file"),
        (b"PRIVATE-CANDIDATE-CONTENT-12345", "pdf", 422, "resume_file_unreadable"),
        (
            b"%PDF-1.7 PRIVATE-CANDIDATE-CONTENT-12345",
            "pdf",
            422,
            "resume_file_unreadable",
        ),
        (b"PRIVATE-CANDIDATE-CONTENT-12345", "docx", 422, "resume_file_unreadable"),
        (make_pdf(encrypted=True), "pdf", 422, "resume_file_unreadable"),
        (make_pdf(""), "pdf", 422, "resume_file_no_text"),
        (make_docx(""), "docx", 422, "resume_file_no_text"),
        (b"x" * (10 * 1024 * 1024 + 1), "pdf", 413, "resume_file_too_large"),
        (make_pdf(pages=101), "pdf", 422, "resume_file_content_too_large"),
    ],
    ids=lambda value: "document" if isinstance(value, bytes) else str(value),
)
def test_safe_file_errors(client, data, extension, status, code):
    filename = f"PRIVATE-CANDIDATE-CONTENT-12345.{extension}"
    response = post_file(client, data, filename)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "PRIVATE-CANDIDATE-CONTENT-12345" not in response.text


@pytest.mark.parametrize("required,preferred", [([], []), ([" "], []), ([], [" "])])
def test_invalid_file_target_skills(client, required, preferred):
    response = post_file(client, required=required, preferred=preferred)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "domain_validation_error"


def test_multipart_openapi_and_missing_upload(client):
    schema = create_app().openapi()
    operation = schema["paths"]["/api/v1/resume/file-skill-import"]["post"]
    ref = operation["requestBody"]["content"]["multipart/form-data"]["schema"]["$ref"]
    fields = schema["components"]["schemas"][ref.rsplit("/", 1)[-1]]["properties"]
    assert set(fields) == {"file", "required_skills", "preferred_skills"}
    for status in (413, 415, 422):
        assert operation["responses"][str(status)]["content"]["application/json"][
            "schema"
        ]["$ref"].endswith("ErrorResponseSchema")
    assert operation["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("ResumeSkillImportResponseSchema")
    assert "ExtractedResumeDocument" not in schema["components"]["schemas"]
    assert client.post("/api/v1/resume/file-skill-import").status_code == 422


@pytest.mark.parametrize(
    "data,size,required",
    [
        (make_pdf(), None, ["Python"]),
        (b"bad", 3, ["Python"]),
        (make_pdf(), None, []),
        (b"x" * (10 * 1024 * 1024 + 1), None, ["Python"]),
        (b"", 10 * 1024 * 1024 + 1, ["Python"]),
    ],
    ids=lambda value: "document" if isinstance(value, bytes) else str(value),
)
def test_upload_closed_even_without_supplied_size(data, size, required):
    import asyncio
    from io import BytesIO

    from fastapi import UploadFile

    from pathfinder_ai.api.errors import DomainValidationError
    from pathfinder_ai.api.routes.resume import import_resume_file_skills

    upload = UploadFile(BytesIO(data), size=size, filename="private.pdf")
    try:
        asyncio.run(import_resume_file_skills(upload, required, []))
    except DomainValidationError:
        assert not required
    assert upload.file.closed
