// The upworkpilot-keys Edge Function.
//
// Releases a member's OWN decrypted OpenAI key to the UpworkPilot Chrome
// extension, so it can call OpenAI directly from their browser on their account.
//
// ⚠️  READ THIS BEFORE EDITING. Together with desktop-keys, this is one of only
// two places in the product where a plaintext member key leaves our
// infrastructure. Everywhere else — run-tool, key-vault — a decrypted key exists
// only inside the isolate that is about to spend it and dies with the request.
//
// AND OF THOSE TWO, THIS ONE GOES TO THE WEAKER PLACE. Say so here, plainly,
// because the copy a member reads is written from this understanding and §10 is
// explicit that an over-promise is worse than no promise. A desktop binary is
// signed, installed deliberately, and runs in its own process. A browser
// extension is none of those three:
//
//   * It shares a process boundary with web content. The extension's own pages
//     and its service worker are isolated from a page's JavaScript, but that
//     isolation is a browser guarantee we neither implement nor can audit, and
//     any content script the extension injects runs adjacent to hostile pages.
//     A desktop app has an operating system between it and the web.
//   * It updates silently through the Chrome Web Store. A new version reaches
//     every install without anyone agreeing to anything, so "a future version
//     asks for more" needs no user action to happen. This is the whole reason
//     UPWORKPILOT_PROVIDERS is a one-element allow-list enforced HERE, on our
//     server, rather than a setting in the extension.
//   * Its bundle is readable JavaScript in a profile directory. Nothing about it
//     resists inspection, which is why the licence is RS256-signed and the
//     extension carries only a public key.
//
// What makes this acceptable is not a promise about the extension. It is three
// structural guards on our side, plus one commitment on the extension's:
//
//   1. The access engine must say yes (the member's membership is live).
//   2. The member must have explicitly allowed THIS client to read THIS
//      provider. Consent is per-provider and revocable at any time.
//   3. Every release is logged to key_release_log, which the member can read
//      and the admin cannot hide.
//   4. The extension holds the released key in SERVICE WORKER MEMORY ONLY and
//      never writes it to chrome.storage — so an evicted worker takes the key
//      with it, and a copied profile directory contains no key at all.
//
// Guard 4 is the extension's own code and THE HUB CANNOT ENFORCE IT. It is
// written down here anyway, and deliberately: stated, a future extension change
// that persists the key is a visible contradiction of a documented contract
// rather than a silent regression nobody notices. It is also why this endpoint's
// rate limit is double the desktop's — memory-only storage means every worker
// eviction costs a re-fetch, and that is the right trade.
//
// Proxying OpenAI through here instead would keep the key inside our walls, and
// is a genuinely open question for a text-only tool in a way it was not for the
// desktop app (which had media, a 150s wall clock and a 256MB isolate against
// it). It is not done today because BYOK means the member's own rate limits,
// their own model access and their own bill, and putting our server in the path
// quietly changes all three. If that trade is ever revisited, revisit it here.
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
  UPWORKPILOT,
  UPWORKPILOT_PROVIDERS,
  type UpworkPilotProvider,
} from "../_shared/clients/upworkpilot.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const g = await gate(req, UPWORKPILOT, "keys");
  if (!g.ok) return g.response;

  // Unlike upworkpilot-licence, a "no" here is a refusal, not a signed negative.
  // There is nothing to hand back and nothing worth caching. The extension asks
  // the licence endpoint if it wants to know why.
  // ─── A "no" is not one answer ───────────────────────────────────────────
  //
  // This used to be a bare 403 saying "no active licence", for all three ways
  // tool_access_resolve returns 'none'. Two of them made that sentence false —
  // and one of those two is not an edge case at all: it is what happens to every
  // credit customer on the day they spend their last credit.
  //
  // ai-gateway/index.ts reads the kill switch BEFORE the mode for exactly this
  // reason and says so in a comment. This is the same care, arriving late.
  //
  // IF YOU ADD AN ACCESS CHECK HERE: put it after this block, and if it can
  // refuse somebody who would otherwise have run on credit, give it its own code
  // in CreditDenial. A refusal that cannot say which one it is gets reported as
  // the wrong one, and the wrong one costs the member money.
  if (g.mode === "none") {
    if (g.creditDenial === "credit_mode_disabled") {
      // 503, not 403: nothing is wrong with them. It is switched off at our end.
      return json({
        error: "Credit mode is turned off right now.",
        code: "credit_mode_disabled",
      }, 503);
    }
    if (g.creditDenial === "credit_exhausted") {
      // 402, and the code matters more than the status: "top up" and "your
      // membership ended" send a person to two different pages.
      return json({
        error: "You have no credit left.",
        code: "credit_exhausted",
      }, 402);
    }
    return json({ error: "no active licence for UpworkPilot", code: "no_access" }, 403);
  }

  // CREDIT MODE: entitled to RUN, not entitled to a KEY. See the identical
  // branch in desktop-keys for the full reasoning — in this mode WE pay OpenAI,
  // so releasing the member's own key would bill them twice over, once by their
  // provider and once by us, for a call we never made.
  //
  // Guard 1 in this file's header ("the access engine must say yes") is exactly
  // what has just become two-valued: yes-with-a-key and yes-without-one.
  //
  // 200, not 403. Nothing is wrong; the answer to "may I have the key" is a
  // considered no, and a 403 would read to a shipped extension as a dead licence.
  if (g.mode === "credit") {
    return json({
      mode: "credit",
      ...Object.fromEntries(
        UPWORKPILOT_PROVIDERS.map((provider) => [
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
  // THE VAULT MANAGES A KEY, THE PERMISSIONS PAGE MANAGES PERMISSION.
  //
  //   consent_required -> permissions page. The key may well exist; this client
  //                       is not allowed to read it. Only that page can grant
  //                       consent — the vault has no permission control at all.
  //   no_key           -> vault. There is nothing to release; they must ADD one.
  //   key_invalid      -> vault. What is stored has already been rejected by
  //                       OpenAI, so it needs replacing.
  //   present: true    -> vault. "Manage key" means review or replace the key,
  //                       which is the vault's whole job — and the vault links
  //                       onward to the permissions page for anyone who meant to
  //                       revoke. One of the two pages is a hub and the other is
  //                       a leaf; the hub is the honest default.
  //
  // Both wrong answers read as broken to a member: sending "add a key" to the
  // permissions page shows a switch for a key they do not have, and sending
  // "grant consent" to the vault shows a form for a key they already added, with
  // no way to grant the permission they actually lack.
  //
  // ⚠️  CONTRACT WITH STEP 4: /dashboard/keys/permissions is the generalised
  //     page that replaces /dashboard/keys/desktop, and it must render an
  //     element with id="upworkpilot" for this anchor to land on the right
  //     client. A missing anchor degrades to the top of the page rather than to
  //     a 404, so this is a papercut and not a break — but it is a papercut on
  //     the one screen where a member decides about their own API key.
  const consentUrl = `${siteUrl()}/dashboard/keys/permissions#upworkpilot`;
  // ?provider= pre-selects that provider in the vault's "Connect a key" form.
  // Validated against PROVIDER_BY_VALUE on the page; openai is in it.
  const vaultUrl = (provider: string) =>
    `${siteUrl()}/dashboard/keys?provider=${encodeURIComponent(provider)}`;

  try {
    // One query for every provider the client may ask for, rather than one per
    // provider. It is a single provider today; the loop below stays a loop so
    // that adding one is a change to the allow-list and nothing else.
    //
    // Note `status` is selected but NOT filtered on: an 'invalid' key gets an
    // explicit reason below, because "your OpenAI key stopped working" and "you
    // never added one" are different problems with different fixes, and
    // collapsing them into present:false leaves the extension unable to tell the
    // member which one they have.
    const { data: rows, error: keysErr } = await g.supabase
      .from("user_api_keys")
      .select("provider, ciphertext, iv, auth_tag, status")
      .eq("user_id", g.userId)
      .in("provider", UPWORKPILOT_PROVIDERS as unknown as string[]);

    if (keysErr) {
      console.error("upworkpilot-keys: key lookup failed");
      return json({ error: "something went wrong" }, 500);
    }

    const byProvider = new Map(
      (rows ?? []).map((r) => [r.provider as string, r]),
    );

    const out: Record<string, KeySlot> = {};
    const released: UpworkPilotProvider[] = [];

    for (const provider of UPWORKPILOT_PROVIDERS) {
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
        manage_url: vaultUrl(provider),
      };
      released.push(provider);
    }

    // Log only what was actually handed over. Logging a refused request as a
    // release would make the member's own history lie to them in the alarming
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
      // an additive change on the extension side, not a response-shape rewrite.
      mode: "byok",
      ...out,
    });
  } catch (err) {
    // The message only — never the error object, which can carry a `cause`
    // chain, and never anything derived from a decrypted value.
    console.error("upworkpilot-keys error:", (err as Error).message);
    return json({ error: "something went wrong" }, 500);
  }
});
