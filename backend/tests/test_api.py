from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "database": "ready"}


def test_financial_health():
    response = client.get("/api/v1/financial-health")
    assert response.status_code == 200
    data = response.json()
    assert "income" in data
    assert "spending" in data
    assert "savings" in data


def test_transactions_come_from_synthetic_ledger():
    response = client.get("/api/v1/transactions?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] > 0
    assert len(data["items"]) > 0
    assert data["items"][0]["source_type"] == "synthetic"
    assert data["items"][0]["id"].startswith("TX")


def test_recommendations_endpoint():
    response = client.get("/api/v1/recommendations")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_what_if_simulator_endpoint():
    response = client.post(
        "/api/v1/simulator/what-if",
        json={
            "assumptions": {
                "horizon_months": 3,
                "discretionary_reduction_pct": 15,
                "extra_debt_payment": 1500,
                "income_change_pct": -10,
            }
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["horizon_months"] == 3
    assert len(data["plans"]) == 2
    assert data["recommended_plan_id"] in {"plan_a", "plan_b"}
    assert "preference_reason" in data


def test_copilot_query():
    response = client.post(
        "/api/v1/copilot/query",
        json={"question": "Can I buy a watch for ₹8,000?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["intent"] == "affordability"
    assert "answer" in data
