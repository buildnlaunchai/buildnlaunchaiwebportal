// Shared gate for the desktop-app functions (desktop-licence, desktop-keys).
//
// Both answer questions for a native app holding a member's own Supabase JWT,
// and both must establish the same three facts before doing anything: who is
// calling, which tool they are asking about, and whether the access engine says
// they may have it. Written once here so the two functions cannot drift — a
// licence that says "active" while the key endpoint says "no access" is the
// kind of bug that only shows up in a user's hands.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * The desktop app's tool slug. Also the `aud` of every licence token it gets,
 * so a token minted here is useless against any other app in the estate.
 *
 * This string is half of a contract with a separately built desktop binary.
 * Changing it silently means every install fails its access check and every
 * cached licence fails `aud` verification. If it must change, ship a desktop
 * build that accepts both first.
 */
export const DESKTOP_TOOL_SLUG = "raw-footage-real-story";

/** The providers the desktop app may ever ask for. An allow-list, not a hint:
 *  it bounds what a compromised or updated binary can request, so a future
 *  version cannot quietly start asking for the member's Anthropic key. */
export const DESKTOP_PROVIDERS = ["openai", "elevenlabs"] as const;
export type DesktopProvider = (typeof DESKTOP_PROVIDERS)[number];

export const corsHeaders = {
  // Auth is the bearer token, not a cookie, so there is no CSRF surface to
  // protect with an origin restriction. Same reasoning as key-vault.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

export type DesktopGate =
  | { ok: false; response: Response }
  | {
      ok: true;
      supabase: SupabaseClient;
      userId: string;
      email: string;
      toolId: string;
      /** The access engine's verdict for THIS user on the desktop tool. */
      hasAccess: boolean;
    };

/**
 * Identify the caller, resolve the desktop tool, and ask the access engine.
 *
 * Note what is NOT a parameter: there is no user_id. Identity comes from the
 * JWT, verified against the auth server — never from the request. A user_id in
 * a body would be a vulnerability, not a convenience (§10), and the desktop
 * app has no reason to send one.
 *
 * `hasAccess` is returned rather than enforced, because the two callers need
 * different things from a "no": desktop-licence must still mint a signed
 * `active: false` (the app needs a trustworthy negative to cache), while
 * desktop-keys must refuse outright.
 */
export async function gate(req: Request, rateLimitBucket: string): Promise<DesktopGate> {
  const supabase = serviceClient();

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
  } = await supabase.auth.getUser(jwt);
  if (!user) return { ok: false, response: json({ error: "not authenticated" }, 401) };

  // Abuse guard in Postgres, not memory (§6.13). A desktop app checks its
  // licence on launch and occasionally after, so this cap is far above real use
  // and only bites a script.
  const { data: underLimit } = await supabase.rpc("rate_limit_take", {
    p_bucket: `${rateLimitBucket}:user:${user.id}`,
    p_limit: 120,
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
    .eq("slug", DESKTOP_TOOL_SLUG)
    .maybeSingle();
  if (!tool) {
    // The seed row is missing — our problem, not the caller's. Fail closed and
    // say nothing about why.
    console.error("desktop: tool row not found for", DESKTOP_TOOL_SLUG);
    return { ok: false, response: json({ error: "unavailable" }, 503) };
  }

  // uid passed EXPLICITLY. can_access_tool defaults it to auth.uid(), which
  // under the service role is NULL — the engine would answer for nobody. The
  // §7 note about is_admin(uid) taking a subject is the same footgun.
  const { data: hasAccess, error: accessErr } = await supabase.rpc(
    "can_access_tool",
    { p_tool_id: tool.id, uid: user.id },
  );
  if (accessErr) {
    console.error("desktop: access check failed");
    return { ok: false, response: json({ error: "could not check access" }, 500) };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    email: user.email ?? "",
    toolId: tool.id,
    hasAccess: hasAccess === true,
  };
}
