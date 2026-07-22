import { NextResponse } from "next/server";

import { verifyPaddleSignature } from "@/lib/paddle/signature";
import { processPaddleEvent } from "@/lib/paddle/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

// The ONLY route under app/api — the webhook the spec sanctions ("no API routes
// unless there is a webhook to receive"). node:crypto needs the Node runtime;
// a webhook is never static.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paddle Billing webhook. Order matters and is the security model:
 *   1. HMAC-verify the RAW body — reject 401 before touching anything.
 *   2. Idempotency: if event_id is already in paddle_events, ack and stop.
 *   3. Process (idempotent membership writes). Membership state is written
 *      BEFORE the 200 on purpose — if we acked first and the function froze, the
 *      write would be lost and Paddle would not retry. The work is two DB writes,
 *      no external I/O, well under Paddle's timeout, so there is no slow work to
 *      defer. (When Phase 8 adds emails, those go after the ack via waitUntil.)
 *   4. Record the event, then 200.
 * A throw in step 3 returns 500 WITHOUT recording the event, so Paddle's retry
 * re-runs it cleanly.
 */
export async function POST(req: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set");
    return new NextResponse("not configured", { status: 500 });
  }

  const raw = await req.text();
  const signature = req.headers.get("paddle-signature");

  if (!verifyPaddleSignature(raw, signature, secret)) {
    // 401, and nothing else happens. An unsigned/forged body never reaches the DB.
    return new NextResponse("invalid signature", { status: 401 });
  }

  let event: { event_id?: string; event_type?: string; data?: unknown };
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

  const admin = createAdminClient();

  // Idempotency check — Paddle retries deliveries, so a replay is a fast no-op.
  const { data: seen } = await admin
    .from("paddle_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (seen) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    await processPaddleEvent(
      event as Parameters<typeof processPaddleEvent>[0],
    );
  } catch (err) {
    // Do NOT record the event — let Paddle retry into a clean re-run.
    console.error("[paddle] processing failed", err);
    return new NextResponse("processing error", { status: 500 });
  }

  // Record it. ON CONFLICT DO NOTHING absorbs the concurrent-delivery race (two
  // deliveries of the same event both processed idempotently; only one row lands).
  const { error: recordErr } = await admin
    .from("paddle_events")
    .upsert(
      { event_id: eventId, event_type: eventType },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  if (recordErr) {
    // The membership write already succeeded; a failed record just means a future
    // retry re-processes idempotently. Log, still ack.
    console.error("[paddle] failed to record event for idempotency", recordErr);
  }

  return NextResponse.json({ ok: true });
}
