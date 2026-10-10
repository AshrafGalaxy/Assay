import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import create_access_token

client = TestClient(app)


def test_create_valid_expense():
    token = create_access_token(subject="usr_test_01")
    response = client.post(
        "/api/v1/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount": 250.0,
            "merchant_name": "Blue Tokai Coffee",
            "type": "expense",
            "category": "Food & Dining",
            "payment_method": "UPI",
            "description": "Afternoon brew",
            "transaction_date": "2026-10-10 16:55:00",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == 250.0
    assert data["merchant_name"] == "Blue Tokai Coffee"
    assert data["type"] == "debit"
    assert data["category"] == "Food & Dining"
    assert data["payment_method"] == "UPI"
    assert data["user_id"] == "usr_test_01"
    assert data["id"].startswith("tx_")


def test_create_valid_income():
    token = create_access_token(subject="usr_test_01")
    response = client.post(
        "/api/v1/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount": 85000.0,
            "merchant_name": "Tech Corp Salary",
            "type": "income",
            "category": "Salary",
            "payment_method": "Bank",
            "description": "Monthly pay",
            "transaction_date": "2026-10-01 09:00:00",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["amount"] == 85000.0
    assert data["merchant_name"] == "Tech Corp Salary"
    assert data["type"] == "credit"
    assert data["category"] == "Salary"


def test_reject_missing_required_fields():
    # Missing merchant
    res1 = client.post(
        "/api/v1/transactions",
        json={"amount": 100.0, "merchant_name": "", "category": "Food & Dining", "type": "expense"},
    )
    assert res1.status_code == 422
    assert "Merchant" in res1.json()["detail"]

    # Missing category
    res2 = client.post(
        "/api/v1/transactions",
        json={"amount": 100.0, "merchant_name": "Cafe", "category": "", "type": "expense"},
    )
    assert res2.status_code == 422
    assert "Category" in res2.json()["detail"]


def test_reject_zero_and_negative_amounts():
    res_zero = client.post(
        "/api/v1/transactions",
        json={"amount": 0, "merchant_name": "Zomato", "category": "Food & Dining", "type": "expense"},
    )
    assert res_zero.status_code == 422
    assert "greater than zero" in res_zero.json()["detail"]

    res_neg = client.post(
        "/api/v1/transactions",
        json={"amount": -50.0, "merchant_name": "Zomato", "category": "Food & Dining", "type": "expense"},
    )
    assert res_neg.status_code == 422
    assert "greater than zero" in res_neg.json()["detail"]


def test_prevent_duplicate_submission_on_rapid_taps():
    token = create_access_token(subject="usr_test_dup")
    payload = {
        "amount": 420.0,
        "merchant_name": "Quick Tap Cafe",
        "type": "expense",
        "category": "Food & Dining",
        "payment_method": "UPI",
        "transaction_date": "2026-10-10 12:00:00",
    }
    # First submit
    res1 = client.post("/api/v1/transactions", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res1.status_code == 201
    id1 = res1.json()["id"]

    # Immediate second submit (e.g. accidental double tap)
    res2 = client.post("/api/v1/transactions", headers={"Authorization": f"Bearer {token}"}, json=payload)
    assert res2.status_code in [200, 201]
    id2 = res2.json()["id"]

    assert id1 == id2, "Duplicate submission was prevented and idempotent response returned."


def test_transactions_appear_in_list():
    token = create_access_token(subject="usr_test_list")
    client.post(
        "/api/v1/transactions",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "amount": 999.0,
            "merchant_name": "Distinct Merchant 999",
            "type": "expense",
            "category": "Shopping",
            "payment_method": "Card",
            "transaction_date": "2026-10-10 14:00:00",
        },
    )

    list_res = client.get("/api/v1/transactions?source_type=manual")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    found = any(item["merchant_name"] == "Distinct Merchant 999" and item["amount"] == 999.0 for item in items)
    assert found, "Created transaction is returned in transactions list"


def test_spending_analytics_reflects_new_transactions():
    client.post(
        "/api/v1/transactions",
        json={
            "amount": 1500.0,
            "merchant_name": "Apollo Pharmacy Test",
            "type": "expense",
            "category": "Healthcare",
            "payment_method": "UPI",
            "transaction_date": "2026-10-10 10:00:00",
        },
    )

    analytics_res = client.get("/api/v1/analytics/spending")
    assert analytics_res.status_code == 200
    categories = analytics_res.json()["categories"]
    healthcare = next((c for c in categories if c["name"] == "Healthcare"), None)
    assert healthcare is not None, "Healthcare appears in spending analytics breakdown"
    assert healthcare["amount"] >= 1500.0


def test_user_ownership_association():
    token_a = create_access_token(subject="usr_alice")
    res_a = client.post(
        "/api/v1/transactions",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "amount": 350.0,
            "merchant_name": "Alice Specific Merchant",
            "type": "expense",
            "category": "Food & Dining",
        },
    )
    assert res_a.status_code == 201
    assert res_a.json()["user_id"] == "usr_alice"


def test_outside_month_date_boundary():
    # Transaction in a different month (January 2026)
    res = client.post(
        "/api/v1/transactions",
        json={
            "amount": 9999.0,
            "merchant_name": "Past New Year Trip",
            "type": "expense",
            "category": "Travel",
            "transaction_date": "2026-01-05 10:00:00",
        },
    )
    assert res.status_code == 201
    assert res.json()["transaction_date"] == "2026-01-05 10:00:00"


def test_reject_invalid_category():
    res = client.post(
        "/api/v1/transactions",
        json={
            "amount": 500.0,
            "merchant_name": "Casino Royal",
            "category": "Gambling & Crypto",
            "type": "expense",
        },
    )
    assert res.status_code == 422
    assert "Invalid category" in res.json()["detail"]


def test_reject_invalid_payment_method():
    res = client.post(
        "/api/v1/transactions",
        json={
            "amount": 500.0,
            "merchant_name": "Tech Store",
            "category": "Shopping",
            "payment_method": "Bitcoin",
            "type": "expense",
        },
    )
    assert res.status_code == 422
    assert "Invalid payment method" in res.json()["detail"]


def test_reject_expired_or_invalid_auth_token():
    res = client.post(
        "/api/v1/transactions",
        headers={"Authorization": "Bearer invalid_expired_jwt_token_123"},
        json={
            "amount": 250.0,
            "merchant_name": "Test Cafe",
            "category": "Food & Dining",
            "type": "expense",
        },
    )
    assert res.status_code == 401
    assert "Invalid or expired" in res.json()["detail"]


def test_reject_malformed_auth_header():
    res = client.post(
        "/api/v1/transactions",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
        json={
            "amount": 250.0,
            "merchant_name": "Test Cafe",
            "category": "Food & Dining",
            "type": "expense",
        },
    )
    assert res.status_code == 401
    assert "Expected 'Bearer <token>'" in res.json()["detail"]


def test_user_strictly_bound_to_authenticated_subject():
    token_bob = create_access_token(subject="usr_bob")
    res = client.post(
        "/api/v1/transactions",
        headers={"Authorization": f"Bearer {token_bob}"},
        json={
            "amount": 600.0,
            "merchant_name": "Bob Book Store",
            "category": "Education",
            "user_id": "usr_charlie_target",  # Attempted impersonation
            "type": "expense",
        },
    )
    assert res.status_code == 201
    # Transaction must be bound strictly to the authenticated token user, NOT the injected ID
    assert res.json()["user_id"] == "usr_bob"


def test_reject_excessive_amount():
    res = client.post(
        "/api/v1/transactions",
        json={
            "amount": 999_999_999.0,  # Exceeds max 10 crore
            "merchant_name": "Mega Acquisition",
            "category": "Investment",
            "type": "expense",
        },
    )
    assert res.status_code == 422
    assert "maximum permissible limit" in res.json()["detail"]


def test_human_date_format_handling():
    res = client.post(
        "/api/v1/transactions",
        json={
            "amount": 150.0,
            "merchant_name": "Human Date Chai",
            "category": "Food & Dining",
            "type": "expense",
            "transaction_date": "Today, 10:45 AM",
        },
    )
    assert res.status_code == 201
    # Normalized into standard ISO format
    assert "-" in res.json()["transaction_date"]

    # Verify financial-health endpoint does not crash with this transaction
    health_res = client.get("/api/v1/financial-health")
    assert health_res.status_code == 200
    assert "health_score" in health_res.json()


def test_future_month_transaction_does_not_break_snapshot():
    # Future transaction
    res = client.post(
        "/api/v1/transactions",
        json={
            "amount": 12000.0,
            "merchant_name": "Next Year Conference",
            "category": "Education",
            "type": "expense",
            "transaction_date": "2027-04-15 09:00:00",
        },
    )
    assert res.status_code == 201

    # Financial health snapshot must compute cleanly and retain valid numbers
    health_res = client.get("/api/v1/financial-health")
    assert health_res.status_code == 200
    data = health_res.json()
    assert data["income"] >= 0
    assert data["spending"] >= 0
    assert data["health_score"] >= 0


def test_failed_request_does_not_persist():
    initial_res = client.get("/api/v1/transactions")
    initial_total = initial_res.json()["total"]

    # Post invalid transaction (negative amount)
    fail_res = client.post(
        "/api/v1/transactions",
        json={
            "amount": -500.0,
            "merchant_name": "Failed Ghost Merchant",
            "category": "Shopping",
            "type": "expense",
        },
    )
    assert fail_res.status_code == 422

    # Verify total transactions unchanged
    post_res = client.get("/api/v1/transactions")
    assert post_res.json()["total"] == initial_total

