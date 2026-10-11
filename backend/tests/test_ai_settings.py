from fastapi.testclient import TestClient

from app.main import app
from app.providers.llm.copilot_explainer import CopilotExplainer

client = TestClient(app)


def test_ai_preference_defaults_and_roundtrip():
    first = client.get("/api/v1/settings/ai")
    assert first.status_code == 200
    body = first.json()
    assert body["mode"] in {"local", "cloud"}
    assert "local_available" in body
    assert "cloud_available" in body
    assert body["local_model_name"]
    assert body["cloud_model_name"]

    saved = client.post("/api/v1/settings/ai", json={"mode": "cloud"})
    assert saved.status_code == 200
    assert saved.json()["mode"] == "cloud"

    again = client.get("/api/v1/settings/ai")
    assert again.json()["mode"] == "cloud"

    invalid = client.post("/api/v1/settings/ai", json={"mode": "hybrid"})
    assert invalid.status_code == 422

    reset = client.post("/api/v1/settings/ai", json={"mode": "local"})
    assert reset.status_code == 200
    assert reset.json()["mode"] == "local"


def test_copilot_query_uses_saved_model(monkeypatch):
    client.post("/api/v1/settings/ai", json={"mode": "cloud"})

    async def fake_phrase(self, *, question, draft_answer, facts, mode):
        assert mode == "cloud"
        assert draft_answer
        return {
            "answer": draft_answer,
            "provider": "groq",
            "model_label": "Cloud · test-model",
        }

    monkeypatch.setattr(CopilotExplainer, "phrase_verified_answer", fake_phrase)
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Can I buy a watch for ₹8,000?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_mode"] == "cloud"
    assert data["provider"] == "groq"
    assert data["model_label"] == "Cloud · test-model"
    assert data["intent"] == "affordability"

    client.post("/api/v1/settings/ai", json={"mode": "local"})


def test_unconfigured_local_model_keeps_verified_answer():
    client.post("/api/v1/settings/ai", json={"mode": "local"})
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Can I buy a watch for ₹8,000?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["model_mode"] == "local"
    assert data["answer"]
    assert data["why_this_answer"]["model_version"] == "assay-engine-v2.1+rules-audited"
