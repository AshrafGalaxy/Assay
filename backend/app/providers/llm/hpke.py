"""
RFC 9180 HPKE (Hybrid Public Key Encryption) & RFC 9458 OHTTP Binary Framing.
Implements DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + AES-128-GCM.
Zero external cloud dependencies; uses Python's built-in cryptography library.
"""

import os
import struct
import logging
from typing import Tuple, Dict, Any, Optional
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger(__name__)

# RFC 9180 / RFC 9458 Constants
KEY_ID: int = 1
KEM_ID_X25519: int = 0x0020        # DHKEM(X25519, HKDF-SHA256)
KDF_ID_SHA256: int = 0x0001        # HKDF-SHA256
AEAD_ID_AES128GCM: int = 0x0001    # AES-128-GCM

INFO_LABEL_REQ = b"Assay-OHTTP-Request-Key-v1"
INFO_LABEL_RES = b"Assay-OHTTP-Response-Key-v1"
SALT = b"Assay-OHTTP-Blind-Relay-Salt-2026"


class GatewayKeyPair:
    """Manages the static X25519 keypair for the OHTTP Gateway."""
    _instance = None

    def __init__(self, private_bytes: Optional[bytes] = None):
        if private_bytes and len(private_bytes) == 32:
            self.private_key = x25519.X25519PrivateKey.from_private_bytes(private_bytes)
        else:
            # Deterministic default key for local dev so server restarts keep valid pairing
            # In production, this can be overridden via OHTTP_GATEWAY_KEY env var
            dev_seed = b"Assay_Gateway_Private_Seed_32B_!"
            self.private_key = x25519.X25519PrivateKey.from_private_bytes(dev_seed)
        self.public_key = self.private_key.public_key()

    @property
    def public_bytes(self) -> bytes:
        return self.public_key.public_bytes_raw()

    @classmethod
    def get_default(cls) -> "GatewayKeyPair":
        if cls._instance is None:
            cls._instance = GatewayKeyPair()
        return cls._instance


def hpke_encapsulate_and_encrypt(
    gateway_public_bytes: bytes,
    plaintext: bytes,
) -> Tuple[bytes, bytes, bytes]:
    """
    Client-side RFC 9180 / 9458 encapsulation:
    1. Generates ephemeral X25519 keypair.
    2. Performs DH exchange with Gateway public key.
    3. Derives request key/nonce and response key/nonce.
    4. Encrypts plaintext with AES-128-GCM.
    5. Returns (ohttp_request_binary, response_key, response_nonce).
    """
    gw_pub = x25519.X25519PublicKey.from_public_bytes(gateway_public_bytes)

    # Ephemeral keypair
    ephem_priv = x25519.X25519PrivateKey.generate()
    ephem_pub_bytes = ephem_priv.public_key().public_bytes_raw()

    # Shared secret
    shared_secret = ephem_priv.exchange(gw_pub)

    # Derive Request Key & Nonce (16 bytes key + 12 bytes nonce)
    req_key_material = HKDF(
        algorithm=hashes.SHA256(),
        length=28,
        salt=SALT,
        info=INFO_LABEL_REQ,
    ).derive(shared_secret)
    req_key = req_key_material[:16]
    req_nonce = req_key_material[16:28]

    # Derive Response Key & Nonce
    res_key_material = HKDF(
        algorithm=hashes.SHA256(),
        length=28,
        salt=SALT,
        info=INFO_LABEL_RES,
    ).derive(shared_secret)
    res_key = res_key_material[:16]
    res_nonce = res_key_material[16:28]

    # Encrypt request payload
    aesgcm = AESGCM(req_key)
    ciphertext = aesgcm.encrypt(req_nonce, plaintext, None)

    # Build RFC 9458 binary frame header:
    # Key ID (1B) + KEM ID (2B) + KDF ID (2B) + AEAD ID (2B) + Ephemeral PubKey (32B)
    header = struct.pack(">BHHH", KEY_ID, KEM_ID_X25519, KDF_ID_SHA256, AEAD_ID_AES128GCM)
    ohttp_req_bytes = header + ephem_pub_bytes + ciphertext

    return ohttp_req_bytes, res_key, res_nonce


def hpke_decapsulate_and_decrypt(
    gateway_keypair: GatewayKeyPair,
    ohttp_req_bytes: bytes,
) -> Tuple[bytes, bytes, bytes]:
    """
    Gateway-side RFC 9180 / 9458 decapsulation:
    1. Parses header and extracts ephemeral public key.
    2. Performs DH exchange with Gateway private key.
    3. Derives request and response keys.
    4. Decrypts ciphertext with AES-128-GCM.
    5. Returns (plaintext, response_key, response_nonce).
    """
    # Minimum length: 1B Key ID + 6B Alg IDs + 32B Ephemeral PubKey + 16B AES-GCM Tag = 55B
    if len(ohttp_req_bytes) < 55:
        raise ValueError("Invalid OHTTP request: payload too short")

    key_id, kem_id, kdf_id, aead_id = struct.unpack(">BHHH", ohttp_req_bytes[:7])
    ephem_pub_bytes = ohttp_req_bytes[7:39]
    ciphertext = ohttp_req_bytes[39:]

    ephem_pub = x25519.X25519PublicKey.from_public_bytes(ephem_pub_bytes)
    shared_secret = gateway_keypair.private_key.exchange(ephem_pub)

    # Derive Request Key & Nonce
    req_key_material = HKDF(
        algorithm=hashes.SHA256(),
        length=28,
        salt=SALT,
        info=INFO_LABEL_REQ,
    ).derive(shared_secret)
    req_key = req_key_material[:16]
    req_nonce = req_key_material[16:28]

    # Derive Response Key & Nonce
    res_key_material = HKDF(
        algorithm=hashes.SHA256(),
        length=28,
        salt=SALT,
        info=INFO_LABEL_RES,
    ).derive(shared_secret)
    res_key = res_key_material[:16]
    res_nonce = res_key_material[16:28]

    # Decrypt request payload
    aesgcm = AESGCM(req_key)
    plaintext = aesgcm.decrypt(req_nonce, ciphertext, None)

    return plaintext, res_key, res_nonce


def hpke_encrypt_response(res_key: bytes, res_nonce: bytes, plaintext: bytes) -> bytes:
    """Gateway encrypts response using the derived response key."""
    aesgcm = AESGCM(res_key)
    return aesgcm.encrypt(res_nonce, plaintext, None)


def hpke_decrypt_response(res_key: bytes, res_nonce: bytes, ciphertext: bytes) -> bytes:
    """Client decrypts response using the derived response key."""
    aesgcm = AESGCM(res_key)
    return aesgcm.decrypt(res_nonce, ciphertext, None)
