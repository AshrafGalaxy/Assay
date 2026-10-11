/**
 * Assay Oblivious HTTP (OHTTP RFC 9458) Blind Relay Worker
 * 
 * Runs on Cloudflare Workers edge nodes globally.
 * Guarantees zero user-identifying metadata reaches the model provider or gateway:
 * 1. Validates binary RFC 9458 `message/ohttp-req` encapsulation.
 * 2. Completely strips client IP headers (`cf-connecting-ip`, `x-real-ip`, `x-forwarded-for`).
 * 3. Strips client cookies, auth tokens, device fingerprints.
 * 4. Blindly proxies binary ciphertext to the Assay Decryption Gateway.
 * 5. Returns binary `message/ohttp-res` to client.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, User-Agent",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // 2. Enforce POST and RFC 9458 Media Type
    if (request.method !== "POST") {
      return new Response("Method Not Allowed. OHTTP Relays only accept POST.", {
        status: 405,
      });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("message/ohttp-req")) {
      return new Response("Invalid Content-Type. Expected message/ohttp-req (RFC 9458).", {
        status: 415,
      });
    }

    // 3. Resolve Target Decryption Gateway URL
    const targetGatewayUrl = env.GATEWAY_URL || request.headers.get("x-target-gateway") || "https://api.assay.finance/api/v1/ohttp/gateway";

    // 4. Read Binary Ciphertext Payload (Client HPKE Encapsulated)
    const ohttpRequestBody = await request.arrayBuffer();

    if (!ohttpRequestBody || ohttpRequestBody.byteLength < 55) {
      return new Response("Bad Request: Malformed or truncated OHTTP payload.", {
        status: 400,
      });
    }

    // 5. Construct Sanitized Blind Relay Headers (STRIP ALL CLIENT IP / IDENTIFIERS)
    const sanitizedHeaders = new Headers();
    sanitizedHeaders.set("Content-Type", "message/ohttp-req");
    sanitizedHeaders.set("User-Agent", "Assay-Cloudflare-Blind-Relay/1.0");
    sanitizedHeaders.set("X-Relay-Privacy", "RFC9458-Blind-Relay");

    // Explicitly ensure NO client-identifying headers are passed:
    // (cf-connecting-ip, x-real-ip, x-forwarded-for, cookie, authorization are omitted)

    try {
      // 6. Blind Forwarding to Decryption Gateway
      const gatewayResponse = await fetch(targetGatewayUrl, {
        method: "POST",
        headers: sanitizedHeaders,
        body: ohttpRequestBody,
      });

      if (!gatewayResponse.ok) {
        return new Response(`Gateway error: ${gatewayResponse.status}`, {
          status: 502,
        });
      }

      const ohttpResponseBody = await gatewayResponse.arrayBuffer();

      // 7. Return Binary Encrypted Response to Client
      return new Response(ohttpResponseBody, {
        status: 200,
        headers: {
          "Content-Type": "message/ohttp-res",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "X-Assay-Privacy-Relay": "Active (IP-Blinded)",
        },
      });
    } catch (error) {
      return new Response(`Blind Relay Failed: ${error.message}`, {
        status: 504,
      });
    }
  },
};
