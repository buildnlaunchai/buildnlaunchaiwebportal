// The embed-token Edge Function (CLAUDE.md §13, Phase 11).
//
// Mints the short-lived RS256 token that lets an `iframe` tool trust the hub's
// word about who a user is and what they may open. It lives here, not in a
// Server Action, for exactly the reason the key vault does: HUB_JWT_PRIVATE_KEY
// must never exist on Vercel. Vercel relays the request and receives a token —
// it never holds the key that made it, so a total compromise of the Vercel
// project cannot forge one.
//
// THIS FUNCTION IS NOT A NEW ACCESS PATH. It is a READ of the access engine.
// Two properties keep it that way, and both must survive any future edit:
//
//   1. Identity comes from the caller's own JWT, verified against the auth
//      server — never from the body. A `user_id` in the payload is ignored. So
//      even our own backend cannot ask for a token as somebody else.
//   2. Access is re-derived live from accessible_tool_ids(uid) on every mint,
//      with the service role. Nothing is persisted and nothing is cached, so a
//      revoked grant is honoured by the next token — never by a stale row.
//
// The strongest thing to notice: this function grants a caller nothing the hub
// would not already hand them at /dashboard/tools/<slug>. That is why it needs
// no shared-secret gate the way run-tool does — run-tool acts on a run row that
// was already authorized elsewhere, while this one authorizes from scratch,
// against the engine, for the caller it cryptographically identified.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { mintHubToken } from "../_shared/hub-jwt.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Which tool slugs an embedded app may be told about.
 *
 * Today an iframe app IS one tool, so the audience is the tool's slug and the
 * scope is that one slug. The indirection exists because the alternative —
 * shipping every slug the user can reach — would mean a token minted for the
 * animator also names every other tool they own. Scoping keeps a token useless
 * anywhere but the app it was minted for, which is what makes `aud` enforcement
 * on the app side meaningful rather than decorative.
 *
 * If an app ever hosts several hub tools, this becomes a real lookup (an app_id
 * on `tools`, and the intersection below stops being a one-element set). Not
 * built now: there is no such app, and inventing the column would be inventing
 * scope.
 */
function scopedSlugsFor(audienceSlug: string, accessible: boolean): string[] {
  return accessible ? [audienceSlug] : [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- 1. Identity: from the JWT, verified. Never from the body. ----------
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
  } = await supabase.auth.getUser(jwt);
  if (!user) return json({ error: "not authenticated" }, 401);

  let body: { tool_slug?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const slug = body.tool_slug?.trim();
  if (!slug) return json({ error: "missing tool_slug" }, 400);

  try {
    // ---- 2. Abuse guard. Minting is cheap but not free, and this function is
    //         on the public internet. A member opening a tool mints one token
    //         per hour-long session, so this cap is far above any real use and
    //         only bites a script. Postgres, not memory (§6.13).
    const { data: underLimit } = await supabase.rpc("rate_limit_take", {
      p_bucket: `embed_token:user:${user.id}`,
      p_limit: 120,
      p_window: "01:00:00",
    });
    if (underLimit === false) {
      return json({ error: "too many token requests. Try again shortly." }, 429);
    }

    // ---- 3. The tool. -----------------------------------------------------
    const { data: tool } = await supabase
      .from("tools")
      .select("id, slug, runtime, status")
      .eq("slug", slug)
      .maybeSingle();
    if (!tool) return json({ error: "no such tool" }, 404);

    // Only iframe tools have an app to embed. Refusing here means a bug in the
    // runner can't quietly mint identity tokens for edge_function tools that
    // have no business receiving one.
    if (tool.runtime !== "iframe") {
      return json({ error: "that tool is not an embedded app" }, 400);
    }

    // ---- 4. Access: live, from the engine, for THIS user. ------------------
    //
    // accessible_tool_ids(uid) is `select id from tools where
    // can_access_tool(id, uid)` — the same engine the page and the runner use.
    // Passing uid explicitly matters: is_admin(uid) takes a subject, and a
    // function that implicitly read auth.uid() here would answer "can the
    // SERVICE ROLE see this", which is "yes" for every tool, for every user.
    const { data: accessibleRows, error: accessErr } = await supabase.rpc(
      "accessible_tool_ids",
      { uid: user.id },
    );
    if (accessErr) return json({ error: "could not check access" }, 500);

    // A setof-uuid RPC comes back as bare strings; accept the row-object shape
    // too rather than silently resolving to "no access" if that ever changes —
    // failing open is unthinkable here, but failing closed for the wrong reason
    // is a support ticket that looks like a permissions bug.
    const accessibleIds = new Set<string>();
    for (const row of (accessibleRows ?? []) as unknown[]) {
      if (typeof row === "string") accessibleIds.add(row);
      else if (row && typeof row === "object") {
        const v = Object.values(row as Record<string, unknown>)[0];
        if (typeof v === "string") accessibleIds.add(v);
      }
    }

    const tools = scopedSlugsFor(tool.slug, accessibleIds.has(tool.id));
    if (tools.length === 0) {
      // No access → no token. Not an empty-claims token: an app that treats a
      // missing tools claim as "no tools" would be fine, but handing out a
      // signed assertion of identity to someone we just refused is not.
      return json({ error: "no access to that tool" }, 403);
    }

    // Suspended/maintenance are already handled inside can_access_tool()
    // (suspension beats everything, drafts are admin-only), so a token is only
    // minted for a tool the engine says this user may open, right now.

    // ---- 5. Mint. ---------------------------------------------------------
    const { token, expiresAt } = await mintHubToken({
      userId: user.id,
      email: user.email ?? "",
      audience: tool.slug,
      tools,
    });

    return json({ token, expires_at: expiresAt, aud: tool.slug, tools });
  } catch (err) {
    // Never leak details: an error here could otherwise carry key material or
    // the shape of the signing setup.
    console.error("embed-token error:", (err as Error).message);
    return json({ error: "something went wrong" }, 500);
  }
});
