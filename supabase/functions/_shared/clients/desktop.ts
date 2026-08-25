// "Raw Footage, Real Story" — the desktop app. Policy only; the mechanism it
// plugs into is ../client-gate.ts.
//
// Everything in this file was previously inline in _shared/desktop.ts. Nothing
// about it changed when UpworkPilot arrived, and that is the point of the split:
// a second client must not be able to alter the first one's numbers by
// accident.

import type { ExternalClient } from "../client-gate.ts";

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

/** The providers the desktop app may ever ask for. See ExternalClient.providers
 *  for why this is a code constant and not a read of tools.required_providers. */
export const DESKTOP_PROVIDERS = ["openai", "elevenlabs"] as const;
export type DesktopProvider = (typeof DESKTOP_PROVIDERS)[number];

/**
 * How long a desktop install may trust a cached "active" licence with no
 * contact. Thirty days is a deliberate product judgement, not a security one:
 * long enough that a member on a plane or a shoot is never locked out of
 * software they paid for, short enough that a cancellation takes effect within
 * a billing cycle. Shorten it and offline stops working; lengthen it and a
 * refunded member keeps the app for a quarter.
 *
 * This number is about DESKTOP SOFTWARE ON A LAPTOP. It is not a house style,
 * and it is wrong for anything that only runs with a network — see
 * ./upworkpilot.ts, which is why this constant moved out of hub-jwt.ts.
 */
export const DESKTOP_LICENCE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long a NEGATIVE answer is cached. Short on purpose and asymmetric with
 * the above: someone who just paid must not wait thirty days to be let in, and
 * a "no" is cheap to re-ask because the app is already showing them a wall.
 */
export const DESKTOP_LICENCE_INACTIVE_TTL_SECONDS = 60 * 60;

export const DESKTOP: ExternalClient = {
  slug: DESKTOP_TOOL_SLUG,
  providers: DESKTOP_PROVIDERS,
  endpoints: {
    // Bucket names are UNCHANGED from before the refactor, on purpose. They are
    // live keys in rate_limit_hits; renaming them would silently reset every
    // member's current window. A cosmetic tidy is not worth a behaviour change
    // nobody asked for.
    //
    // 120/hr: a desktop app checks its licence on launch and occasionally
    // after, so this cap is far above real use and only bites a script.
    licence: { bucket: "desktop_licence", limitPerHour: 120 },
    keys: { bucket: "desktop_keys", limitPerHour: 120 },
  },
};
