"""End-to-end tests for the analysis API."""

import uuid
from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from pathfinder_ai.api import create_app
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentProvider,
    AIEnrichmentRequest,
    AIEnrichmentResult,
)
from pathfinder_ai.application.analysis_history import (
    AnalysisRepository,
    SavedAnalysis,
    SavedAnalysisSummary,
)
from pathfinder_ai.application.interview_preparation import InterviewPreparation
from pathfinder_ai.application.learning_recommendations import LearningRecommendations
from pathfinder_ai.domain import JobDescription, MatchExplanation
from pathfinder_ai.domain.matching import DeterministicMatcher


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

    def save(self, analysis: SavedAnalysis) -> None:
        self.saved[analysis.analysis_id] = analysis

    def get(self, analysis_id: uuid.UUID) -> SavedAnalysis | None:
        return self.saved.get(analysis_id)

    def list_recent(
        self, *, limit: int, offset: int
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
