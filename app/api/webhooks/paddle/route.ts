import { NextResponse } from "next/server";

import { clientIp, ipAllowed } from "@/lib/paddle/ip-allowlist";
import { verifyPaddleSignature } from "@/lib/paddle/signature";
import { createAdminClient } from "@/lib/supabase/admin";

// The ONLY route under app/api — the webhook the spec sanctions ("no API routes
// unless there is a webhook to receive"). node:crypto needs the Node runtime;
// a webhook is never static.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaddleEvent = {
  event_id?: string;
  event_type?: string;
  data?: {
    id?: string; // sub_… on subscription.*; txn_… on transaction.*
    subscription_id?: string; // present on transaction.*
    custom_data?: { user_id?: string } | null;
  };
};

/**
 * Paddle Billing webhook. Order matters and is the security model:
 *   1. HMAC-verify the RAW body — reject 401 before touching anything.
 *   2. Hand the event to process_paddle_event(), which claims it (the
 *      paddle_events PK is the concurrency gate) and applies the membership
 *      effect in ONE transaction. A concurrent duplicate returns 'deduped'
 *      without re-processing; any failure rolls the claim back, so a 500 here
 *      lets Paddle's retry re-run cleanly. Nothing is half-processed or orphaned.
 *
 * The write happens before the 200 on purpose (acking first then freezing would
 * lose it with no retry); it's one RPC round-trip, no slow work to defer. When
 * Phase 8 adds emails, those go after the ack via waitUntil.
 */
export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  // Source-IP allowlist — defence in depth, IN ADDITION TO the HMAC check below,
  // never instead of it. Rejects anything not from Paddle before we read the body
  // or do crypto. A null (undeterminable) IP defers to HMAC. Set
  // PADDLE_IP_ENFORCE=false to run log-only (monitor mode) — deploy that way first
  // to confirm real deliveries arrive on allowlisted IPs, then enforce.
  const ip = clientIp(req.headers);
  if (!ipAllowed(ip)) {
    console.warn(`[paddle] webhook from non-allowlisted IP: ${ip ?? "unknown"}`);
    if (process.env.PADDLE_IP_ENFORCE !== "false") {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  const raw = await req.text();
  const signature = req.headers.get("paddle-signature");
  if (!verifyPaddleSignature(raw, signature, secret)) {
    // An unsigned/forged body never reaches the DB.
    return new NextResponse("invalid signature", { status: 401 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const eventId = event.event_id;
  const eventType = event.event_type;
  if (!eventId || !eventType) {
    return new NextResponse("missing event_id or event_type", { status: 400 });
  }

  const data = event.data ?? {};
  const userId = data.custom_data?.user_id ?? null;
  const subscriptionId = data.id ?? data.subscription_id ?? null;

  // Atomic claim + membership effect (see the migration). service_role only.
  // The p_user_id / p_subscription_id params are nullable in the SQL (uuid/text,
  // no default) — passing null is the intended path for an event that carries
  // neither — but Supabase codegen types params-without-a-default as required
  // strings, so the two nullable args are cast to bridge that quirk.
  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("process_paddle_event", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_user_id: userId as string,
    p_subscription_id: subscriptionId as string,
  });

  if (error) {
    // Claim rolled back with the transaction — Paddle's retry re-runs cleanly.
    console.error("[paddle] processing failed", error);
    return new NextResponse("processing error", { status: 500 });
  }

  return NextResponse.json({ ok: true, result });
}
