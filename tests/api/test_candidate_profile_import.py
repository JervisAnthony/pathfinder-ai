"""Candidate Profile draft APIs preserve the review and privacy boundary."""

import asyncio
from io import BytesIO
from unittest.mock import Mock

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from tests.infrastructure.test_resume_document_text import make_docx, make_pdf

from pathfinder_ai.api import create_app
from pathfinder_ai.api.routes.candidate_profile import (
    create_candidate_profile_file_draft,
)
from pathfinder_ai.application.candidate_profile_import import (
    CandidateCertificationDraft,
    CandidateEducationDraft,
    CandidateExperienceDraft,
    CandidateProfileDraft,
    CandidateProfileImportProvider,
    CandidateProjectDraft,
)
from pathfinder_ai.domain.education import EducationLevel

TEXT_ENDPOINT = "/api/v1/candidate-profile/draft"
FILE_ENDPOINT = "/api/v1/candidate-profile/file-draft"
PRIVATE_TEXT = "PRIVATE-CANDIDATE-SOURCE Python"


def full_draft() -> CandidateProfileDraft:
    return CandidateProfileDraft(
        skills=("Python",),
        experience=(
            CandidateExperienceDraft(
                "Engineer", "Example", 60, "Built APIs", ("Python",)
            ),
        ),
        education=(
            CandidateEducationDraft(
                EducationLevel.MASTER, "Data Science", "Example University", None
            ),
            CandidateEducationDraft(None, None, None, "Unmapped qualification"),
        ),
        projects=(CandidateProjectDraft("Forecasting", None, ("Python",)),),
        certifications=(CandidateCertificationDraft("Cloud", "Example", None),),
    )


def provider_with(draft: CandidateProfileDraft | None = None) -> Mock:
    provider = Mock(spec=CandidateProfileImportProvider)
    provider.draft.return_value = draft or full_draft()
    return provider


def test_text_draft_is_typed_private_and_offloaded() -> None:
    def draft(text: str) -> CandidateProfileDraft:
        assert text == PRIVATE_TEXT
        with pytest.raises(RuntimeError, match="no running event loop"):
            asyncio.get_running_loop()
        return full_draft()

    provider = provider_with()
    provider.draft.side_effect = draft
    repository, enrichment, job_importer = Mock(), Mock(), Mock()
    app = create_app(enrichment, repository, job_importer, provider)
    response = TestClient(app).post(
        TEXT_ENDPOINT, json={"raw_resume_text": f"  {PRIVATE_TEXT}  "}
    )

    assert response.status_code == 200
    assert response.json() == {
        "skills": ["Python"],
        "experience": [
            {
                "role_title": "Engineer",
                "company_name": "Example",
                "duration_months": 60,
                "description": "Built APIs",
                "skills": ["Python"],
            }
        ],
        "education": [
            {
                "level": "master",
                "field_of_study": "Data Science",
                "institution": "Example University",
                "description": None,
            },
            {
                "level": None,
                "field_of_study": None,
                "institution": None,
                "description": "Unmapped qualification",
            },
        ],
        "projects": [
            {"name": "Forecasting", "description": None, "skills": ["Python"]}
        ],
        "certifications": [{"name": "Cloud", "issuer": "Example", "description": None}],
    }
    assert PRIVATE_TEXT not in response.text
    assert (
        repository.mock_calls == enrichment.mock_calls == job_importer.mock_calls == []
    )


@pytest.mark.parametrize(
    "raw",
    ["", " \n ", "x" * 200_001, None, 7],
    ids=["empty", "blank", "oversized", "null", "integer"],
)
def test_text_validation_prevents_provider_execution(raw: object) -> None:
    provider = provider_with()
    response = TestClient(create_app(candidate_profile_import_provider=provider)).post(
        TEXT_ENDPOINT, json={"raw_resume_text": raw}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "x" * 1_000 not in response.text
    provider.draft.assert_not_called()


def test_text_unavailable_and_failure_are_safe() -> None:
    unavailable = TestClient(create_app()).post(
        TEXT_ENDPOINT, json={"raw_resume_text": PRIVATE_TEXT}
    )
    provider = provider_with()
    provider.draft.side_effect = RuntimeError("PRIVATE KEY MODEL RESPONSE-ID")
    failed = TestClient(create_app(candidate_profile_import_provider=provider)).post(
        TEXT_ENDPOINT, json={"raw_resume_text": PRIVATE_TEXT}
    )
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "candidate_profile_import_unavailable"
    assert failed.status_code == 502
    assert failed.json()["error"]["code"] == "candidate_profile_import_error"
    for response in (unavailable, failed):
        assert all(word not in response.text for word in ("PRIVATE", "KEY", "MODEL"))


@pytest.mark.parametrize("factory,extension", [(make_pdf, "pdf"), (make_docx, "docx")])
def test_file_draft_reuses_extractor_and_sends_only_text(factory, extension) -> None:
    provider = provider_with()
    data = factory(PRIVATE_TEXT)
    response = TestClient(create_app(candidate_profile_import_provider=provider)).post(
        FILE_ENDPOINT,
        files={"file": (f"PRIVATE-NAME.{extension}", data, "application/octet-stream")},
    )
    assert response.status_code == 200
    assert PRIVATE_TEXT not in response.text
    assert "PRIVATE-NAME" not in response.text
    sent = provider.draft.call_args.args[0]
    assert "PRIVATE-CANDIDATE-SOURCE" in sent
    assert not isinstance(sent, bytes)


@pytest.mark.parametrize(
    "data,extension,status,code",
    [
        (b"PRIVATE", "txt", 415, "unsupported_resume_file"),
        (b"PRIVATE", "pdf", 422, "resume_file_unreadable"),
        (make_pdf(encrypted=True), "pdf", 422, "resume_file_unreadable"),
        (make_pdf(""), "pdf", 422, "resume_file_no_text"),
        (make_docx(""), "docx", 422, "resume_file_no_text"),
        (b"x" * (10 * 1024 * 1024 + 1), "pdf", 413, "resume_file_too_large"),
        (make_pdf(pages=101), "pdf", 422, "resume_file_content_too_large"),
    ],
    ids=[
        "unsupported",
        "corrupt-pdf",
        "encrypted-pdf",
        "empty-pdf",
        "empty-docx",
        "oversized-upload",
        "page-limit",
    ],
)
def test_file_errors_reuse_safe_resume_family(data, extension, status, code) -> None:
    provider = provider_with()
    response = TestClient(create_app(candidate_profile_import_provider=provider)).post(
        FILE_ENDPOINT, files={"file": (f"PRIVATE.{extension}", data)}
    )
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "PRIVATE" not in response.text
    provider.draft.assert_not_called()


def test_file_checks_provider_only_after_valid_extraction() -> None:
    invalid = TestClient(create_app()).post(
        FILE_ENDPOINT, files={"file": ("resume.txt", b"PRIVATE")}
    )
    valid = TestClient(create_app()).post(
        FILE_ENDPOINT, files={"file": ("resume.pdf", make_pdf(PRIVATE_TEXT))}
    )
    assert invalid.status_code == 415
    assert valid.status_code == 503
    assert valid.json()["error"]["code"] == "candidate_profile_import_unavailable"


def test_upload_is_closed_on_success_and_failure() -> None:
    app = create_app(candidate_profile_import_provider=provider_with())
    for data, filename in (
        (make_pdf(PRIVATE_TEXT), "r.pdf"),
        (b"bad", "r.pdf"),
        (b"x" * (10 * 1024 * 1024 + 1), "r.pdf"),
    ):
        upload = UploadFile(BytesIO(data), size=None, filename=filename)
        try:
            asyncio.run(create_candidate_profile_file_draft(upload, Mock(app=app)))
        except Exception:
            pass
        assert upload.file.closed


def test_openapi_contract_has_no_raw_or_forbidden_response_fields() -> None:
    schema = create_app().openapi()
    text = schema["paths"][TEXT_ENDPOINT]["post"]
    file = schema["paths"][FILE_ENDPOINT]["post"]
    assert text["requestBody"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("CandidateProfileDraftRequestSchema")
    assert file["requestBody"]["content"]["multipart/form-data"]["schema"]["$ref"]
    response_model = schema["components"]["schemas"][
        "CandidateProfileDraftResponseSchema"
    ]["properties"]
    assert set(response_model) == {
        "skills",
        "experience",
        "education",
        "projects",
        "certifications",
    }
    forbidden = {"preferences", "name", "email", "phone", "raw_resume_text", "provider"}
    assert forbidden.isdisjoint(response_model)
    for operation in (text, file):
        assert operation["responses"]["200"]["content"]["application/json"]["schema"][
            "$ref"
        ].endswith("CandidateProfileDraftResponseSchema")
