"""
Unit tests for Device Hardware Compatibility Profiling,
User-Consented OHTTP Cloud Routing, Real RFC 9180 HPKE Crypto, and 5-Layer Faithfulness Auditing.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.providers.llm.ohttp_client import DeviceHardwareProfiler, OHTTPClient
from app.providers.llm.copilot_explainer import CopilotExplainer
from app.providers.llm.hpke import GatewayKeyPair, hpke_encapsulate_and_encrypt, hpke_decrypt_response


client = TestClient(app)


def test_hardware_profiler_compatible_device():
    """Verify modern device with >= 1.5 GB available RAM is approved for On-Device SLM."""
    profile = DeviceHardwareProfiler.profile_device(available_ram_gb=4.0, platform="ios")
    assert profile["status"] == "COMPATIBLE"
    assert profile["is_slm_ready"] is True
    assert profile["headroom_mb"] > 1000
    assert "On-Device" in profile["recommended_mode"]


def test_hardware_profiler_constrained_device():
    """Verify older or budget device (< 1.5 GB available RAM) is flagged as CONSTRAINED."""
    profile = DeviceHardwareProfiler.profile_device(available_ram_gb=0.8, platform="android")
    assert profile["status"] == "CONSTRAINED"
    assert profile["is_slm_ready"] is False
    assert "Cloud Mode" in profile["recommended_mode"] or "Deterministic" in profile["recommended_mode"]


@pytest.mark.asyncio
async def test_ohttp_client_requires_explicit_user_consent():
    """Verify OHTTP client rejects unconsented cloud requests with PermissionError."""
    o_client = OHTTPClient(enabled=True, relay_url="https://relay.test", gateway_url="https://gw.test")
    with pytest.raises(PermissionError) as exc_info:
        await o_client.forward_blinded_request(payload={"query": "test"}, user_consented=False)
    assert "User consent required" in str(exc_info.value)


@pytest.mark.asyncio
async def test_ohttp_client_real_hpke_execution_when_consented():
    """Verify consented client executes real RFC 9180 HPKE cryptography."""
    o_client = OHTTPClient(enabled=False)
    res = await o_client.forward_blinded_request(payload={"query": "test"}, user_consented=True)
    assert res["success"] is True
    assert res["ohttp_blinded"] is True
    assert res["relay_status"] == "LOCAL_HPKE_VERIFIED"
    assert "DHKEM(X25519" in res["hpke_crypto"]
    assert res["bytes_encrypted"] > 55
    assert "response" in res


def test_copilot_explainer_cloud_mode_fallback_without_consent():
    """Verify that requesting cloud mode without user consent safely falls back to On-Device SLM."""
    explainer = CopilotExplainer()
    verified_math = {
        "sequence_a": {"name": "Sequence A", "shortfall_risk_pct": 31.4, "ending_balance_expected": 48200},
        "sequence_b": {"name": "Sequence B", "shortfall_risk_pct": 4.2, "ending_balance_expected": 59100, "discretionary_budget_monthly": 12000},
        "declared_reserve_min": 25000,
    }
    # Request cloud_ohttp without consent
    res = explainer.generate_grounded_explanation(
        intent="decision_flip",
        verified_math=verified_math,
        user_mode="cloud_ohttp",
        user_consented=False,
    )
    assert res["audit_passed"] is True
    assert "Sequence B" in res["answer"]
    assert "4.2%" in res["answer"]


def test_faithfulness_audit_catches_hallucinations_in_any_mode():
    """Verify 5-layer regex audit rejects any numbers not present in verified facts."""
    explainer = CopilotExplainer()
    verified_math = {"current_balance": 100000, "item_cost": 15000}
    
    # Text with hallucinated number 99999
    bad_text = "You can spend ₹15,000, but watch out for phantom fee ₹99,999."
    is_faithful, ungrounded = explainer.audit_faithfulness(bad_text, verified_math)
    assert is_faithful is False
    assert 99999.0 in ungrounded


def test_ohttp_config_api_endpoint():
    """Verify GET /api/v1/ohttp/config returns Gateway public key and cryptographic specs."""
    response = client.get("/api/v1/ohttp/config")
    assert response.status_code == 200
    data = response.json()
    assert data["key_id"] == 1
    assert "public_key_hex" in data
    assert len(data["public_key_hex"]) == 64
    assert data["key_type"] == "DHKEM(X25519, HKDF-SHA256)"


def test_ohttp_gateway_and_relay_binary_roundtrip():
    """Verify real binary HPKE encryption through the /relay and /gateway endpoints."""
    gw = GatewayKeyPair.get_default()
    raw_payload = b'{"intent": "decision_flip", "verified_math": {"declared_reserve_min": 25000.0, "sequence_a": {"name": "A", "shortfall_risk_pct": 30}, "sequence_b": {"name": "B", "shortfall_risk_pct": 5}}}'
    
    # 1. Client encapsulates with HPKE
    enc_req, res_key, res_nonce = hpke_encapsulate_and_encrypt(gw.public_bytes, raw_payload)

    # 2. Post to /api/v1/ohttp/relay
    relay_resp = client.post(
        "/api/v1/ohttp/relay",
        content=enc_req,
        headers={"Content-Type": "message/ohttp-req"},
    )
    assert relay_resp.status_code == 200
    assert relay_resp.headers["content-type"] == "message/ohttp-res"
    
    # 3. Client decrypts response
    decrypted_json = hpke_decrypt_response(res_key, res_nonce, relay_resp.content)
    assert b"Sequence B" in decrypted_json or b"status" in decrypted_json or b"answer" in decrypted_json
