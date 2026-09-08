"""Draft API is an isolated preprocessing boundary."""

import asyncio
from dataclasses import asdict
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
from pathfinder_ai.application.job_description_import import JobDescriptionDraft
from pathfinder_ai.domain.education import EducationLevel

ENDPOINT = "/api/v1/job-description/draft"


def test_unavailable_safe_error():
    response = TestClient(create_app()).post(
        ENDPOINT, json={"raw_job_description": "PRIVATE"}
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "job_description_import_unavailable"
    assert "PRIVATE" not in response.text


@pytest.mark.parametrize(
    "raw",
    ["", " \n ", "PRIVATE" * 8000, None, 123],
    ids=["empty", "blank", "oversized", "null", "integer"],
)
def test_invalid_input_private_and_no_execution(raw):
    provider = Mock()
    response = TestClient(create_app(job_description_import_provider=provider)).post(
        ENDPOINT, json={"raw_job_description": raw}
    )
    assert response.status_code == 422
    assert "PRIVATE" not in response.text
    provider.draft.assert_not_called()


@pytest.mark.parametrize(
    "draft",
    [
        JobDescriptionDraft(unclassified_skills=("Kubernetes",)),
        JobDescriptionDraft(
            title="Engineer",
            company_name="Example",
            company_industry="Software",
            company_location="Bengaluru",
            responsibilities=("Build APIs",),
            required_skills=("Python",),
            preferred_skills=("Docker",),
            unclassified_skills=("Kubernetes",),
            minimum_years=5,
            maximum_years=7,
            education_level=EducationLevel.BACHELOR,
            education_field_of_study="CS",
            education_description="Explicit degree",
        ),
    ],
)
def test_typed_draft_offloaded_without_other_work(monkeypatch, draft):
    def execute(text):
        assert text == "PRIVATE POSTING"
        with pytest.raises(RuntimeError, match="no running event loop"):
            asyncio.get_running_loop()
        return draft

    importer = Mock()
    importer.draft.side_effect = execute
    enrichment, repository = Mock(), Mock()
    matcher = Mock(side_effect=AssertionError("analysis invoked"))
    monkeypatch.setattr(
        "pathfinder_ai.api.routes.analysis.DeterministicMatcher", matcher
    )
    app = create_app(enrichment, repository, importer)
    with TestClient(app) as client:
        result = client.post(
            ENDPOINT, json={"raw_job_description": "  PRIVATE POSTING  "}
        )
    assert result.status_code == 200
    expected = asdict(draft)
    for name in (
        "responsibilities",
        "required_skills",
        "preferred_skills",
        "unclassified_skills",
    ):
        expected[name] = list(expected[name])
    assert result.json() == expected
    assert "PRIVATE" not in result.text
    assert enrichment.mock_calls == repository.mock_calls == matcher.mock_calls == []
    importer.draft.assert_called_once_with("PRIVATE POSTING")


def test_provider_failure_is_safe_and_does_not_save():
    importer = Mock()
    importer.draft.side_effect = RuntimeError("PRIVATE POSTING KEY MODEL RESPONSE-ID")
    repository = Mock()
    response = TestClient(
        create_app(
            analysis_repository=repository, job_description_import_provider=importer
        )
    ).post(ENDPOINT, json={"raw_job_description": "PRIVATE POSTING"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "job_description_import_error"
    assert all(
        value not in response.text
        for value in ("PRIVATE", "KEY", "MODEL", "RESPONSE-ID")
    )
    assert repository.mock_calls == []


def test_openapi_contract_and_no_extra_request_fields():
    client = TestClient(create_app())
    schema = client.get("/openapi.json").json()
    operation = schema["paths"][ENDPOINT]["post"]
    assert operation["requestBody"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("JobDescriptionDraftRequestSchema")
    assert operation["responses"]["200"]["content"]["application/json"]["schema"][
        "$ref"
    ].endswith("JobDescriptionDraftResponseSchema")
    models = schema["components"]["schemas"]
    assert set(models["JobDescriptionDraftResponseSchema"]["properties"]) == set(
        asdict(JobDescriptionDraft(title="Job"))
    )
    assert (
        models["JobDescriptionDraftRequestSchema"]["properties"]["raw_job_description"][
            "maxLength"
        ]
        == 50000
    )
    assert (
        client.post(
            ENDPOINT, json={"raw_job_description": "Job", "candidate_profile": {}}
        ).status_code
        == 422
    )
