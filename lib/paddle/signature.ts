import "server-only";

import crypto from "node:crypto";

/**
 * Verify a Paddle Billing webhook signature (the `Paddle-Signature` header).
 *
 * Header format: `ts=<unix>;h1=<hex hmac>`. The signed payload is
 * `${ts}:${rawBody}` and the MAC is HMAC-SHA256 keyed with the notification
 * destination's secret. The RAW request body must be used — any re-serialization
 * of the parsed JSON changes the bytes and breaks the MAC.
 *
 * We do NOT reject on `ts` age: Paddle retries a failed delivery for up to three
 * days, so an old timestamp is a legitimate retry, not an attack. Replay is
 * handled downstream by the paddle_events idempotency table, not here.
 */
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const parts: Record<string, string> = {};
  for (const kv of signatureHeader.split(";")) {
    const i = kv.indexOf("=");
    if (i === -1) continue;
    parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  // Constant-time compare. Buffer.from(hex) yields an empty/short buffer for
  // malformed hex, which the length guard rejects before timingSafeEqual.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(h1, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
