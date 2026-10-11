# Assay Oblivious HTTP (OHTTP RFC 9458) Blind Relay

This directory contains the production-ready **Cloudflare Worker** script for Assay's Oblivious HTTP (OHTTP RFC 9458) blind relay.

## How It Works
1. **Client Encryption (HPKE)**: The mobile client encrypts the verified financial proof using the Gateway's public key (DHKEM(X25519) + AES-128-GCM).
2. **Untrusted Blind Relay (This Worker)**: 
   - Accepts binary `message/ohttp-req`.
   - Strips client IP (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`), cookies, and device identifiers.
   - Forwards raw ciphertext bytes to the Assay Decryption Gateway.
   - **Privacy Guarantee**: The relay has NO private key, so it **cannot** read the financial query.
3. **Decryption Gateway (`/api/v1/ohttp/gateway`)**:
   - Decrypts HPKE payload with its private key.
   - **Privacy Guarantee**: The gateway only sees the Cloudflare Worker's IP address, never the client's IP.

---

## Deployment (Zero Manual Credentials for Local Dev)

### 1. Local Development (Zero Credentials Needed)
Assay includes a local Blind Relay (`/api/v1/ohttp/relay`) right inside the FastAPI backend. You do **not** need a Cloudflare account or any paid tokens to run or demo the app locally—real HPKE crypto executes self-contained out-of-the-box!

### 2. Live Cloudflare Workers Deployment (Optional)
If you wish to deploy this worker live onto Cloudflare's global edge network:
```bash
# 1. Install Wrangler CLI
npx wrangler login

# 2. Deploy to Cloudflare Workers
npx wrangler deploy

# 3. Copy the resulting worker URL (e.g., https://assay-ohttp-relay.yoursubdomain.workers.dev)
# and paste it into your backend .env:
# OHTTP_ENABLED=true
# OHTTP_RELAY_URL=https://assay-ohttp-relay.yoursubdomain.workers.dev
```
