import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_list_accounts_returns_initial_hdfc_account():
    response = client.get("/api/v1/accounts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    hdfc = next((a for a in data if a["bank_key"] == "hdfc" or "HDFC" in a["institution_name"]), None)
    assert hdfc is not None
    assert hdfc["status"] == "connected"
    assert hdfc["balance"] == 42580.0
    assert hdfc["account_number_masked"] == "•••• 4821"


def test_link_second_account_icici():
    # Link ICICI Bank
    response = client.post(
        "/api/v1/accounts/link",
        json={
            "bank_key": "icici",
            "institution_name": "ICICI Bank",
            "account_type": "Savings Account",
            "account_number_masked": "•••• 7712",
        },
    )
    assert response.status_code == 201
    icici = response.json()
    assert icici["institution_name"] == "ICICI Bank"
    assert icici["bank_key"] == "icici"
    assert icici["balance"] == 18240.0
    assert icici["status"] == "connected"

    # Both HDFC and ICICI should now be in list
    res_list = client.get("/api/v1/accounts")
    assert res_list.status_code == 200
    accounts = res_list.json()
    bank_keys = [a["bank_key"] for a in accounts]
    assert "hdfc" in bank_keys
    assert "icici" in bank_keys


def test_sync_individual_account():
    # Sync ICICI specifically
    res_list = client.get("/api/v1/accounts")
    icici_id = next(a["id"] for a in res_list.json() if a["bank_key"] == "icici")

    sync_res = client.post(f"/api/v1/accounts/{icici_id}/sync")
    assert sync_res.status_code == 200
    sync_data = sync_res.json()
    assert sync_data["status"] == "synchronized"
    assert sync_data["account_id"] == icici_id
    assert sync_data["balance"] == 18240.0
    assert sync_data["synced_records"] >= 1


def test_repeated_sync_does_not_create_duplicate_transactions():
    res_list = client.get("/api/v1/accounts")
    icici_id = next(a["id"] for a in res_list.json() if a["bank_key"] == "icici")

    # Get transaction count before
    tx_res_1 = client.get("/api/v1/transactions")
    total_before = tx_res_1.json()["total"]

    # Sync again
    sync_res = client.post(f"/api/v1/accounts/{icici_id}/sync")
    assert sync_res.status_code == 200

    # Total transactions must NOT increase (no duplicates created)
    tx_res_2 = client.get("/api/v1/transactions")
    total_after = tx_res_2.json()["total"]
    assert total_after == total_before


def test_disconnect_only_selected_account():
    res_list = client.get("/api/v1/accounts")
    icici = next(a for a in res_list.json() if a["bank_key"] == "icici")
    hdfc = next(a for a in res_list.json() if a["bank_key"] == "hdfc")

    # Disconnect ICICI
    disc_res = client.post(f"/api/v1/accounts/{icici['id']}/disconnect")
    assert disc_res.status_code == 200
    disc_data = disc_res.json()
    assert disc_data["status"] == "disconnected"

    # Verify ICICI is disconnected but HDFC remains connected
    res_list_after = client.get("/api/v1/accounts")
    accounts_after = res_list_after.json()

    icici_after = next(a for a in accounts_after if a["id"] == icici["id"])
    hdfc_after = next(a for a in accounts_after if a["id"] == hdfc["id"])

    assert icici_after["status"] == "disconnected"
    assert hdfc_after["status"] == "connected"


def test_get_account_consent():
    res_list = client.get("/api/v1/accounts")
    hdfc_id = next(a["id"] for a in res_list.json() if a["bank_key"] == "hdfc")

    consent_res = client.get(f"/api/v1/accounts/{hdfc_id}/consent")
    assert consent_res.status_code == 200
    c_data = consent_res.json()
    assert c_data["account_id"] == hdfc_id
    assert "AA-CONSENT" in c_data["consent_id"]
    assert c_data["status"] == "CONNECTED"
