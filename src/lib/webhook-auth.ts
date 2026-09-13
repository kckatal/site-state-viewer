/**
 * Webflow only sends `x-webflow-signature` / `x-webflow-timestamp` for webhooks
 * registered by an OAuth App, and the HMAC key is that app's client secret.
 * Webhooks registered with a site token (what this project uses) arrive
 * unsigned, so the endpoint is authenticated by a secret embedded in its URL
 * instead. Signature checking still runs whenever a secret is configured.
 */

const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function isAuthorizedCaller(provided: string | null): boolean {
  const expected = process.env.WEBHOOK_PATH_SECRET;
  if (!expected) return false;
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

export async function hasValidSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  const secret = process.env.WEBFLOW_CLIENT_SECRET;
  if (!secret) return true; // nothing to verify against
  if (!signature || !timestamp) return false;

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age > SIGNATURE_MAX_AGE_MS || age < -SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}:${rawBody}`)
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(expected, signature);
}
