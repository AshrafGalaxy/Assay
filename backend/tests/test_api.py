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
    data = response.json()
    assert data["status"] in ["healthy", "degraded"]
    assert "database" in data


def test_financial_health():
    response = client.get("/api/v1/financial-health")
    assert response.status_code == 200
    data = response.json()
    assert "income" in data
    assert "spending" in data
    assert "savings" in data


def test_transactions_clean_slate_has_no_synthetic_ledger():
    """Default config has synthetic ledger off — only DB/manual rows (if any)."""
    response = client.get("/api/v1/transactions?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert all(item.get("source_type") != "synthetic" for item in data["items"])


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


def test_money_leaks_endpoint():
    response = client.get("/api/v1/analytics/money-leaks?threshold=250")
    assert response.status_code == 200
    data = response.json()
    assert "total_amount" in data
    assert "total_count" in data
    assert "leaks" in data
    assert len(data["leaks"]) > 0
    assert "note" in data


def test_structural_break_life_shift_detection():
    from app.services.financial_intelligence.engine import build_financial_health
    from datetime import date

    # 3 consecutive months: Month 1 base (50k), Month 2 surged (80k = +60%), Month 3 surged (85k = +70%)
    transactions = [
        {"id": "t1", "amount": 50000.0, "type": "credit", "category": "Salary", "transaction_date": "2026-07-01", "is_fixed": False, "is_recurring": True},
        {"id": "t2", "amount": 20000.0, "type": "debit", "category": "Rent", "transaction_date": "2026-07-10", "is_fixed": True, "is_recurring": True},
        {"id": "t3", "amount": 80000.0, "type": "credit", "category": "Salary", "transaction_date": "2026-08-01", "is_fixed": False, "is_recurring": True},
        {"id": "t4", "amount": 25000.0, "type": "debit", "category": "Rent", "transaction_date": "2026-08-10", "is_fixed": True, "is_recurring": True},
        {"id": "t5", "amount": 85000.0, "type": "credit", "category": "Salary", "transaction_date": "2026-09-01", "is_fixed": False, "is_recurring": True},
        {"id": "t6", "amount": 30000.0, "type": "debit", "category": "Rent", "transaction_date": "2026-09-10", "is_fixed": True, "is_recurring": True},
    ]
    result = build_financial_health(transactions, as_of=date(2026, 9, 30))
    shift_signal = next((s for s in result["signals"] if s["type"] == "structural_break_life_shift"), None)
    assert shift_signal is not None
    assert "Life Shift Detected" in shift_signal["description"]


