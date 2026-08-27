// ElevenLabs' read-only endpoints, forwarded on our key.
//
// ─── THIS FILE OPENS NO HOLD, SETTLES NOTHING, AND WRITES NO LEDGER ROW ──────
//
// That is not an omission and it is not a shortcut. These two endpoints return
// a voice list and a model list. They cost nothing, so there is nothing to
// meter, and metering nothing would produce a credit_ledger row saying a call
// cost $0 — which is worse than no row: it makes the ledger, the one place that
// answers "what did this member spend", contain entries that are not spending.
//
// NOTE WHAT IS ABSENT FROM THE IMPORTS BELOW: ../hold.ts. If you are here to add
// metering, the question to answer first is what you would be metering — and if
// the honest answer is "nothing, but it felt consistent", the inconsistency is
// the correct one. A route that spends money and a route that reads a list are
// not the same kind of thing and should not have the same shape.
//
// ─── WHY IT EXISTS AT ALL ────────────────────────────────────────────────────
//
// A member on credit has no ElevenLabs key — that is the whole point of the
// mode. Without these two, the desktop app has no voice list, and without a
// voice list there is no narration. So credit mode was not shippable for that
// app until this existed. The gateway routes the one call that spends money
// because it must be metered; it routes these two because the app cannot work
// without them.
//
// ─── WHY /v1/user/subscription IS NOT HERE ───────────────────────────────────
//
// Deliberately, and it should stay that way. That endpoint reports the quota on
// the key that made the call — which in credit mode is OURS. Forwarding it would
// show a member our account's balance: a leak, and a confusing one, since the
// number that means anything to them is their credit balance, which they can
// already read from the hub. The app skips the call in credit mode instead.

import { json } from "../../_shared/client-gate.ts";
import type { RouteContext } from "../index.ts";
import { logProviderFailure, safeProviderError } from "../sanitize.ts";
import { elevenLabsBase } from "../upstream.ts";

/**
 * Its own budget, on top of the per-client gateway limit the gate already took.
 *
 * Two guards, because they bound different things. The gateway limit bounds a
 * member's total traffic; this one bounds METADATA specifically, so a client
 * stuck in a refresh loop cannot eat the budget its narration run needs — and,
 * separately, cannot make unlimited calls on our key just because they are free
 * to us. Free is not the same as unlimited.
 *
 * Sixty an hour against a list fetched on launch and on a manual refresh: far
 * above any real use, far below a runaway.
 */
const READS_PER_HOUR = 60;

/** Exactly what may be forwarded. An allow-list, not a prefix match. */
const ALLOWED = new Set(["/v2/voices", "/v1/models"]);

export async function handleElevenLabsRead(ctx: RouteContext): Promise<Response> {
  const { g, providerKey } = ctx;

  // The path AFTER /elevenlabs, which is what the allow-list is written in.
  const path = ctx.url.pathname.replace(/^.*\/elevenlabs/, "");
  if (!ALLOWED.has(path)) {
    // Unreachable through the router, which matches these exactly. Kept because
    // this function reads `ctx.url` itself, and a future route added upstream
    // must not be able to turn this into an open proxy for our key.
    return json({ error: "no such route", code: "not_found" }, 404);
  }

  const { data: underLimit } = await g.supabase.rpc("rate_limit_take", {
    p_bucket: `ai_gateway_reads:user:${g.userId}`,
    p_limit: READS_PER_HOUR,
    p_window: "01:00:00",
  });
  if (underLimit === false) {
    return json(
      {
        error: "Too many list requests in the last hour. Try again shortly.",
        code: "too_many_reads",
      },
      429,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${elevenLabsBase()}${path}${ctx.url.search}`, {
      headers: { "xi-api-key": providerKey },
    });
  } catch {
    return json(
      {
        error: "Couldn't reach ElevenLabs. Try again.",
        code: "provider_unreachable",
      },
      502,
    );
  }

  if (!upstream.ok) {
    logProviderFailure("elevenlabs", path, upstream.status);
    const safe = await safeProviderError(upstream, "elevenlabs");
    return json(safe.body, safe.status);
  }

  // Forwarded verbatim, so the client sees exactly what ElevenLabs would have
  // sent it. Nothing here is secret: it is a public catalogue.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
