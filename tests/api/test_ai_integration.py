"""Cross-boundary AI safety, thread execution, and saved snapshot regression."""

import asyncio
import contextlib
import json
import sqlite3
import threading
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from tests.api.test_runtime import _valid_payload
from tests.infrastructure.test_openai_ai_enrichment import make_client

from pathfinder_ai.api import create_app, runtime
from pathfinder_ai.api.routes import analysis
from pathfinder_ai.application.ai_enrichment import (
    AIEnrichmentRequest,
    AIEnrichmentResult,
)
from pathfinder_ai.application.learning_recommendations import (
    DeterministicLearningRecommender,
)


def test_provider_runs_in_worker_after_all_deterministic_work(monkeypatch):
    events = []
    original = DeterministicLearningRecommender.recommend
    original_threadpool = analysis.run_in_threadpool
    route_thread = None

    def recommend(self, *args, **kwargs):
        events.append("deterministic complete")
        return original(self, *args, **kwargs)

    async def offload(function, *args):
        nonlocal route_thread
        route_thread = threading.get_ident()
        events.append("offload")
        return await original_threadpool(function, *args)

    class Provider:
        def enrich(self, request: AIEnrichmentRequest) -> AIEnrichmentResult:
            assert threading.get_ident() != route_thread
            with pytest.raises(RuntimeError):
                asyncio.get_running_loop()
            assert request.interview_preparation is not None
            events.append("provider")
            return AIEnrichmentResult("Synthetic enrichment", "OpenAI")

    monkeypatch.setattr(DeterministicLearningRecommender, "recommend", recommend)
    monkeypatch.setattr(analysis, "run_in_threadpool", offload)
    payload = _valid_payload()
    payload.update(save_analysis=False, include_ai_enrichment=True)
    with TestClient(create_app(Provider())) as client:
        assert client.post("/api/v1/analysis", json=payload).status_code == 200
    assert events == ["deterministic complete", "offload", "provider"]


def test_mocked_runtime_persists_only_results_and_history_never_regenerates(
    monkeypatch, tmp_path
):
    database = tmp_path / "ai-history.db"
    monkeypatch.setenv("PATHFINDER_SQLITE_PATH", str(database))
    monkeypatch.setenv("PATHFINDER_OPENAI_API_KEY", "SYNTHETIC-NOT-A-CREDENTIAL")
    monkeypatch.setenv("PATHFINDER_OPENAI_MODEL", "synthetic-private-model")
    sdk = make_client("Synthetic saved advice\n<script>inert</script>")
    monkeypatch.setattr(runtime, "OpenAI", Mock(return_value=sdk))
    with TestClient(runtime.create_runtime_app()) as client:
        payload = _valid_payload()
        deterministic = client.post("/api/v1/analysis", json=payload)
        assert deterministic.status_code == 200
        sdk.responses.create.assert_not_called()
        payload["include_ai_enrichment"] = True
        enriched = client.post("/api/v1/analysis", json=payload)
        assert enriched.status_code == 200
        first, second = deterministic.json(), enriched.json()
        for field in (
            "score",
            "explanation",
            "interview_preparation",
            "learning_recommendations",
        ):
            assert first[field] == second[field]
        expected = {
            "content": "Synthetic saved advice\n<script>inert</script>",
            "provider_name": "OpenAI",
        }
        assert second["ai_enrichment"] == expected
        for saved, ai in ((first, None), (second, expected)):
            detail = client.get(
                f"/api/v1/analyses/{saved['saved_analysis']['analysis_id']}"
            )
            assert detail.status_code == 200
            assert detail.json()["ai_enrichment"] == ai
        assert [
            item["ai_enriched"]
            for item in client.get("/api/v1/analyses").json()["items"]
        ] == [True, False]
        sdk.responses.create.assert_called_once()
        sdk.responses.create.side_effect = RuntimeError(
            "SYNTHETIC-NOT-A-CREDENTIAL synthetic-private-model private prompt"
        )
        failed = client.post("/api/v1/analysis", json=payload)
        assert failed.status_code == 502
        assert failed.json()["error"]["code"] == "ai_provider_error"
        assert "SYNTHETIC" not in failed.text and "private" not in failed.text
        assert len(client.get("/api/v1/analyses").json()["items"]) == 2
    sdk.close.assert_called_once()
    with contextlib.closing(sqlite3.connect(database)) as connection:
        rows = connection.execute(
            "SELECT payload_version, payload_json FROM saved_analyses"
        ).fetchall()
        assert len(rows) == 2
        for version, text in rows:
            assert version == 2
            assert all(
                value not in text
                for value in (
                    "SYNTHETIC-NOT-A-CREDENTIAL",
                    "synthetic-private-model",
                    "synthetic-response-id",
                    "max_output_tokens",
                    "instructions",
                )
            )
            assert "ai_enrichment" in json.loads(text)
    database.unlink()
    assert not database.exists()
