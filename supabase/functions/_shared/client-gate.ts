// Shared gate for EXTERNAL CLIENTS — software that runs outside our
// infrastructure, holds a member's own Supabase session, and asks the hub two
// questions: "may this member run me?" and "may I read their provider key?".
//
// Two such clients exist: the Raw Footage, Real Story desktop app and the
// UpworkPilot Chrome extension. Each has two Edge Functions
// (<client>-licence, <client>-keys), and all four must establish the same three
// facts before doing anything: who is calling, which tool they are asking about,
// and whether the access engine says they may have it.
//
// Written once here so those four cannot drift — a licence that says "active"
// while the key endpoint says "no access" is the kind of bug that only shows up
// in a user's hands. That argument justified this file when there were two
// functions; it is strictly stronger at four.
//
// WHAT IS PER-CLIENT LIVES IN ./clients/<name>.ts, NOT HERE: the slug, the
// provider allow-list, the rate-limit buckets, the licence TTL. This file holds
// the mechanism; those hold the policy. Nothing here defaults any of them, and
// that is deliberate — see ExternalClient below.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Everything the hub needs to know about one external client.
 *
 * EVERY FIELD IS REQUIRED AND NOTHING HAS A DEFAULT. That is the single most
 * important property of this type, and it is worth the mild inconvenience.
 *
 * A default slug would let a miswired function answer for the wrong tool. A
 * default bucket would let two clients share one rate-limit budget, so a member
 * running both would hit a limit neither would hit alone — and it would look
 * like a bug in whichever one they opened second. A default TTL would be the
 * worst of the three: the desktop app's thirty-day offline window is a
 * deliberate product judgement about someone on a plane, and an extension
 * inheriting it silently would mean a cancelled member keeps working for a
 * month. Each client states its own answer, in its own file, next to the reason.
 */
export type ExternalClient = {
  /**
   * The `tools` row this client IS. Its `aud` on every token, and the subject of
   * its access check.
   *
   * Half of a contract with separately-built software. Changing it silently
   * means every install fails its access check and every cached licence fails
   * `aud` verification. If it must change, ship a client build that accepts both
   * first.
   */
  slug: string;

  /**
   * The providers this client may ever ask for. An allow-list, not a hint: it
   * bounds what a compromised or updated build can request, so a future version
   * cannot quietly start asking for the member's Anthropic key.
   *
   * Deliberately NOT derived from tools.required_providers. That column is
   * edited in the admin tool editor, whose mental model is "which keys does this
   * tool need" — not "which keys may this binary carry off our server". Moving a
   * security boundary into a form field is how it stops being one.
   */
  providers: readonly string[];

  /** Per-endpoint abuse guards. Distinct buckets per client, always. */
  endpoints: {
    licence: RateLimit;
    keys: RateLimit;
  };
};

export type RateLimit = {
  /**
   * The rate_limit_hits bucket prefix. `:user:<uuid>` is appended by gate().
   * MUST be unique per (client, endpoint) — see the no-defaults note above.
   */
  bucket: string;
  limitPerHour: number;
};

/**
 * Why a licence came back inactive — so a client can say the true thing instead
 * of "no active subscription" to someone who has one.
 *
 * This vocabulary is the other half of a contract with every shipped client (see
 * ./clients/desktop.ts for the same warning about its slug): adding a value is
 * safe — an older build falls through to its generic wall — but renaming or
 * removing one is not.
 *
 * It explains `active`; it never decides it. can_access_tool is the only thing
 * that decides, and this is computed only when that engine has already said no.
 *
 *   suspended            The account is suspended. Nothing the member can fix —
 *                        the client should send them to support, not to checkout.
 *   no_membership        No membership row at all. Send them to subscribe.
 *   membership_inactive  A membership row that is expired or revoked. Covers
 *                        BOTH: the member sees "ended", and `expires_at` in the
 *                        same response carries the date to show.
 *   no_access            A live, unsuspended membership that still cannot open
 *                        this tool — it is unpublished, or its access_type is
 *                        manual/plan and this member is not on the list. Ours to
 *                        fix, so the client should say "contact support" rather
 *                        than blame the member's billing.
 */
export type LicenceDenialReason =
  | "suspended"
  | "no_membership"
  | "membership_inactive"
  | "no_access";

/**
 * Derive the reason behind a denial.
 *
 * THE ORDER HERE MIRRORS can_access_tool's OWN ORDER, and that is the whole
 * correctness argument: suspension is checked before membership there (§7,
 * "suspended beats everything, incl. admin"), so it is checked first here too.
 * Reorder this and you get a licence that says `active: false` with
 * `reason: "no_membership"` for a suspended member who is paid up — a wrong
 * answer that sends them to checkout to fix something checkout cannot fix.
 */
export function licenceDenialReason(input: {
  suspended: boolean;
  /** memberships.status, or null when there is no row. */
  membershipStatus: string | null;
  /** memberships.expires_at — null means it never expires. */
  membershipExpiresAt: string | null;
}): LicenceDenialReason {
  if (input.suspended) return "suspended";
  if (!input.membershipStatus) return "no_membership";

  const live =
    input.membershipStatus === "active" || input.membershipStatus === "trialing";

  // Same NaN guard as the exp clamp in hub-jwt.ts: a malformed timestamp must
  // not become "not expired" through a failed comparison.
  const endedAt = input.membershipExpiresAt
    ? new Date(input.membershipExpiresAt).getTime()
    : null;
  const ended =
    endedAt !== null && Number.isFinite(endedAt) && endedAt <= Date.now();

  if (!live || ended) return "membership_inactive";

  return "no_access";
}

export const corsHeaders = {
  // Auth is the bearer token, not a cookie, so there is no CSRF surface to
  // protect with an origin restriction. Same reasoning as key-vault.
  //
  // This holds for a browser extension too, but only while the token stays in
  // the extension's own worker. A content script that carries the session token
  // into a PAGE's context would put a member's bearer token on an origin we do
  // not control, and this line would stop being harmless. Keep the token in the
  // service worker.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function siteUrl(): string {
  return (Deno.env.get("PUBLIC_SITE_URL") ?? "https://buildnlaunchai.com")
    .replace(/\/+$/, "");
}

/**
 * One provider's answer from a <client>-keys endpoint. Shared by every client so
 * the two endpoints cannot answer the same question in two shapes.
 *
 * `consent_url` is REQUIRED on every withheld slot, not optional.
 *
 * It was once set only on `consent_required`, which left the client guessing a
 * URL for the other two reasons — and a guess is a hardcoded copy of a route
 * this repo is free to change. Every "no" now names the page that fixes it, so a
 * client renders the link it was given and never constructs one.
 *
 * The name is kept despite now being wider than consent: shipped software reads
 * this field, and renaming it would break every install already out there for a
 * cosmetic gain. Read it as "where the member goes to fix this".
 *
 * A RELEASED slot carries `manage_url` instead — a separate name, deliberately.
 * Overloading `consent_url` onto a slot with nothing to consent to and nothing
 * to fix would make the field mean two different things depending on a sibling
 * boolean, which is how a client ends up reading it wrong. Every slot carries
 * exactly one URL, and which field it arrives in says what it is for.
 */
export type KeySlot =
  | {
      present: false;
      reason: "no_key" | "consent_required" | "key_invalid" | "credit_mode";
      consent_url: string;
    }
  | { present: true; key: string; manage_url: string };

/**
 * Where a member goes when the answer is `credit_mode`.
 *
 * There is nothing to FIX in credit mode — it is the system working — so this
 * is the one reason whose URL is not a repair. Settings is where a member sees
 * their membership state, which is the thing that explains why no key came
 * back. WHEN THE CREDITS PAGE SHIPS, POINT THIS AT IT: that is the page that
 * will actually answer "how much credit do I have left".
 *
 * Slots are emitted in credit mode at all only so an already-shipped client
 * reading `out[provider].present` finds `false` instead of crashing on
 * undefined. THE TOP-LEVEL `mode` FIELD IS THE REAL SIGNAL — a client must
 * branch on that first and ignore these slots entirely when it reads "credit".
 */
export function creditModeUrl(): string {
  return `${siteUrl()}/dashboard/settings`;
}

/**
 * HOW a member is entitled to run this client, not merely whether.
 *
 * Mirrors the `tool_access_mode` enum in Postgres, and the distinction is the
 * whole reason this file changed:
 *
 *   byok    Active member (or an explicit grant, or a public_preview tool).
 *           They run on their OWN provider key, and the keys endpoints release
 *           it exactly as they always have.
 *   credit  Membership has lapsed, but they hold platform credit. They may run
 *           the client — and their key must NOT be released, because in this
 *           mode WE pay the provider. Releasing it would have the member pay
 *           their provider AND be billed credit for a call we never made.
 *   none    No access at all.
 */
export type ToolAccessMode = "none" | "byok" | "credit";

export type ClientGate =
  | { ok: false; response: Response }
  | {
      ok: true;
      supabase: SupabaseClient;
      userId: string;
      email: string;
      toolId: string;
      /** The access engine's verdict for THIS user on THIS client's tool. */
      mode: ToolAccessMode;
      /**
       * `mode !== 'none'`, kept as its own field because the licence endpoints
       * genuinely only need the boolean: a member in credit mode CAN run the
       * app, so `active` stays true for them and those two functions need no
       * change at all. Only the keys endpoints care which mode it is.
       */
      hasAccess: boolean;
    };

/**
 * Identify the caller, resolve the client's tool, and ask the access engine.
 *
 * Note what is NOT a parameter: there is no user_id. Identity comes from the
 * JWT, verified against the auth server — never from the request. A user_id in
 * a body would be a vulnerability, not a convenience (§10), and no client has
 * any reason to send one.
 *
 * `hasAccess` is returned rather than enforced, because the two endpoints need
 * different things from a "no": a licence endpoint must still mint a signed
 * `active: false` (the client needs a trustworthy negative to cache), while a
 * keys endpoint must refuse outright.
 *
 * `endpoint` selects the rate-limit bucket from the client's own config rather
 * than taking a bucket string, so a call site cannot pair one client's bucket
 * with another's limit.
 */
export async function gate(
  req: Request,
  client: ExternalClient,
  endpoint: keyof ExternalClient["endpoints"],
): Promise<ClientGate> {
  const supabase = serviceClient();

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
  } = await supabase.auth.getUser(jwt);
  if (!user) return { ok: false, response: json({ error: "not authenticated" }, 401) };

  // Abuse guard in Postgres, not memory (§6.13). The numbers live with the
  // client that chose them; what matters here is that the bucket is namespaced
  // per (client, endpoint, user), so two clients never share one budget.
  const { bucket, limitPerHour } = client.endpoints[endpoint];
  const { data: underLimit } = await supabase.rpc("rate_limit_take", {
    p_bucket: `${bucket}:user:${user.id}`,
    p_limit: limitPerHour,
    p_window: "01:00:00",
  });
  if (underLimit === false) {
    return {
      ok: false,
      response: json({ error: "too many requests. Try again shortly." }, 429),
    };
  }

  const { data: tool } = await supabase
    .from("tools")
    .select("id")
    .eq("slug", client.slug)
    .maybeSingle();
  if (!tool) {
    // The seed row is missing — our problem, not the caller's. Fail closed and
    // say nothing about why.
    console.error("client-gate: tool row not found for", client.slug);
    return { ok: false, response: json({ error: "unavailable" }, 503) };
  }

  // tool_access_resolve, not can_access_tool: this gate now needs the MODE, and
  // a boolean cannot say whether a member is entitled through their membership
  // or through their credit balance — which decides whether their key may be
  // released at all.
  //
  // _resolve rather than tool_access(): the public wrapper additionally refuses
  // when the caller is asking about somebody else, which is right for a member
  // calling from the browser and wrong here, where the caller IS the service
  // role and auth.uid() is NULL.
  //
  // uid passed EXPLICITLY, for the same reason as before: the engine defaults it
  // to auth.uid(), which under the service role is NULL — it would answer for
  // nobody. The §7 note about is_admin(uid) taking a subject is the same footgun.
  const { data: mode, error: accessErr } = await supabase.rpc(
    "tool_access_resolve",
    { p_tool_id: tool.id, uid: user.id },
  );
  if (accessErr) {
    console.error("client-gate: access check failed for", client.slug);
    return { ok: false, response: json({ error: "could not check access" }, 500) };
  }

  // An unrecognised mode is treated as 'none'. The engine can only return three
  // values, so this is unreachable — but the failure direction matters: a future
  // fourth mode must lock people out until someone teaches this file what it
  // means, never let them through by default.
  const resolved: ToolAccessMode =
    mode === "byok" || mode === "credit" ? mode : "none";

  return {
    ok: true,
    supabase,
    userId: user.id,
    email: user.email ?? "",
    toolId: tool.id,
    mode: resolved,
    hasAccess: resolved !== "none",
  };
}
