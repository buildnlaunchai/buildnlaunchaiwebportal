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
  DESKTOP_TOOL_SLUG,
  corsHeaders,
  gate,
  json,
} from "../_shared/desktop.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const g = await gate(req, "desktop_licence");
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

    const { token, expiresAt: tokenExpiresAt, checkedAt } = await mintLicenceToken({
      userId: g.userId,
      email: g.email,
      audience: DESKTOP_TOOL_SLUG,
      active: g.hasAccess,
      plan,
      membershipExpiresAt: expiresAt,
    });

    return json({
      active: g.hasAccess,
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
