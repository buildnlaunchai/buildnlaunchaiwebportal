// The AI gateway.
//
// In credit mode the platform pays the provider, so the call has to come from
// here rather than from the member's own machine on their own key. This function
// is where a member's request meets OUR key, and it exists to answer one
// question honestly: what did that call actually cost, according to the
// provider, not according to the client.
//
// ⚠️  READ BEFORE EDITING. Two properties hold this together:
//
//   1. USAGE COMES FROM THE PROVIDER. Never from the request, never from a
//      field a client can set. A client that reports its own token count can
//      report zero.
//
//   2. OUR KEYS NEVER LEAVE. They are read from Deno.env, attached to one
//      outbound request, and never logged, echoed, or included in an error. See
//      ./sanitize.ts — provider errors quote the request back, and OpenAI's
//      "Incorrect API key provided: sk-..." is a real error body.
//
// Everything is gated on mode === 'credit'. A byok member goes straight to the
// provider on their own key and should never arrive here; the refusal for that
// case says so, rather than silently spending platform money on someone who
// already has a key.

import {
  type ClientGate,
  type ExternalClient,
  corsHeaders,
  gate,
  json,
} from "../_shared/client-gate.ts";
import { DESKTOP } from "../_shared/clients/desktop.ts";
import { UPWORKPILOT } from "../_shared/clients/upworkpilot.ts";

import { handleOpenAiChat } from "./routes/openai-chat.ts";
import {
  handleOpenAiResponsesCreate,
  handleOpenAiResponsesPoll,
} from "./routes/openai-responses.ts";
import { handleElevenLabsTts } from "./routes/elevenlabs-tts.ts";
import { handleElevenLabsRead } from "./routes/elevenlabs-read.ts";

/**
 * Settings the routes need, read once per request.
 *
 * per_call_max_credits and the rest are admin-editable, so they are read live
 * rather than cached — a cap raised in the dashboard has to take effect on the
 * next call, not on the next cold start.
 */
export type GatewaySettings = {
  creditUsdValue: number;
  marginMultiplier: number;
  perCallMaxCredits: number;
};

export type RouteContext = {
  g: Extract<ClientGate, { ok: true }>;
  client: ExternalClient;
  settings: GatewaySettings;
  /** OUR key for this provider, for this client. Never logged. */
  providerKey: string;
  url: URL;
  req: Request;
};

/**
 * Which client owns which path.
 *
 * The tool is derived from the ROUTE, not from a header the caller supplies.
 * An earlier draft took an X-BLAI-Tool header and verified it against
 * tool_access — safe, but pointless indirection: each of these paths belongs to
 * exactly one client, so the path already says which tool is being charged and
 * there is nothing for a caller to get wrong or to lie about.
 */
type Route = {
  match: (method: string, path: string) => boolean;
  client: ExternalClient;
  provider: string;
  handle: (ctx: RouteContext) => Promise<Response>;
};

const ROUTES: Route[] = [
  {
    match: (m, p) => m === "POST" && p === "/openai/v1/chat/completions",
    client: UPWORKPILOT,
    provider: "openai",
    handle: handleOpenAiChat,
  },
  {
    match: (m, p) => m === "POST" && p === "/openai/v1/responses",
    client: DESKTOP,
    provider: "openai",
    handle: handleOpenAiResponsesCreate,
  },
  {
    match: (m, p) =>
      m === "GET" && /^\/openai\/v1\/responses\/[^/]+$/.test(p),
    client: DESKTOP,
    provider: "openai",
    handle: handleOpenAiResponsesPoll,
  },
  {
    match: (m, p) =>
      m === "POST" && /^\/elevenlabs\/v1\/text-to-speech\/[^/]+$/.test(p),
    client: DESKTOP,
    provider: "elevenlabs",
    handle: handleElevenLabsTts,
  },
  // ---- Read-only, and therefore NOT metered ------------------------------
  //
  // A member on credit has no ElevenLabs key, and without a voice list there is
  // no narration — so these two are the difference between credit mode working
  // for the desktop app and not existing for it. They cost nothing, so they open
  // no hold and write no ledger row; see routes/elevenlabs-read.ts, which
  // deliberately does not import hold.ts at all.
  //
  // /v1/user/subscription is absent on purpose. It reports the quota of the key
  // that called it, which here is OURS.
  {
    match: (m, p) => m === "GET" && p === "/elevenlabs/v2/voices",
    client: DESKTOP,
    provider: "elevenlabs",
    handle: handleElevenLabsRead,
  },
  {
    match: (m, p) => m === "GET" && p === "/elevenlabs/v1/models",
    client: DESKTOP,
    provider: "elevenlabs",
    handle: handleElevenLabsRead,
  },
];

/**
 * Strip the function prefix so routes match on the part that is ours.
 *
 * Anchored on the FUNCTION NAME rather than on a fixed `/functions/v1/ai-gateway`
 * prefix, because what precedes it is not stable: deployed, the path arrives as
 * /functions/v1/ai-gateway/...; under `supabase functions serve` the runtime
 * hands over a different prefix entirely. Matching a hardcoded prefix meant
 * every route 404'd locally while looking correct in production — so this finds
 * the segment wherever it is and keeps the remainder.
 */
const FN = "/ai-gateway";

function routePath(url: URL): string {
  const i = url.pathname.indexOf(FN);
  if (i === -1) return url.pathname || "/";
  return url.pathname.slice(i + FN.length) || "/";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = routePath(url);
  const route = ROUTES.find((r) => r.match(req.method, path));
  if (!route) return json({ error: "no such route", code: "not_found" }, 404);

  const g = await gate(req, route.client, "gateway");
  if (!g.ok) return g.response;

  // ---- The mode is the whole gate ----------------------------------------
  //
  // 'byok' gets a distinct refusal rather than a generic 403, because it is not
  // a failure: that member has their own key and should be calling the provider
  // directly. Telling them so is the difference between a client that falls
  // back correctly and one that shows its user an error.
  if (g.mode === "byok") {
    return json(
      {
        error:
          "This account runs on its own provider key. Call the provider directly.",
        code: "not_credit_mode",
      },
      403,
    );
  }
  const { data: settingsRow, error: settingsErr } = await g.supabase
    .from("credit_settings")
    // credit_mode_enabled is still selected and deliberately NOT read here: the
    // effective answer is per member and comes from credit_mode_for below. It
    // stays in the projection so a debugger sees the global setting beside the
    // resolved one rather than wondering where the switch went.
    .select(
      "credit_usd_value, margin_multiplier, per_call_max_credits, credit_mode_enabled",
    )
    .eq("id", true)
    .maybeSingle();

  if (settingsErr || !settingsRow) {
    console.error("ai-gateway: could not read credit_settings");
    return json({ error: "something went wrong", code: "unavailable" }, 500);
  }

  // ---- The kill switch, checked BEFORE the mode ---------------------------
  //
  // Order matters, and getting it wrong produced a wrong answer rather than a
  // wrong status. tool_access_resolve reads this same flag, so with credit mode
  // off a lapsed member resolves to 'none' — and a mode check first would have
  // told them "no active licence for this app", which is false. Their licence
  // is exactly as it was; what changed is that we turned credit mode off.
  //
  // This is also the only gateway route that runs at all in credit mode, so if
  // credit mode is off the whole function is off, whatever the caller's mode.
  //
  // PER MEMBER, not global — and reading the flag straight off the settings row
  // here was a bug the moment the override existed. tool_access_resolve would
  // have answered 'credit' for a member with an override while this line 503'd
  // them, so the one account credit mode was switched on for would have been the
  // one account that could not use it. credit_mode_for() is the only thing that
  // resolves the precedence; nothing else may read the raw column to decide.
  const { data: creditOn, error: modeErr } = await g.supabase.rpc(
    "credit_mode_for",
    { uid: g.userId },
  );
  if (modeErr) {
    console.error("ai-gateway: could not resolve credit mode");
    return json({ error: "something went wrong", code: "unavailable" }, 500);
  }
  if (creditOn !== true) {
    return json(
      {
        error: "Credit mode is turned off right now.",
        code: "credit_mode_disabled",
      },
      503,
    );
  }

  if (g.mode !== "credit") {
    return json({ error: "no active licence for this app", code: "no_access" }, 403);
  }

  const envName = route.client.providerKeyEnv[route.provider];
  const providerKey = envName ? Deno.env.get(envName) : undefined;
  if (!providerKey) {
    // Our misconfiguration, not the member's. Name the VARIABLE, never a value.
    console.error(
      `ai-gateway: ${envName ?? `no key env for ${route.provider}`} is not set`,
    );
    return json({ error: "something went wrong", code: "unavailable" }, 500);
  }

  const ctx: RouteContext = {
    g,
    client: route.client,
    settings: {
      creditUsdValue: Number(settingsRow.credit_usd_value),
      marginMultiplier: Number(settingsRow.margin_multiplier),
      perCallMaxCredits: Number(settingsRow.per_call_max_credits),
    },
    providerKey,
    url,
    req,
  };

  try {
    return await route.handle(ctx);
  } catch (err) {
    // The MESSAGE only — never the error object, whose `cause` chain can carry
    // a request, and never anything derived from a provider response.
    console.error("ai-gateway error:", (err as Error).message);
    return json({ error: "something went wrong", code: "gateway_error" }, 500);
  }
});
