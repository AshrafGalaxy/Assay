import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_copilot_reserve_shortfall_query():
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Will my cash run short before my next payday?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] in {"reserve_shortfall", "general_inquiry"}
    assert "headline" in data
    assert "answer" in data
    assert len(data["what_we_know"]) >= 2
    assert "what_may_happen" in data
    assert "what_you_can_do" in data
    assert "why_this_answer" in data
    assert data["why_this_answer"]["model_version"] == "assay-engine-v2.1+rules-audited"
    assert "audit_id" in data["why_this_answer"]


def test_copilot_affordability_query():
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Can I afford to purchase a laptop for ₹45,000?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] == "affordability"
    assert "₹45,000" in data["headline"] or "₹45,000" in data["answer"]
    assert "what_we_know" in data
    assert "what_you_can_do" in data
    assert data["what_you_can_do"]["action_url"] == "/copilot/affordability"


def test_copilot_obligations_query():
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "What are my upcoming bills and debt obligations?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] in {"obligations", "general_inquiry"}
    assert len(data["what_we_know"]) >= 2
    assert "why_this_answer" in data


def test_copilot_savings_opportunity_query():
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "How can I increase my monthly savings buffer?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] in {"savings_opportunity", "general_inquiry"}
    assert data["what_you_can_do"] is not None


def test_copilot_proactive_insights_endpoint():
    response = client.get("/api/v1/copilot/insights")
    assert response.status_code == 200
    items = response.json()
    assert isinstance(items, list)
    assert len(items) >= 2
    for item in items:
        assert "id" in item
        assert "title" in item
        assert "summary" in item
        assert "evidence" in item
        assert "recommendation" in item


def test_copilot_audit_trail_retrieval():
    # 1. Ask a question to generate audit record
    res = client.post(
        "/api/v1/copilot/query",
        json={"question": "What is my cash flow health?"},
    )
    assert res.status_code == 200
    audit_id = res.json()["why_this_answer"]["audit_id"]

    # 2. Retrieve audit record
    audit_res = client.get(f"/api/v1/copilot/audit/{audit_id}")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert audit_data["id"] == audit_id
    assert audit_data["model_version"] == "assay-engine-v2.1+rules-audited"
    assert "data_snapshot" in audit_data
    assert "created_at" in audit_data


def test_copilot_reject_empty_query():
    res = client.post("/api/v1/copilot/query", json={"question": "   "})
    assert res.status_code == 422
