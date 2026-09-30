"""End-to-end tests for the analysis API."""

import uuid
from contextlib import closing
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentProvider,
    AIEnrichmentRequest,
    AIEnrichmentResult,
)
from pathfinder_ai.application.analysis_comparison import compare_saved_analyses
from pathfinder_ai.application.analysis_export import render_saved_analysis_markdown
from pathfinder_ai.application.analysis_history import (
    AnalysisHistoryFilter,
    AnalysisRepository,
    SavedAnalysis,
    SavedAnalysisSummary,
)
from pathfinder_ai.application.interview_preparation import (
    DeterministicInterviewPreparer,
    InterviewPreparation,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
    LearningRecommendations,
)
from pathfinder_ai.domain import JobDescription, MatchExplanation
from pathfinder_ai.domain.matching import DeterministicMatcher, MatchScore
from pathfinder_ai.infrastructure.sqlite_analysis_repository import (
    SQLiteAnalysisRepository,
)


class FakeAIProvider(AIEnrichmentProvider):
    def __init__(self, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.requests: list[AIEnrichmentRequest] = []

    def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult:
        self.requests.append(request)
        if self.should_fail:
            raise RuntimeError("private provider failure details")
        return AIEnrichmentResult(
            content="Synthetic AI insight.", provider_name="FakeProvider"
        )


class FakeRepository(AnalysisRepository):
    def __init__(self) -> None:
        self.saved: dict[uuid.UUID, SavedAnalysis] = {}
        self.deleted_ids: list[uuid.UUID] = []

    def save(self, analysis: SavedAnalysis) -> None:
        self.saved[analysis.analysis_id] = analysis

    def get(self, analysis_id: uuid.UUID) -> SavedAnalysis | None:
        return self.saved.get(analysis_id)

    def delete(self, analysis_id: uuid.UUID) -> bool:
        self.deleted_ids.append(analysis_id)
        return self.saved.pop(analysis_id, None) is not None

    def list_recent(
        self,
        *,
        limit: int,
        offset: int,
        history_filter: AnalysisHistoryFilter | None = None,
    ) -> tuple[SavedAnalysisSummary, ...]:
        items = list(self.saved.values())
        items.sort(key=lambda x: (x.created_at, x.analysis_id), reverse=True)
        summaries = [
            SavedAnalysisSummary(
                analysis_id=item.analysis_id,
                created_at=item.created_at,
                job_title=item.job_description.title.title,
                company_name=item.job_description.company_info.name
                if item.job_description.company_info
                else None,
                score=item.match_explanation.score.value,
                ai_enriched=item.ai_enrichment is not None,
            )
            for item in items
        ]
        return tuple(summaries[offset : offset + limit])


@pytest.fixture
def fake_repo() -> FakeRepository:
    return FakeRepository()


@pytest.fixture
def valid_payload() -> dict[str, Any]:
    return {
        "candidate_profile": {
            "skills": [{"name": "Python"}],
            "experience": [
                {
                    "role_title": {"title": "Software Engineer"},
                    "duration_months": 24,
                    "skills": [{"name": "Python"}],
                }
            ],
            "education": [],
            "projects": [],
            "certifications": [],
            "preferences": None,
        },
        "job_description": {
            "title": {"title": "Backend Engineer"},
            "responsibilities": [{"description": "Build reliable APIs."}],
            "required_skills": [{"name": "Python"}],
            "preferred_skills": [{"name": "Docker"}],
            "company_info": None,
            "experience_requirement": {
                "minimum_years": 3,
                "maximum_years": None,
            },
            "education_requirement": None,
        },
        "include_ai_enrichment": False,
    }


def _post(payload: dict[str, Any], provider: AIEnrichmentProvider | None = None) -> Any:
    return TestClient(create_app(ai_provider=provider)).post(
        "/api/v1/analysis", json=payload
    )


def _assert_validation_error(response: Any, expected_loc: str) -> None:
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["message"] == "Request validation failed."
    assert error["details"]
    assert any(expected_loc in detail["loc"] for detail in error["details"])
    assert all(set(detail) == {"loc", "msg", "type"} for detail in error["details"])


def test_deterministic_analysis_success(valid_payload: dict[str, Any]) -> None:
    response = _post(valid_payload)

    assert response.status_code == 200
    data = response.json()
    assert data["score"] == {"value": 66.67}
    assert data.get("saved_analysis") is None


def test_explicit_save_success(
    valid_payload: dict[str, Any], fake_repo: FakeRepository
) -> None:
    app = create_app(analysis_repository=fake_repo)
    client = TestClient(app)

    valid_payload["save_analysis"] = True
    response = client.post("/api/v1/analysis", json=valid_payload)

    assert response.status_code == 200
    data = response.json()
    assert data.get("saved_analysis") is not None
    assert data["saved_analysis"]["analysis_id"]
    assert data["saved_analysis"]["created_at"]

    assert len(fake_repo.saved) == 1
    saved = next(iter(fake_repo.saved.values()))
    assert isinstance(saved.learning_recommendations, LearningRecommendations)
    assert saved.learning_recommendations.items


def test_persistence_unavailable_when_requested(valid_payload: dict[str, Any]) -> None:
    # No repository injected
    app = create_app()
    client = TestClient(app)

    valid_payload["save_analysis"] = True
    response = client.post("/api/v1/analysis", json=valid_payload)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "persistence_unavailable"


def test_persistence_unavailable_is_checked_before_ai(
    valid_payload: dict[str, Any],
) -> None:
    provider = FakeAIProvider()
    valid_payload["save_analysis"] = True
    valid_payload["include_ai_enrichment"] = True

    response = TestClient(create_app(ai_provider=provider)).post(
        "/api/v1/analysis", json=valid_payload
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "persistence_unavailable"
    assert provider.requests == []


def test_history_list(valid_payload: dict[str, Any], fake_repo: FakeRepository) -> None:
    app = create_app(analysis_repository=fake_repo)
    client = TestClient(app)

    # Save a few
    valid_payload["save_analysis"] = True
    client.post("/api/v1/analysis", json=valid_payload)
    client.post("/api/v1/analysis", json=valid_payload)

    response = client.get("/api/v1/analyses")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert "job_title" in data["items"][0]


def test_history_list_persistence_unavailable() -> None:
    app = create_app()
    client = TestClient(app)
    response = client.get("/api/v1/analyses")
    assert response.status_code == 503


def test_history_detail(
    valid_payload: dict[str, Any], fake_repo: FakeRepository
) -> None:
    app = create_app(analysis_repository=fake_repo)
    client = TestClient(app)

    valid_payload["save_analysis"] = True
    post_response = client.post("/api/v1/analysis", json=valid_payload)
    analysis_id = post_response.json()["saved_analysis"]["analysis_id"]

    response = client.get(f"/api/v1/analyses/{analysis_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["analysis_id"] == analysis_id
    assert data["score"] == {"value": 66.67}
    assert (
        data["learning_recommendations"]
        == post_response.json()["learning_recommendations"]
    )

    saved_id = uuid.UUID(analysis_id)
    fake_repo.saved[saved_id] = replace(
        fake_repo.saved[saved_id], learning_recommendations=None
    )
    legacy_response = client.get(f"/api/v1/analyses/{analysis_id}")
    assert legacy_response.status_code == 200
    assert legacy_response.json()["learning_recommendations"] is None


def test_history_detail_not_found(fake_repo: FakeRepository) -> None:
    app = create_app(analysis_repository=fake_repo)
    client = TestClient(app)

    response = client.get(f"/api/v1/analyses/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "analysis_not_found"


def test_history_detail_persistence_unavailable() -> None:
    app = create_app()
    client = TestClient(app)

    response = client.get(f"/api/v1/analyses/{uuid.uuid4()}")
    assert response.status_code == 503


def test_delete_analysis_isolated_no_content_and_not_recomputed(
    valid_payload: dict[str, Any],
    fake_repo: FakeRepository,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = FakeAIProvider()
    client = TestClient(create_app(analysis_repository=fake_repo, ai_provider=provider))
    valid_payload["save_analysis"] = True
    first = client.post("/api/v1/analysis", json=valid_payload).json()[
        "saved_analysis"
    ]["analysis_id"]
    second = client.post("/api/v1/analysis", json=valid_payload).json()[
        "saved_analysis"
    ]["analysis_id"]

    def forbidden_explain(self: Any, candidate: Any, job: Any) -> None:
        raise AssertionError("Deletion must not run deterministic analysis")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden_explain)

    response = client.delete(f"/api/v1/analyses/{first}")

    assert response.status_code == 204
    assert response.content == b""
    assert fake_repo.deleted_ids == [uuid.UUID(first)]
    assert provider.requests == []
    assert client.get(f"/api/v1/analyses/{first}").status_code == 404
    history_ids = {
        item["analysis_id"] for item in client.get("/api/v1/analyses").json()["items"]
    }
    assert history_ids == {second}
    assert client.get(f"/api/v1/analyses/{second}").status_code == 200

    repeated = client.delete(f"/api/v1/analyses/{first}")
    assert repeated.status_code == 404
    assert repeated.json()["error"]["code"] == "analysis_not_found"
    assert fake_repo.deleted_ids == [uuid.UUID(first), uuid.UUID(first)]


def test_delete_analysis_unknown_and_persistence_unavailable(
    fake_repo: FakeRepository,
) -> None:
    unknown_id = uuid.uuid4()
    unknown = TestClient(create_app(analysis_repository=fake_repo)).delete(
        f"/api/v1/analyses/{unknown_id}"
    )
    unavailable = TestClient(create_app()).delete(f"/api/v1/analyses/{unknown_id}")

    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "analysis_not_found"
    assert unavailable.status_code == 503
    assert unavailable.json()["error"]["code"] == "persistence_unavailable"
    assert str(unknown_id) not in unknown.text
    assert str(unknown_id) not in unavailable.text


def test_delete_analysis_invalid_uuid_is_safe(fake_repo: FakeRepository) -> None:
    response = TestClient(create_app(analysis_repository=fake_repo)).delete(
        "/api/v1/analyses/not-a-uuid"
    )

    _assert_validation_error(response, "analysis_id")
    assert fake_repo.deleted_ids == []


def test_openapi_exposes_delete_analysis_contract() -> None:
    operation = (
        TestClient(create_app())
        .get("/openapi.json")
        .json()["paths"]["/api/v1/analyses/{analysis_id}"]["delete"]
    )

    assert set(operation["responses"]) >= {"204", "404", "422", "503"}
    assert "content" not in operation["responses"]["204"]


@pytest.mark.parametrize(
    ("path", "location"),
    (
        ("/api/v1/analyses?limit=0", "limit"),
        ("/api/v1/analyses?limit=101", "limit"),
        ("/api/v1/analyses?offset=-1", "offset"),
        ("/api/v1/analyses/not-a-uuid", "analysis_id"),
    ),
)
def test_history_input_validation(
    path: str, location: str, fake_repo: FakeRepository
) -> None:
    response = TestClient(create_app(analysis_repository=fake_repo)).get(path)

    _assert_validation_error(response, location)
    assert all(
        set(detail) == {"loc", "msg", "type"}
        for detail in response.json()["error"]["details"]
    )


def test_deterministic_analysis_response_structure(
    valid_payload: dict[str, Any],
) -> None:
    response = _post(valid_payload)

    assert response.status_code == 200
    data = response.json()
    assert data["explanation"]["score"] == data["score"]
    assert data["explanation"]["components"] == [
        {
            "kind": "required_skills",
            "earned_points": 1.0,
            "possible_points": 1.0,
        },
        {
            "kind": "preferred_skills",
            "earned_points": 0.0,
            "possible_points": 0.5,
        },
        {
            "kind": "experience",
            "earned_points": pytest.approx(2 / 3),
            "possible_points": 1.0,
        },
    ]
    assert data["explanation"]["matched_skills"][0] == {
        "skill": {"name": "python"},
        "is_required": True,
        "evidence_sources": [
            {"kind": "profile", "label": None},
            {"kind": "work_experience", "label": "Software Engineer"},
        ],
    }
    assert data["explanation"]["experience"]["known_candidate_months"] == 24
    assert data["explanation"]["gaps"] == {
        "missing_required_skills": [],
        "missing_preferred_skills": [{"name": "docker"}],
        "experience_gap": {
            "required_months": 36,
            "known_candidate_months": 24,
            "missing_months": 12,
        },
        "education_gap": None,
    }
    assert data["explanation"]["keyword_coverage"] == {
        "matched_keywords": [{"name": "python"}],
        "missing_keywords": [{"name": "docker"}],
        "percentage": 50.0,
    }

    preparation = data["interview_preparation"]
    assert {
        "kind": "required_skill_strength",
        "description": "Required skill: python",
    } in preparation["themes"]
    assert {"description": "python evidence from profile"} in preparation[
        "talking_points"
    ]
    assert "experience_gap_discussion" in preparation["question_categories"]
    assert {
        "description": "How is python used day to day in this role?"
    } in preparation["candidate_questions"]
    assert data["ai_enrichment"] is None

    recommendations = data["learning_recommendations"]["items"]
    assert [(item["kind"], item["priority"]) for item in recommendations] == [
        ("experience", "high"),
        ("preferred_skill", "medium"),
    ]
    assert recommendations[0]["suggested_course_topic"] is None
    assert recommendations[1]["suggested_course_topic"] == "docker fundamentals"


def test_learning_recommendations_cover_all_gap_kinds_and_no_gap_state(
    valid_payload: dict[str, Any],
) -> None:
    valid_payload["job_description"].update(
        {
            "required_skills": [{"name": "Python"}, {"name": "Docker"}],
            "preferred_skills": [{"name": "Kubernetes"}],
            "education_requirement": {
                "level": "master",
                "field_of_study": "Computer Science",
                "description": "Advanced study expected.",
            },
        }
    )

    response = _post(valid_payload)

    assert response.status_code == 200
    items = response.json()["learning_recommendations"]["items"]
    assert [item["kind"] for item in items] == [
        "required_skill",
        "experience",
        "education",
        "preferred_skill",
    ]
    assert [item["priority"] for item in items] == [
        "high",
        "high",
        "high",
        "medium",
    ]

    valid_payload["job_description"].update(
        {
            "required_skills": [{"name": "Python"}],
            "preferred_skills": [],
            "experience_requirement": {"minimum_years": 2, "maximum_years": None},
            "education_requirement": None,
        }
    )
    no_gaps = _post(valid_payload)

    assert no_gaps.status_code == 200
    assert no_gaps.json()["learning_recommendations"] == {"items": []}


def test_openapi_exposes_learning_recommendation_contract() -> None:
    document = TestClient(create_app()).get("/openapi.json").json()
    schemas = document["components"]["schemas"]

    response_properties = schemas["AnalysisResponseSchema"]["properties"]
    assert "learning_recommendations" in response_properties
    assert "learning_recommendations" in schemas["AnalysisResponseSchema"]["required"]
    assert schemas["LearningRecommendationSchema"]["properties"]["kind"][
        "$ref"
    ].endswith("LearningRecommendationKind")
    assert schemas["LearningRecommendationSchema"]["properties"]["priority"][
        "$ref"
    ].endswith("LearningRecommendationPriority")


def test_analysis_uses_one_deterministic_result(
    valid_payload: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    original_explain = DeterministicMatcher.explain
    explain_calls = 0

    def counting_explain(self: Any, candidate: Any, job: Any) -> MatchExplanation:
        nonlocal explain_calls
        explain_calls += 1
        return original_explain(self, candidate, job)

    def forbidden_match(self: Any, candidate: Any, job: Any) -> None:
        raise AssertionError("match() must not be called by the route")

    monkeypatch.setattr(DeterministicMatcher, "explain", counting_explain)
    monkeypatch.setattr(DeterministicMatcher, "match", forbidden_match)

    response = _post(valid_payload)

    assert response.status_code == 200
    assert explain_calls == 1
    assert response.json()["score"] == response.json()["explanation"]["score"]


def test_unknown_top_level_field_is_rejected(valid_payload: dict[str, Any]) -> None:
    valid_payload["unexpected"] = "value"
    _assert_validation_error(_post(valid_payload), "unexpected")


def test_unknown_nested_field_is_rejected(valid_payload: dict[str, Any]) -> None:
    valid_payload["candidate_profile"]["skills"][0]["unexpected"] = "value"
    _assert_validation_error(_post(valid_payload), "unexpected")


def test_invalid_education_level_is_rejected(valid_payload: dict[str, Any]) -> None:
    valid_payload["candidate_profile"]["education"] = [{"level": "not-a-level"}]
    _assert_validation_error(_post(valid_payload), "level")


def test_invalid_work_mode_is_rejected(valid_payload: dict[str, Any]) -> None:
    valid_payload["candidate_profile"]["preferences"] = {
        "acceptable_work_modes": ["teleportation"]
    }
    _assert_validation_error(_post(valid_payload), "acceptable_work_modes")


def test_malformed_experience_is_rejected(valid_payload: dict[str, Any]) -> None:
    valid_payload["candidate_profile"]["experience"][0]["duration_months"] = "invalid"
    _assert_validation_error(_post(valid_payload), "duration_months")


def test_domain_validation_error_is_safe(valid_payload: dict[str, Any]) -> None:
    valid_payload["job_description"]["required_skills"].append({"name": "Docker"})

    response = _post(valid_payload)

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "domain_validation_error",
            "message": "Domain validation failed.",
            "details": [
                {
                    "loc": ["body"],
                    "msg": "Value violates domain constraints.",
                    "type": "value_error.domain",
                }
            ],
        }
    }
    assert "both required and preferred" not in response.text


def test_unexpected_value_error_is_not_mapped_to_422(
    valid_payload: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_explain(self: Any, candidate: Any, job: Any) -> None:
        raise ValueError("internal implementation detail")

    monkeypatch.setattr(DeterministicMatcher, "explain", broken_explain)
    client = TestClient(create_app(), raise_server_exceptions=False)

    response = client.post("/api/v1/analysis", json=valid_payload)

    assert response.status_code == 500
    assert "domain_validation_error" not in response.text
    assert "internal implementation detail" not in response.text


def test_ai_provider_is_not_called_when_disabled(
    valid_payload: dict[str, Any],
) -> None:
    provider = FakeAIProvider()

    response = _post(valid_payload, provider)

    assert response.status_code == 200
    assert provider.requests == []
    assert response.json()["ai_enrichment"] is None


def test_optional_ai_enrichment_preserves_deterministic_response(
    valid_payload: dict[str, Any],
) -> None:
    provider = FakeAIProvider()
    deterministic = _post(valid_payload).json()
    valid_payload["include_ai_enrichment"] = True

    response = _post(valid_payload, provider)

    assert response.status_code == 200
    assert len(provider.requests) == 1
    captured = provider.requests[0]
    assert isinstance(captured.job_description, JobDescription)
    assert isinstance(captured.match_explanation, MatchExplanation)
    assert isinstance(captured.interview_preparation, InterviewPreparation)
    assert not hasattr(captured, "candidate_profile")

    enriched = response.json()
    assert {k: v for k, v in enriched.items() if k != "ai_enrichment"} == {
        k: v for k, v in deterministic.items() if k != "ai_enrichment"
    }
    assert enriched["ai_enrichment"] == {
        "content": "Synthetic AI insight.",
        "provider_name": "FakeProvider",
    }


def test_ai_provider_missing_error(valid_payload: dict[str, Any]) -> None:
    valid_payload["include_ai_enrichment"] = True

    response = _post(valid_payload)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "ai_provider_unavailable"


def test_ai_provider_execution_error_is_safe(valid_payload: dict[str, Any]) -> None:
    valid_payload["include_ai_enrichment"] = True

    response = _post(valid_payload, FakeAIProvider(should_fail=True))

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "ai_provider_error"
    assert "private provider failure details" not in response.text


def test_repository_never_saves_invalid_or_incomplete_analysis(
    valid_payload: dict[str, Any], fake_repo: FakeRepository
) -> None:
    client = TestClient(create_app(analysis_repository=fake_repo))

    schema_invalid = {**valid_payload, "unexpected": "value", "save_analysis": True}
    assert client.post("/api/v1/analysis", json=schema_invalid).status_code == 422

    domain_invalid = {
        **valid_payload,
        "save_analysis": True,
        "job_description": {
            **valid_payload["job_description"],
            "required_skills": [{"name": "Docker"}],
        },
    }
    assert client.post("/api/v1/analysis", json=domain_invalid).status_code == 422

    provider_missing = {
        **valid_payload,
        "save_analysis": True,
        "include_ai_enrichment": True,
    }
    assert client.post("/api/v1/analysis", json=provider_missing).status_code == 503

    failing_client = TestClient(
        create_app(
            ai_provider=FakeAIProvider(should_fail=True),
            analysis_repository=fake_repo,
        )
    )
    assert (
        failing_client.post("/api/v1/analysis", json=provider_missing).status_code
        == 502
    )

    assert fake_repo.saved == {}


def test_repository_is_not_called_when_persistence_is_not_requested(
    valid_payload: dict[str, Any], fake_repo: FakeRepository
) -> None:
    response = TestClient(create_app(analysis_repository=fake_repo)).post(
        "/api/v1/analysis", json=valid_payload
    )

    assert response.status_code == 200
    assert fake_repo.saved == {}


@pytest.mark.parametrize(
    "params",
    [
        {"query": "x" * 201},
        {"min_score": "-1"},
        {"max_score": "101"},
        {"min_score": "nan"},
        {"max_score": "inf"},
        {"min_score": "80", "max_score": "20"},
        {"ai_enriched": "invalid"},
    ],
)
def test_history_filters_reject_invalid_query_parameters(
    params: dict[str, str], fake_repo: FakeRepository
) -> None:
    client = TestClient(create_app(analysis_repository=fake_repo))
    response = client.get("/api/v1/analyses", params=params)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["details"][0]["loc"][0] == "query"


def test_history_filters_sqlite_api_smoke(
    valid_payload: dict[str, Any], tmp_path: Path
) -> None:
    repository = SQLiteAnalysisRepository(tmp_path / "api-filters.db")
    provider = FakeAIProvider()
    client = TestClient(
        create_app(analysis_repository=repository, ai_provider=provider)
    )
    valid_payload["save_analysis"] = True
    valid_payload["job_description"]["title"]["title"] = (
        "100% Data_Engineer \\ O'Connor 株式会社"
    )
    first = client.post("/api/v1/analysis", json=valid_payload).json()
    first_id = first["saved_analysis"]["analysis_id"]
    valid_payload["job_description"]["title"]["title"] = "Other Engineer"
    valid_payload["include_ai_enrichment"] = True
    second = client.post("/api/v1/analysis", json=valid_payload).json()
    second_id = second["saved_analysis"]["analysis_id"]
    for query in ("%", "_", "\\", "O'Connor", "株式会社", " data_engineer "):
        response = client.get("/api/v1/analyses", params={"query": query})
        assert response.status_code == 200
        assert [item["analysis_id"] for item in response.json()["items"]] == [first_id]
    assert client.get("/api/v1/analyses", params={"query": "' OR 1=1 --"}).json() == {
        "items": []
    }
    score = first["score"]["value"]
    assert (
        client.get(
            "/api/v1/analyses",
            params={"ai_enriched": "false", "min_score": score, "max_score": score},
        ).json()["items"][0]["analysis_id"]
        == first_id
    )
    assert (
        client.get("/api/v1/analyses", params={"ai_enriched": "true"}).json()["items"][
            0
        ]["analysis_id"]
        == second_id
    )
    assert (
        client.get(
            "/api/v1/analyses", params={"query": "Engineer", "limit": 1, "offset": 1}
        ).json()["items"][0]["analysis_id"]
        == first_id
    )
    assert len(provider.requests) == 1
    assert client.delete(f"/api/v1/analyses/{first_id}").status_code == 204
    assert client.get("/api/v1/analyses", params={"query": "%"}).json() == {"items": []}
    assert client.get(f"/api/v1/analyses/{second_id}").status_code == 200
    assert (
        TestClient(create_app())
        .get("/api/v1/analyses", params={"query": "Engineer"})
        .status_code
        == 503
    )


@pytest.mark.parametrize("enriched", [False, True])
def test_saved_export_smoke_is_read_only_equivalent_and_deterministic(
    valid_payload: dict[str, Any],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    enriched: bool,
) -> None:
    database = tmp_path / "exports.db"
    repository = SQLiteAnalysisRepository(database)
    provider = FakeAIProvider()
    client = TestClient(
        create_app(analysis_repository=repository, ai_provider=provider)
    )
    valid_payload["save_analysis"] = True
    valid_payload["include_ai_enrichment"] = enriched
    valid_payload["job_description"]["title"]["title"] = (
        'Role " / \\ \r\n X-Injected: yes 株式会社 <script>alert(1)</script>'
    )
    saved = client.post("/api/v1/analysis", json=valid_payload)
    assert saved.status_code == 200
    analysis_id = saved.json()["saved_analysis"]["analysis_id"]
    snapshot = repository.get(uuid.UUID(analysis_id))
    assert snapshot is not None
    before = database.read_bytes()
    provider_calls = len(provider.requests)

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Export must not invoke analysis, providers, or writes")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden)
    monkeypatch.setattr(DeterministicInterviewPreparer, "prepare", forbidden)
    monkeypatch.setattr(DeterministicLearningRecommender, "recommend", forbidden)
    monkeypatch.setattr(provider, "enrich", forbidden)
    monkeypatch.setattr(repository, "save", forbidden)
    monkeypatch.setattr(repository, "delete", forbidden)
    for format, extension, mime in (
        ("json", "json", "application/json"),
        ("markdown", "md", "text/markdown"),
    ):
        response = client.get(
            f"/api/v1/analyses/{analysis_id}/export", params={"format": format}
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == f"{mime}; charset=utf-8"
        assert (
            response.headers["content-disposition"]
            == f'attachment; filename="pathfinder-analysis-{analysis_id}.{extension}"'
        )
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "x-injected" not in response.headers
        assert "株式会社" not in str(response.headers)
        assert (
            response.content
            == client.get(
                f"/api/v1/analyses/{analysis_id}/export", params={"format": format}
            ).content
        )
        if format == "json":
            assert (
                response.json() == client.get(f"/api/v1/analyses/{analysis_id}").json()
            )
            assert set(response.json()) == {
                "analysis_id",
                "created_at",
                "candidate_profile",
                "job_description",
                "score",
                "explanation",
                "interview_preparation",
                "learning_recommendations",
                "ai_enrichment",
            }
            assert "株式会社" in response.text
        else:
            assert response.text == render_saved_analysis_markdown(snapshot)
            assert "<script>" not in response.text
            assert ("## AI Enrichment" in response.text) == enriched
    assert (
        client.get(f"/api/v1/analyses/{analysis_id}/export").json()
        == client.get(f"/api/v1/analyses/{analysis_id}").json()
    )
    assert len(provider.requests) == provider_calls
    assert database.read_bytes() == before
    assert repository.get(uuid.UUID(analysis_id)) == snapshot


@pytest.mark.parametrize(
    ("analysis_id", "format", "configured", "status", "code"),
    [
        (str(uuid.UUID(int=0)), "json", True, 404, "analysis_not_found"),
        ("invalid-uuid", "json", True, 422, "validation_error"),
        (str(uuid.UUID(int=0)), "pdf", True, 422, "validation_error"),
        (str(uuid.UUID(int=0)), "markdown", False, 503, "persistence_unavailable"),
    ],
)
def test_export_errors_are_safe(
    fake_repo: FakeRepository,
    analysis_id: str,
    format: str,
    configured: bool,
    status: int,
    code: str,
) -> None:
    client = TestClient(
        create_app(analysis_repository=fake_repo if configured else None)
    )
    response = client.get(
        f"/api/v1/analyses/{analysis_id}/export", params={"format": format}
    )
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "content-disposition" not in response.headers
    assert "candidate_profile" not in response.text
    assert "payload_json" not in response.text
    assert "Traceback" not in response.text


def test_export_openapi_contract() -> None:
    schema = TestClient(create_app()).get("/openapi.json").json()
    operation = schema["paths"]["/api/v1/analyses/{analysis_id}/export"]["get"]
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert parameters["format"]["schema"]["enum"] == ["json", "markdown"]
    assert parameters["analysis_id"]["schema"]["format"] == "uuid"
    responses = operation["responses"]
    assert {"200", "404", "422", "503"}.issubset(responses)
    assert {"application/json", "text/markdown"}.issubset(responses["200"]["content"])
    assert "Content-Disposition" in responses["200"]["headers"]


@pytest.mark.parametrize("unscored", [False, True])
def test_comparison_read_only_sqlite_smoke(
    tmp_path: Path,
    valid_payload: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    unscored: bool,
) -> None:
    import sqlite3

    from pathfinder_ai.api.schemas import SavedAnalysisComparisonSchema

    database = tmp_path / "comparison.db"
    repository = SQLiteAnalysisRepository(database)
    provider = FakeAIProvider()
    client = TestClient(
        create_app(analysis_repository=repository, ai_provider=provider)
    )
    valid_payload["save_analysis"] = True
    left_id = client.post("/api/v1/analysis", json=valid_payload).json()[
        "saved_analysis"
    ]["analysis_id"]
    valid_payload["include_ai_enrichment"] = True
    valid_payload["job_description"]["title"]["title"] = (
        '<script>alert(1)</script> **Café** "SQL"; DROP TABLE analyses;--'
    )
    right_id = client.post("/api/v1/analysis", json=valid_payload).json()[
        "saved_analysis"
    ]["analysis_id"]
    left, right = (
        repository.get(uuid.UUID(left_id)),
        repository.get(uuid.UUID(right_id)),
    )
    assert left is not None and right is not None
    if unscored:
        left = replace(
            left,
            match_explanation=replace(left.match_explanation, score=MatchScore(None)),
        )
        assert repository.delete(left.analysis_id)
        repository.save(left)
    before = database.read_bytes()
    with closing(sqlite3.connect(database)) as connection:
        schema_before = connection.execute(
            "SELECT sql FROM sqlite_master ORDER BY name"
        ).fetchall()
        payloads_before = connection.execute(
            "SELECT payload_json FROM saved_analyses ORDER BY analysis_id"
        ).fetchall()

    def forbidden(*args: object, **kwargs: object) -> None:
        raise AssertionError("Comparison cannot recompute, call AI or write")

    monkeypatch.setattr(DeterministicMatcher, "explain", forbidden)
    monkeypatch.setattr(DeterministicInterviewPreparer, "prepare", forbidden)
    monkeypatch.setattr(DeterministicLearningRecommender, "recommend", forbidden)
    monkeypatch.setattr(provider, "enrich", forbidden)
    monkeypatch.setattr(repository, "save", forbidden)
    params = {"left_analysis_id": left_id, "right_analysis_id": right_id}
    response = client.get("/api/v1/analyses/compare", params=params)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    expected = SavedAnalysisComparisonSchema.model_validate(
        asdict(compare_saved_analyses(left, right))
    ).model_dump(mode="json")
    assert response.json() == expected
    assert (
        client.get("/api/v1/analyses/compare", params=params).content
        == response.content
    )
    assert response.json()["score_delta"] == (None if unscored else 0)
    assert response.json()["left"]["ai_enriched"] is False
    assert response.json()["right"]["ai_enriched"] is True
    for private in (
        "candidate_profile",
        "job_description",
        "Synthetic AI insight.",
        "provider_name",
        "payload_json",
    ):
        assert private not in response.text
    same = client.get(
        "/api/v1/analyses/compare",
        params={"left_analysis_id": right_id, "right_analysis_id": right_id},
    )
    assert same.status_code == 200 and same.json()["score_delta"] == 0
    assert same.json()["matched_skills"]["left_only"] == []
    assert database.read_bytes() == before
    assert repository.get(uuid.UUID(left_id)) == left
    assert repository.get(uuid.UUID(right_id)) == right
    with closing(sqlite3.connect(database)) as connection:
        assert (
            connection.execute("SELECT sql FROM sqlite_master ORDER BY name").fetchall()
            == schema_before
        )
        assert (
            connection.execute(
                "SELECT payload_json FROM saved_analyses ORDER BY analysis_id"
            ).fetchall()
            == payloads_before
        )
        assert connection.execute(
            "SELECT DISTINCT payload_version FROM saved_analyses"
        ).fetchall() == [(2,)]
    assert client.get("/api/v1/analyses").status_code == 200
    for analysis_id in (left_id, right_id):
        assert client.get(f"/api/v1/analyses/{analysis_id}").status_code == 200
        for format in ("json", "markdown"):
            assert (
                client.get(
                    f"/api/v1/analyses/{analysis_id}/export", params={"format": format}
                ).status_code
                == 200
            )
    assert client.delete(f"/api/v1/analyses/{left_id}").status_code == 204
    missing = client.get("/api/v1/analyses/compare", params=params)
    other_missing = client.get(
        "/api/v1/analyses/compare",
        params={"left_analysis_id": right_id, "right_analysis_id": left_id},
    )
    both_missing = client.get(
        "/api/v1/analyses/compare",
        params={"left_analysis_id": left_id, "right_analysis_id": left_id},
    )
    assert (
        missing.status_code
        == other_missing.status_code
        == both_missing.status_code
        == 404
    )
    assert missing.json() == other_missing.json() == both_missing.json()
    assert left_id not in missing.text and right_id not in missing.text
    assert client.get(f"/api/v1/analyses/{left_id}/export").status_code == 404
    assert client.get(f"/api/v1/analyses/{right_id}").status_code == 200


@pytest.mark.parametrize("side", ["left_analysis_id", "right_analysis_id"])
def test_comparison_invalid_uuid(side: str, fake_repo: FakeRepository) -> None:
    params = {
        "left_analysis_id": str(uuid.uuid4()),
        "right_analysis_id": str(uuid.uuid4()),
    }
    params[side] = "invalid-private-input"
    response = TestClient(create_app(analysis_repository=fake_repo)).get(
        "/api/v1/analyses/compare", params=params
    )
    _assert_validation_error(response, side)
    assert "invalid-private-input" not in response.text


def test_comparison_unavailable_openapi_and_route_order() -> None:
    app = create_app()
    response = TestClient(app).get(
        "/api/v1/analyses/compare",
        params={
            "left_analysis_id": str(uuid.uuid4()),
            "right_analysis_id": str(uuid.uuid4()),
        },
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "persistence_unavailable"
    from pathfinder_ai.api.routes.analysis import router

    paths = [route.path for route in router.routes if hasattr(route, "path")]
    assert paths.index("/api/v1/analyses/compare") < paths.index(
        "/api/v1/analyses/{analysis_id}"
    )
    operation = app.openapi()["paths"]["/api/v1/analyses/compare"]["get"]
    assert {parameter["name"] for parameter in operation["parameters"]} == {
        "left_analysis_id",
        "right_analysis_id",
    }
    assert {"200", "404", "422", "503"} <= operation["responses"].keys()


def test_export_after_deletion_returns_not_found(
    valid_payload: dict[str, Any],
    fake_repo: FakeRepository,
) -> None:
    client = TestClient(create_app(analysis_repository=fake_repo))
    valid_payload["save_analysis"] = True
    analysis_id = client.post("/api/v1/analysis", json=valid_payload).json()[
        "saved_analysis"
    ]["analysis_id"]
    assert client.get(f"/api/v1/analyses/{analysis_id}/export").status_code == 200
    assert client.delete(f"/api/v1/analyses/{analysis_id}").status_code == 204
    assert client.get(f"/api/v1/analyses/{analysis_id}/export").status_code == 404


def test_tracking_api_lifecycle(tmp_path: Path, valid_payload: dict[str, Any]) -> None:
    repository = SQLiteAnalysisRepository(tmp_path / "tracking-api.db")
    client = TestClient(create_app(analysis_repository=repository))
    valid_payload["save_analysis"] = True
    analysis_id = client.post("/api/v1/analysis", json=valid_payload).json()[
        "saved_analysis"
    ]["analysis_id"]
    path = f"/api/v1/analyses/{analysis_id}/tracking"
    detail_before = client.get(f"/api/v1/analyses/{analysis_id}").json()
    json_before = client.get(
        f"/api/v1/analyses/{analysis_id}/export?format=json"
    ).content
    markdown_before = client.get(
        f"/api/v1/analyses/{analysis_id}/export?format=markdown"
    ).content
    default = client.get(path)
    assert default.status_code == 200
    assert default.headers["Cache-Control"] == "no-store"
    assert default.json() == {
        "analysis_id": analysis_id,
        "application_status": "not_applied",
        "updated_at": None,
    }
    assert (
        client.put(path, json={"application_status": "not_applied"}).json()
        == default.json()
    )
    for status in (
        "applied",
        "interviewing",
        "offer",
        "accepted",
        "rejected",
        "withdrawn",
        "not_applied",
    ):
        updated = client.put(path, json={"application_status": status})
        assert updated.status_code == 200
        assert updated.headers["Cache-Control"] == "no-store"
        assert updated.json()["application_status"] == status
        assert updated.json()["updated_at"] is not None
        assert (
            client.put(path, json={"application_status": status}).json()
            == updated.json()
        )
        listed = client.get("/api/v1/analyses", params={"application_status": status})
        assert listed.json()["items"][0]["application_status"] == status
    assert client.get(f"/api/v1/analyses/{analysis_id}").json() == detail_before
    assert (
        client.get(f"/api/v1/analyses/{analysis_id}/export?format=json").content
        == json_before
    )
    assert (
        client.get(f"/api/v1/analyses/{analysis_id}/export?format=markdown").content
        == markdown_before
    )
    assert client.put(path, json={"application_status": "invalid"}).status_code == 422
    assert (
        client.get(
            "/api/v1/analyses", params={"application_status": "invalid"}
        ).status_code
        == 422
    )
    assert client.delete(f"/api/v1/analyses/{analysis_id}").status_code == 204
    assert client.get(path).status_code == 404
    assert client.put(path, json={"application_status": "applied"}).status_code == 404


def test_tracking_api_missing_and_unavailable(tmp_path: Path) -> None:
    unavailable = TestClient(create_app())
    missing = TestClient(
        create_app(
            analysis_repository=SQLiteAnalysisRepository(tmp_path / "missing.db")
        )
    )
    identifier = uuid.uuid4()
    for client, status in ((unavailable, 503), (missing, 404)):
        assert (
            client.get(f"/api/v1/analyses/{identifier}/tracking").status_code == status
        )
        assert (
            client.put(
                f"/api/v1/analyses/{identifier}/tracking",
                json={"application_status": "applied"},
            ).status_code
            == status
        )
    assert unavailable.get("/api/v1/analyses/invalid/tracking").status_code == 422
    assert (
        unavailable.put(
            "/api/v1/analyses/invalid/tracking", json={"application_status": "applied"}
        ).status_code
        == 422
    )
