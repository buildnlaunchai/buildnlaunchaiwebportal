// The desktop-keys Edge Function.
//
// Releases a member's OWN decrypted provider keys to the desktop app, so it can
// call OpenAI and ElevenLabs directly from their machine on their account.
//
// ⚠️  READ THIS BEFORE EDITING. This is the one place in the product where a
// plaintext member key leaves our infrastructure. Everywhere else — run-tool,
// key-vault — a decrypted key exists only inside the isolate that is about to
// spend it, and dies with the request. Here it goes over the wire to a binary
// we do not control, on a machine we do not control.
//
// That is a deliberate, user-consented exception, not an oversight, and it is
// the reason for every guard below:
//
//   1. The access engine must say yes (the member's licence is live).
//   2. The member must have explicitly allowed THIS app to read THIS provider.
//      Consent is per-provider and revocable from /dashboard/keys/desktop.
//   3. Every release is logged to desktop_key_access, which the member can read.
//
// Proxying the provider calls through here instead would keep the key inside
// our walls, and was considered and rejected: this is a video/audio product, so
// it would put long transcriptions against a 150s wall clock, media buffering
// against a 256MB isolate, and every byte of streamed TTS through our egress.
// The right answer for THIS product is to release the key and be honest about
// it — which is why the vault copy was rewritten in the same change.
//
// §9.6 applies with full force: never console.log the response, a decrypted
// value, or a whole context object. Edge Function logs are retained.

import { decrypt } from "../_shared/crypto.ts";
import {
  DESKTOP_PROVIDERS,
  type DesktopProvider,
  corsHeaders,
  gate,
  json,
  siteUrl,
} from "../_shared/desktop.ts";

type KeySlot =
  | { present: false; reason: "no_key" | "consent_required" | "key_invalid"; consent_url?: string }
  | { present: true; key: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const g = await gate(req, "desktop_keys");
  if (!g.ok) return g.response;

  // Unlike desktop-licence, a "no" here is a refusal, not a signed negative.
  // There is nothing to hand back and nothing worth caching.
  if (!g.hasAccess) {
    return json({ error: "no active licence for this app" }, 403);
  }

  const consentUrl = `${siteUrl()}/dashboard/keys/desktop`;

  try {
    // One query for every provider the app may ask for, rather than one per
    // provider. Note `status` is selected but NOT filtered on: an 'invalid' key
    // gets an explicit reason below, because "your OpenAI key stopped working"
    // and "you never added one" are different problems with different fixes,
    // and collapsing them into present:false makes the desktop app unable to
    // tell the user which one they have.
    const { data: rows, error: keysErr } = await g.supabase
      .from("user_api_keys")
      .select("provider, ciphertext, iv, auth_tag, status")
      .eq("user_id", g.userId)
      .in("provider", DESKTOP_PROVIDERS as unknown as string[]);

    if (keysErr) {
      console.error("desktop-keys: key lookup failed");
      return json({ error: "something went wrong" }, 500);
    }

    const byProvider = new Map(
      (rows ?? []).map((r) => [r.provider as string, r]),
    );

    const out: Record<string, KeySlot> = {};
    const released: DesktopProvider[] = [];

    for (const provider of DESKTOP_PROVIDERS) {
      // Consent first, and BEFORE touching ciphertext. Checking the key first
      // would mean decrypting something we may not be allowed to hand over —
      // pointless risk, and it would leak "this member has an OpenAI key" to a
      // caller who was never granted anything.
      const { data: consented } = await g.supabase.rpc("has_desktop_consent", {
        p_tool_id: g.toolId,
        p_provider: provider,
        uid: g.userId,
      });

      if (consented !== true) {
        out[provider] = {
          present: false,
          reason: "consent_required",
          consent_url: consentUrl,
        };
        continue;
      }

      const row = byProvider.get(provider);
      if (!row) {
        out[provider] = { present: false, reason: "no_key" };
        continue;
      }

      if (row.status === "invalid") {
        out[provider] = { present: false, reason: "key_invalid" };
        continue;
      }

      out[provider] = {
        present: true,
        key: await decrypt({
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
        }),
      };
      released.push(provider);
    }

    // Log only what was actually handed over. Logging a refused request as an
    // "access" would make the member's own history lie to them in the alarming
    // direction.
    if (released.length > 0) {
      const now = new Date().toISOString();

      await g.supabase.from("desktop_key_access").insert(
        released.map((provider) => ({
          user_id: g.userId,
          tool_id: g.toolId,
          provider,
        })),
      );

      // Same bookkeeping run-tool does after it spends a key.
      await g.supabase
        .from("user_api_keys")
        .update({ last_used_at: now })
        .eq("user_id", g.userId)
        .in("provider", released as unknown as string[]);
    }

    return json({
      // Fixed today. Declared now so a future platform-provided-credits mode is
      // an additive change on the desktop side, not a response-shape rewrite.
      mode: "byok",
      ...out,
    });
  } catch (err) {
    // The message only — never the error object, which can carry a `cause`
    // chain, and never anything derived from a decrypted value.
    console.error("desktop-keys error:", (err as Error).message);
    return json({ error: "something went wrong" }, 500);
  }
});
