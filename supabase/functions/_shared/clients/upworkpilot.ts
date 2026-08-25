// UpworkPilot — the Chrome extension. Policy only; the mechanism it plugs into
// is ../client-gate.ts.
//
// NOT YET IMPORTED BY ANYTHING. The upworkpilot-licence and upworkpilot-keys
// functions land next; this file exists now so the numbers below can be reviewed
// against ./desktop.ts side by side, which is exactly where the interesting
// mistake lives — copying a desktop constant into a browser extension.

import type { ExternalClient } from "../client-gate.ts";

/**
 * The extension's tool slug, and the `aud` of every licence token it gets.
 * Same contract warning as ./desktop.ts: a shipped extension verifies against
 * this string, so changing it invalidates every cached licence in the field.
 */
export const UPWORKPILOT_TOOL_SLUG = "upworkpilot";

/**
 * OpenAI, and nothing else.
 *
 * A one-element allow-list looks like it is barely doing anything, which is
 * precisely when it earns its keep: it is what stops a future version of the
 * extension from asking for the member's Anthropic or ElevenLabs key. The
 * extension is updated silently through the Chrome Web Store, so "a future
 * version" is not a hypothetical that requires anyone to install anything.
 */
export const UPWORKPILOT_PROVIDERS = ["openai"] as const;
export type UpworkPilotProvider = (typeof UPWORKPILOT_PROVIDERS)[number];

/**
 * TWENTY-FOUR HOURS, NOT THIRTY DAYS. Read ./desktop.ts's constant before
 * changing this, and then do not copy it.
 *
 * The desktop app's thirty-day window exists to serve a real case: a member on
 * a plane or a shoot, running software they paid for, with no network. An
 * extension has no equivalent. It lives inside a browser and does work that is
 * inherently online — there is no state in which it is usefully running and
 * unable to reach us. A long offline window therefore buys the member nothing
 * and costs us the whole gap between a cancellation and the client noticing.
 *
 * A day is generous even so: it is a re-check roughly once per working session,
 * against an endpoint the extension is already talking to.
 */
export const UPWORKPILOT_LICENCE_TTL_SECONDS = 24 * 60 * 60;

/** Same reasoning as the desktop's negative TTL: a "no" must be cheap to undo
 *  for someone who just fixed their billing. */
export const UPWORKPILOT_LICENCE_INACTIVE_TTL_SECONDS = 60 * 60;

export const UPWORKPILOT: ExternalClient = {
  slug: UPWORKPILOT_TOOL_SLUG,
  providers: UPWORKPILOT_PROVIDERS,
  endpoints: {
    // Distinct buckets, so a member running both clients has two independent
    // budgets rather than one they can exhaust from either side.
    //
    // licence 120/hr matches the desktop: the token caches for a day, so real
    // use is a couple of calls.
    //
    // keys 240/hr is DOUBLE the desktop's, and the reason is MV3, not appetite.
    // A Chrome service worker is evicted after ~30s idle, and the extension
    // holds the released key in worker memory only — never chrome.storage —
    // so every eviction costs a re-fetch. That is the right trade (a plaintext
    // key on disk is worse than an extra request), but it means wakeups, not
    // sessions, set the call rate, and an active user can wake dozens of times
    // an hour. Treat this number as provisional until real traffic exists.
    licence: { bucket: "upworkpilot_licence", limitPerHour: 120 },
    keys: { bucket: "upworkpilot_keys", limitPerHour: 240 },
  },
};
