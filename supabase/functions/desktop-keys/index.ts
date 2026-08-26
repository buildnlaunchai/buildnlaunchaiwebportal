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
//   3. Every release is logged to key_release_log, which the member can read.
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
  type KeySlot,
  corsHeaders,
  creditModeUrl,
  gate,
  json,
  siteUrl,
} from "../_shared/client-gate.ts";
import {
  DESKTOP,
  DESKTOP_PROVIDERS,
  type DesktopProvider,
} from "../_shared/clients/desktop.ts";

// KeySlot — the per-provider answer shape — is shared with upworkpilot-keys in
// ../_shared/client-gate.ts, including the long note on why a withheld slot
// always carries consent_url and a released one always carries manage_url.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const g = await gate(req, DESKTOP, "keys");
  if (!g.ok) return g.response;

  // Unlike desktop-licence, a "no" here is a refusal, not a signed negative.
  // There is nothing to hand back and nothing worth caching.
  if (g.mode === "none") {
    return json({ error: "no active licence for this app" }, 403);
  }

  // CREDIT MODE: entitled to RUN, not entitled to a KEY.
  //
  // This is the branch the whole mode-awareness change exists for. A member
  // whose membership lapsed but who holds credit may open this app — and in
  // that mode WE pay OpenAI and ElevenLabs, so releasing their own key would
  // mean they pay their provider AND get billed credit for a call we never
  // made. Money moving in both directions at once, with the wrong release
  // byte-for-byte identical to a right one.
  //
  // Note it returns 200, not 403: nothing is wrong. The client is entitled, and
  // the answer to "may I have the key" is a considered no. A 403 here would
  // read to every shipped client as "your licence died".
  if (g.mode === "credit") {
    return json({
      mode: "credit",
      ...Object.fromEntries(
        DESKTOP_PROVIDERS.map((provider) => [
          provider,
          {
            present: false,
            reason: "credit_mode",
            consent_url: creditModeUrl(),
          } satisfies KeySlot,
        ]),
      ),
    });
  }

  // Past here g.mode is 'byok', and everything below is exactly as it was.

  // TWO destinations for four states, and the rule dividing them is one line:
  // THE VAULT MANAGES A KEY, THE DESKTOP PAGE MANAGES PERMISSION.
  //
  //   consent_required -> desktop page. The key may well exist; this app is not
  //                       allowed to read it. Only that page can grant consent —
  //                       the vault has no permission control at all.
  //   no_key           -> vault. There is nothing to release; they must ADD one.
  //   key_invalid      -> vault. What is stored has already been rejected by the
  //                       provider, so it needs replacing.
  //   present: true    -> vault. "Manage key" means review or replace the key,
  //                       which is the vault's whole job.
  //
  // Both wrong answers read as broken to a member: sending "add a key" to the
  // consent page shows a permission switch for a key they do not have, and
  // sending "grant consent" to the vault shows a form for a key they already
  // added, with no way to grant the permission they actually lack.
  const consentUrl = `${siteUrl()}/dashboard/keys/desktop`;
  // ?provider= pre-selects that provider in the vault's "Connect a key" form.
  // Validated against PROVIDER_BY_VALUE on the page, and both of DESKTOP_PROVIDERS
  // are in it — openai and elevenlabs behave identically here.
  const vaultUrl = (provider: string) =>
    `${siteUrl()}/dashboard/keys?provider=${encodeURIComponent(provider)}`;

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
      const { data: consented } = await g.supabase.rpc("has_key_release_consent", {
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
        out[provider] = {
          present: false,
          reason: "no_key",
          consent_url: vaultUrl(provider),
        };
        continue;
      }

      if (row.status === "invalid") {
        out[provider] = {
          present: false,
          reason: "key_invalid",
          consent_url: vaultUrl(provider),
        };
        continue;
      }

      out[provider] = {
        present: true,
        key: await decrypt({
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.auth_tag,
        }),
        // The VAULT, not the consent page. Someone with a working key who opens
        // "Manage key" wants to see or replace the key itself — its hint, its
        // verified status, Verify, Delete — and none of that exists on the
        // consent page, which only has permission switches.
        //
        // It also fails in the better direction. The vault links onward to
        // /dashboard/keys/desktop for anyone who actually meant to revoke this
        // app's access; the consent page offers no route back to key
        // management. One of these two pages is a hub and the other is a leaf,
        // so the hub is the honest default.
        manage_url: vaultUrl(provider),
      };
      released.push(provider);
    }

    // Log only what was actually handed over. Logging a refused request as an
    // "access" would make the member's own history lie to them in the alarming
    // direction.
    if (released.length > 0) {
      const now = new Date().toISOString();

      await g.supabase.from("key_release_log").insert(
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
