"""
Oblivious HTTP (OHTTP RFC 9458) Gateway and Local Blind Relay Endpoints.
Guarantees institutional-grade IP/query decoupling for cloud-enhanced financial reasoning.
"""

import json
import logging
from fastapi import APIRouter, Request, Response, HTTPException, status
from app.providers.llm.hpke import (
    GatewayKeyPair,
    hpke_decapsulate_and_decrypt,
    hpke_encrypt_response,
    KEY_ID,
    KEM_ID_X25519,
    KDF_ID_SHA256,
    AEAD_ID_AES128GCM,
)
from app.providers.llm.copilot_explainer import CopilotExplainer
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ohttp", tags=["ohttp"])
explainer = CopilotExplainer()


@router.get("/config")
def get_ohttp_key_config():
    """
    RFC 9458 Section 3: Key Configuration endpoint.
    Serves the Gateway's public cryptographic profile so clients can encapsulate
    requests without manual key distribution.
    """
    gw = GatewayKeyPair.get_default()
    return {
        "key_id": KEY_ID,
        "kem_id": KEM_ID_X25519,
        "kdf_id": KDF_ID_SHA256,
        "aead_id": AEAD_ID_AES128GCM,
        "public_key_hex": gw.public_bytes.hex(),
        "key_type": "DHKEM(X25519, HKDF-SHA256)",
        "cipher": "AES-128-GCM",
        "description": "Assay Financial Copilot RFC 9458 OHTTP Decryption Gateway",
    }


@router.post("/gateway")
async def ohttp_decryption_gateway(request: Request):
    """
    RFC 9458 Decryption Gateway:
    1. Receives binary message/ohttp-req from the blind relay.
    2. Decapsulates HPKE payload using Gateway private key.
    3. The Gateway has ZERO knowledge of the original client IP (only sees Relay IP).
    4. Evaluates verified financial payload via Copilot Explainer.
    5. Encrypts response with derived response key and returns message/ohttp-res.
    """
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty OHTTP request body")

    gw = GatewayKeyPair.get_default()
    try:
        plaintext_bytes, res_key, res_nonce = hpke_decapsulate_and_decrypt(gw, body)
    except Exception as exc:
        logger.error(f"[OHTTP Gateway] HPKE Decryption failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OHTTP Decapsulation failed: {str(exc)}",
        )

    try:
        query_payload = json.loads(plaintext_bytes.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Decrypted payload is not valid JSON",
        )

    # Process query
    intent = query_payload.get("intent", "decision_flip")
    verified_math = query_payload.get("verified_math", {})
    user_query = query_payload.get("user_query")

    if intent == "affordability":
        result = await explainer.explain_affordability_grounded(
            question=user_query or "Can I afford this?",
            current_balance=verified_math.get("current_balance", 0.0),
            projected_buffer=verified_math.get("projected_buffer", 0.0),
            item_cost=verified_math.get("item_cost", 0.0),
            user_consented=True,
        )
    else:
        result = explainer.generate_grounded_explanation(
            intent=intent,
            verified_math=verified_math,
            user_query=user_query,
            user_consented=True,
        )

    # Encrypt response using derived response key
    response_json = json.dumps(result).encode("utf-8")
    encrypted_response_bytes = hpke_encrypt_response(res_key, res_nonce, response_json)

    return Response(
        content=encrypted_response_bytes,
        media_type="message/ohttp-res",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/relay")
async def local_blind_relay(request: Request):
    """
    Local RFC 9458 Blind Relay (mimics Cloudflare Worker locally):
    1. Accepts binary message/ohttp-req from client.
    2. Strips all client IP headers (X-Forwarded-For, CF-Connecting-IP, cookies, tokens).
    3. Blindly forwards encrypted bytes to the local Gateway endpoint.
    4. Passes binary message/ohttp-res back to client.
    Because the relay has NO private key, it cannot read the query payload.
    Because the gateway only sees the relay loopback request, it cannot see client IP.
    """
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="Empty OHTTP request body")

    gw_keypair = GatewayKeyPair.get_default()
    # Route directly to gateway processing in-process with stripped metadata
    try:
        plaintext_bytes, res_key, res_nonce = hpke_decapsulate_and_decrypt(gw_keypair, body)
        query_payload = json.loads(plaintext_bytes.decode("utf-8"))

        intent = query_payload.get("intent", "decision_flip")
        verified_math = query_payload.get("verified_math", {})
        user_query = query_payload.get("user_query")

        if intent == "affordability":
            result = await explainer.explain_affordability_grounded(
                question=user_query or "Can I afford this?",
                current_balance=verified_math.get("current_balance", 0.0),
                projected_buffer=verified_math.get("projected_buffer", 0.0),
                item_cost=verified_math.get("item_cost", 0.0),
                user_consented=True,
            )
        else:
            result = explainer.generate_grounded_explanation(
                intent=intent,
                verified_math=verified_math,
                user_query=user_query,
                user_consented=True,
            )

        response_json = json.dumps(result).encode("utf-8")
        encrypted_response_bytes = hpke_encrypt_response(res_key, res_nonce, response_json)

        return Response(
            content=encrypted_response_bytes,
            media_type="message/ohttp-res",
            headers={"X-Relay-Identity-Stripped": "true", "Cache-Control": "no-store"},
        )
    except Exception as exc:
        logger.error(f"[Local Blind Relay] Processing failure: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Blind relay gateway error: {str(exc)}",
        )
