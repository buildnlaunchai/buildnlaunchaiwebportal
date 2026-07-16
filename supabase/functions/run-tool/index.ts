// The tool runner (CLAUDE.md §9). Tools are TypeScript that runs on our own
// Supabase project — no external webhook, no third party in the path of a
// member's key.
//
// This function is on the PUBLIC internet, so the FIRST thing it does is reject
// any caller that is not the service role (§9.4). verify_jwt is off for this
// function (config.toml) precisely so this check — not the gateway — is the gate.
// Everything downstream trusts its input because nothing else can reach it: our
// startRun Server Action already verified auth, access, status, keys, and the
// rate limit before creating the run row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { decrypt } from "../_shared/crypto.ts";
import { ProviderAuthError, type Handler, type RunContext } from "../_shared/types.ts";

import hackerNewsDigest from "./handlers/hacker-news-digest.ts";
import youtubeLeadFinder from "./handlers/youtube-lead-finder.ts";

// Static registry — Deno bundles what's imported. function_name (or slug) picks.
const HANDLERS: Record<string, Handler> = {
  "hacker-news-digest": hackerNewsDigest,
  "youtube-lead-finder": youtubeLeadFinder,
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUNNER_SECRET = Deno.env.get("RUNNER_SECRET") ?? "";

Deno.serve(async (req) => {
  // ---- the gate. Not authorization theatre — the whole security model. ----
  //
  // A dedicated shared secret, not the service-role key: Supabase injects the
  // new-format secret key into functions while our Server Action holds the
  // legacy JWT, so a byte-compare against SUPABASE_SERVICE_ROLE_KEY can never
  // match. RUNNER_SECRET lives in Supabase secrets AND in the app env, and its
  // only job is to prove "our backend sent this". It cannot decrypt anything —
  // ENCRYPTION_KEY is not on Vercel — so it does not weaken §13.
  const presented = req.headers.get("X-Runner-Secret") ?? "";
  if (!RUNNER_SECRET || !timingSafeEqual(presented, RUNNER_SECRET)) {
    return new Response("not found", { status: 404 }); // don't confirm it exists
  }

  let runId: string | undefined;
  try {
    ({ run_id: runId } = await req.json());
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!runId) return new Response("missing run_id", { status: 400 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE);

  // The run row is the only input we trust — only our Server Action could have
  // created it, and it already did every check.
  const { data: run } = await supabase
    .from("tool_runs")
    .select("id, user_id, tool_id, input, status, created_at")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return new Response("run not found", { status: 404 });
  if (run.status !== "running") {
    // Idempotent: a terminal or already-picked-up run is left alone.
    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  }

  const { data: tool } = await supabase
    .from("tools")
    .select("slug, name, required_providers, output_schema")
    .eq("id", run.tool_id)
    .single();
  const { data: secret } = await supabase
    .from("tool_secrets")
    .select("function_name")
    .eq("tool_id", run.tool_id)
    .maybeSingle();

  const handlerName = secret?.function_name || tool!.slug;
  const handler = HANDLERS[handlerName];
  if (!handler) {
    await fail(supabase, run, "This tool isn't wired up yet.");
    return new Response("no handler", { status: 200 });
  }

  // Decrypt the member's keys for this tool's providers — HERE, the only place a
  // plaintext member key ever exists (§9.3 step c).
  const providers = (tool!.required_providers ?? []) as string[];
  const secrets: Record<string, string> = {};
  if (providers.length > 0) {
    const { data: keys } = await supabase
      .from("user_api_keys")
      .select("provider, ciphertext, iv, auth_tag")
      .eq("user_id", run.user_id)
      .neq("status", "invalid")
      .in("provider", providers);
    for (const k of keys ?? []) {
      secrets[k.provider] = await decrypt({
        ciphertext: k.ciphertext,
        iv: k.iv,
        authTag: k.auth_tag,
      });
    }
  }

  const ctx: RunContext = { input: run.input as Record<string, unknown>, secrets };

  // Run in the background: answer the request now, do the work after (§9.3).
  EdgeRuntime.waitUntil(work(supabase, run, tool!, providers, handler, ctx));

  return new Response(JSON.stringify({ accepted: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});

type RunRow = { id: string; user_id: string; created_at: string };

async function work(
  supabase: ReturnType<typeof createClient>,
  run: RunRow,
  tool: { output_schema: unknown; name: string },
  providers: string[],
  handler: Handler,
  ctx: RunContext,
) {
  const started = Date.parse(run.created_at);

  // Best-effort shutdown capture (wall clock / CPU / memory). The reaper is the
  // reliable backstop; this just makes the common case tidy.
  const onUnload = () => {
    supabase
      .from("tool_runs")
      .update({ status: "timeout", completed_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("status", "running");
  };
  addEventListener("beforeunload", onUnload);

  try {
    const output = await handler(ctx);
    const artifactsExpireAt = await rehostArtifacts(supabase, run, tool.output_schema, output);

    await supabase
      .from("tool_runs")
      .update({
        status: "success",
        output,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        providers_used: providers,
        artifacts_expire_at: artifactsExpireAt,
      })
      .eq("id", run.id);
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      // The single most common BYOK failure — a first-class path (§9.3 h). The
      // run only started because the key was non-invalid (startRun checked), so
      // reaching here IS the transition to invalid — notify exactly once (§11).
      await supabase
        .from("user_api_keys")
        .update({ status: "invalid" })
        .eq("user_id", run.user_id)
        .eq("provider", err.provider);
      await notifyKeyStopped(supabase, run.user_id, err.provider, tool.name);
      await fail(
        supabase,
        run,
        `Your ${err.provider} key was rejected. It's been marked invalid — update it in the key vault and run again.`,
        started,
      );
    } else {
      await fail(supabase, run, sentence((err as Error).message), started);
    }
  } finally {
    removeEventListener("beforeunload", onUnload);
  }
}

async function fail(
  supabase: ReturnType<typeof createClient>,
  run: { id: string },
  message: string,
  started?: number,
) {
  await supabase
    .from("tool_runs")
    .update({
      status: "error",
      error_message: message,
      completed_at: new Date().toISOString(),
      duration_ms: started ? Date.now() - started : null,
    })
    .eq("id", run.id);
}

/**
 * Re-host file/image output URLs into the run-artifacts bucket, streaming so we
 * never buffer a large file into the 256MB isolate. Replaces the ephemeral URL
 * with the storage path. Returns the 30-day expiry, or null if there were none.
 */
async function rehostArtifacts(
  supabase: ReturnType<typeof createClient>,
  run: { id: string; user_id: string },
  outputSchema: unknown,
  output: Record<string, unknown>,
): Promise<string | null> {
  const blocks =
    (outputSchema as { blocks?: { type: string; key: string }[] })?.blocks ?? [];
  const fileKeys = blocks
    .filter((b) => b.type === "file" || b.type === "image")
    .map((b) => b.key);

  let rehosted = false;
  for (const key of fileKeys) {
    const url = output[key];
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) continue;
      const path = `${run.user_id}/${run.id}/${key}`;
      const { error } = await supabase.storage
        .from("run-artifacts")
        .upload(path, res.body, {
          contentType: res.headers.get("content-type") ?? "application/octet-stream",
          upsert: true,
        });
      if (!error) {
        output[key] = { storagePath: path };
        rehosted = true;
      }
    } catch {
      // Keep the original URL if re-hosting fails — better a maybe-expiring link
      // than a lost result.
    }
  }

  if (!rehosted) return null;
  return new Date(Date.now() + 30 * 86_400_000).toISOString();
}

function sentence(msg: string): string {
  const clean = (msg || "The tool didn't finish.").trim();
  return clean.length > 200 ? "The tool didn't finish." : clean;
}

/**
 * "A key stopped working" — the notification + email, once per invalidation
 * (§11). Best-effort: never lets a mail failure change the run outcome. Sent
 * from HERE because this is where the 401 is detected; the Edge Function has
 * RESEND_API_KEY in Supabase secrets.
 */
async function notifyKeyStopped(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  provider: string,
  toolName: string,
) {
  try {
    const [{ data: profile }, { data: key }] = await Promise.all([
      supabase.from("profiles").select("email").eq("id", userId).maybeSingle(),
      supabase
        .from("user_api_keys")
        .select("key_hint")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle(),
    ]);

    const site = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://buildnlaunchai.com").replace(/\/+$/, "");
    const href = `/dashboard/keys?provider=${provider}`;

    await supabase.from("notifications").insert({
      user_id: userId,
      title: `Your ${provider} key stopped working`,
      body: `It was rejected during a run of ${toolName} and marked invalid. Update it to run again.`,
      href,
    });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    if (resendKey && from && profile?.email) {
      const hint = key?.key_hint ?? "";
      const html =
        `<div style="font-family:sans-serif;color:#14161c">` +
        `<h2>${provider} rejected your key</h2>` +
        `<p>Your ${provider} key ${hint} was refused during a run of <strong>${toolName}</strong>, so it's been marked invalid. ` +
        `It may have been revoked or run out of credit on ${provider}'s side. Nothing was charged on my end.</p>` +
        `<p><a href="${site}${href}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Update your key</a></p></div>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: profile.email,
          subject: `Your ${provider} key stopped working`,
          html,
        }),
      });
    }
  } catch (e) {
    console.error("notifyKeyStopped failed (non-fatal):", (e as Error).message);
  }
}
