// The desktop-licence Edge Function.
//
// Answers "is this user entitled to run Raw Footage, Real Story" and returns
// the answer SIGNED, so the desktop app can cache it and keep working offline.
//
// Why signed at all, since the caller already authenticated: the response is
// written to disk on a machine the user controls. An unsigned JSON cache is a
// text file with `"active": false` in it, one edit away from `true`. The
// signature is what makes the cache tamper-evident. It is RS256 with the hub's
// existing key (_shared/hub-jwt.ts) — the desktop binary carries only the
// public half, which can verify and cannot forge.
//
// It is worth being precise about what this function does NOT do: it is not a
// new access path. It reads can_access_tool for the caller it cryptographically
// identified, live, on every call. Nothing is cached server-side, so a revoked
// membership is honoured by the next check — bounded by the token's own exp,
// which is what the offline window costs and why it is thirty days and not a
// year.

import { mintLicenceToken } from "../_shared/hub-jwt.ts";
import {
  type LicenceDenialReason,
  corsHeaders,
  gate,
  json,
  licenceDenialReason,
} from "../_shared/client-gate.ts";
import {
  DESKTOP,
  DESKTOP_LICENCE_INACTIVE_TTL_SECONDS,
  DESKTOP_LICENCE_TTL_SECONDS,
} from "../_shared/clients/desktop.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const g = await gate(req, DESKTOP, "licence");
  if (!g.ok) return g.response;

  try {
    // The membership row, for the plan slug and the real expiry date. Read even
    // when access is denied: a member whose plan lapsed yesterday should see
    // "expired on the 17th", not a blank. can_access_tool has already decided
    // `active` — this is only the detail behind it.
    const { data: membership } = await g.supabase
      .from("memberships")
      .select("status, expires_at, plan_id, plans(slug)")
      .eq("user_id", g.userId)
      .maybeSingle();

    // The join comes back as an object or a one-element array depending on how
    // PostgREST resolves the relationship; accept both rather than silently
    // reporting a null plan on a perfectly good membership.
    const planRel = (membership as { plans?: unknown } | null)?.plans;
    const plan =
      (Array.isArray(planRel)
        ? (planRel[0] as { slug?: string } | undefined)?.slug
        : (planRel as { slug?: string } | undefined)?.slug) ?? null;

    const expiresAt = (membership?.expires_at as string | null) ?? null;

    // WHY it is a no. Only on the denial path: an entitled member costs no
    // extra round trip, and a denied one is already looking at a wall.
    //
    // is_suspended is read here rather than carried by gate() because gate()
    // serves desktop-keys too, which refuses outright and has no use for it —
    // the shared gate should not buy a column for a caller that never reads it.
    let reason: LicenceDenialReason | null = null;
    if (!g.hasAccess) {
      const { data: profile } = await g.supabase
        .from("profiles")
        .select("is_suspended")
        .eq("id", g.userId)
        .maybeSingle();

      reason = licenceDenialReason({
        suspended: profile?.is_suspended === true,
        membershipStatus: (membership?.status as string | null) ?? null,
        membershipExpiresAt: expiresAt,
        // Without this, a lapsed member holding credit is told
        // `membership_inactive` when credit mode is switched off — true, and not
        // the reason. Their membership has been inactive for weeks and they were
        // running yesterday. The client would offer to renew the one thing that
        // was never in the way.
        creditDenial: g.creditDenial,
      });
    }

    const { token, expiresAt: tokenExpiresAt, checkedAt } = await mintLicenceToken({
      userId: g.userId,
      email: g.email,
      audience: DESKTOP.slug,
      active: g.hasAccess,
      plan,
      membershipExpiresAt: expiresAt,
      reason,
      // Thirty days / one hour. Stated here rather than defaulted, because the
      // right number is a property of THIS client — see _shared/clients/desktop.ts.
      ttlSeconds: DESKTOP_LICENCE_TTL_SECONDS,
      inactiveTtlSeconds: DESKTOP_LICENCE_INACTIVE_TTL_SECONDS,
    });

    return json({
      active: g.hasAccess,
      // Mirrors the signed `reason` claim. null whenever active is true.
      reason,
      plan,
      // The MEMBERSHIP's expiry — null means "never expires". Not the same date
      // as cache_expires_at below, and the desktop app must not conflate them.
      expires_at: expiresAt,
      checked_at: checkedAt,
      // How long the signed answer may be trusted without contacting us.
      cache_expires_at: tokenExpiresAt,
      licence_token: token,
    });
  } catch (err) {
    // Never leak detail: an error here could otherwise carry key material or
    // the shape of the signing setup.
    console.error("desktop-licence error:", (err as Error).message);
    return json({ error: "something went wrong" }, 500);
  }
});
