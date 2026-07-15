// The key-vault Edge Function (CLAUDE.md §10). The browser calls THIS directly
// with the member's own JWT, so a plaintext API key goes browser → Supabase and
// never transits Vercel. Encryption and decryption happen here and nowhere else.
//
// This is the one deliberate exception to "every mutation is a Server Action":
// routing the save through Vercel would put the plaintext in Vercel's memory —
// briefly, unlogged, almost certainly fine. "Almost certainly fine" is weaker
// than "impossible", and this is the asset where the difference is worth it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { decrypt, encrypt, keyHint } from "../_shared/crypto.ts";
import { verifyKey } from "../_shared/providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // auth is the bearer token, not a cookie
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVIDERS = new Set([
  "openai", "anthropic", "google_ai", "openrouter", "elevenlabs",
  "replicate", "fal", "perplexity", "serper", "apify", "youtube_data", "custom",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Identity comes from the JWT, verified against the auth server — NEVER from
  // the body. A user_id in the payload is ignored.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const {
    data: { user },
  } = await supabase.auth.getUser(jwt);
  if (!user) return json({ error: "not authenticated" }, 401);

  let body: {
    action?: string;
    provider?: string;
    label?: string;
    plaintext?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const { action, provider, label } = body;
  if (!provider || !PROVIDERS.has(provider)) {
    return json({ error: "unknown provider" }, 400);
  }

  try {
    // ---- save: encrypt, store, then verify -------------------------------
    if (action === "save") {
      const plaintext = body.plaintext?.trim();
      if (!plaintext) return json({ error: "empty key" }, 400);

      const enc = await encrypt(plaintext);

      // One key per provider per user: upsert on (user_id, provider).
      const { error: upsertErr } = await supabase
        .from("user_api_keys")
        .upsert(
          {
            user_id: user.id,
            provider,
            label: label?.trim() || null,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            auth_tag: enc.authTag,
            key_hint: keyHint(plaintext),
            status: "unverified",
            last_verified_at: null,
          },
          { onConflict: "user_id,provider" },
        );
      if (upsertErr) {
        console.error("save upsert failed"); // never log the key or the error body
        return json({ error: "could not save the key" }, 500);
      }

      // Verify immediately (§10: verify on save). The plaintext is still in
      // memory here — no need to decrypt what we just received.
      const status = await verifyKey(provider, plaintext);
      await supabase
        .from("user_api_keys")
        .update({
          status,
          last_verified_at: status === "unverified" ? null : new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("provider", provider);

      return json({ provider, status, key_hint: keyHint(plaintext) });
    }

    // ---- verify: decrypt, call the provider, store the result ------------
    if (action === "verify") {
      const { data: row } = await supabase
        .from("user_api_keys")
        .select("ciphertext, iv, auth_tag")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();
      if (!row) return json({ error: "no key for that provider" }, 404);

      const plaintext = await decrypt({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
      const status = await verifyKey(provider, plaintext);

      await supabase
        .from("user_api_keys")
        .update({
          status,
          last_verified_at: status === "unverified" ? null : new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("provider", provider);

      return json({ provider, status });
    }

    // ---- delete ----------------------------------------------------------
    if (action === "delete") {
      const { error } = await supabase
        .from("user_api_keys")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);
      if (error) return json({ error: "could not delete the key" }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    // Never leak details — an error here could otherwise carry key material.
    console.error("key-vault error:", (err as Error).message);
    return json({ error: "something went wrong" }, 500);
  }
});
