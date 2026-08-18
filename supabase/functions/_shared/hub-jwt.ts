// RS256 signing for hub embed tokens (CLAUDE.md §13, Phase 11). THE ONLY FILE
// THAT READS HUB_JWT_PRIVATE_KEY, and it only ever runs inside a Supabase Edge
// Function — the same custody rule, and the same structural reason, as
// crypto.ts and ENCRYPTION_KEY. There is no lib/hub-jwt.ts in the Next app: the
// Next app has nothing to sign with and must never be given the key.
//
// Asymmetric, not a shared secret. Many distributed apps will hold the public
// key; a shared secret would let any one of them — or anyone who extracted it
// from any one of them — forge tokens for every other app. A public key can only
// verify.

import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.10.0";

import type { LicenceDenialReason } from "./desktop.ts";

// Importing the PEM parses it. Cached against the raw env value so a key
// rotation still takes effect without a redeploy, while a warm isolate doesn't
// re-parse on every mint.
let cachedPem: string | null = null;
let cachedKey: CryptoKey | null = null;

async function loadSigningKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("HUB_JWT_PRIVATE_KEY");
  if (!raw) throw new Error("HUB_JWT_PRIVATE_KEY is not set");

  // Dashboards mangle multi-line values, so \n-escaped PEMs are accepted too —
  // the same tolerance the app side has, so a correct key is never rejected
  // over formatting.
  const pem = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;

  if (cachedKey && cachedPem === pem) return cachedKey;

  const key = await importPKCS8(pem, "RS256") as CryptoKey;
  cachedPem = pem;
  cachedKey = key;
  return key;
}

/**
 * One hour. This is the embedded app's own ceiling: the app stores the token in
 * a session cookie and re-verifies it on every request with maxTokenAge '1h', so
 * a longer exp would be silently overruled by the app and a shorter one would
 * lock a working user out sooner. exp and maxTokenAge therefore land on the same
 * deadline, which is intended: one deadline, not two that can disagree.
 *
 * There is deliberately no silent re-mint. When sessions genuinely need to
 * outlive an hour, that is a real feature (the app must cooperate so a reload
 * doesn't discard in-progress work), not a constant to nudge.
 */
export const HUB_TOKEN_TTL_SECONDS = 60 * 60;

export type HubTokenInput = {
  /** The hub's user id. Becomes `sub`. */
  userId: string;
  email: string;
  /**
   * The app this token is FOR. Becomes `aud`, and the app enforces it — a token
   * minted for one app is rejected by every other, so a compromised app cannot
   * replay a user's token against the rest of the estate.
   */
  audience: string;
  /**
   * The slugs this token grants, already scoped to `audience` by the caller and
   * already checked against the access engine. Never "everything the user can
   * reach" — see embed-token/index.ts for why.
   */
  tools: string[];
};

/** Mint a short-lived RS256 token asserting identity + scoped tool access. */
export async function mintHubToken(input: HubTokenInput): Promise<{
  token: string;
  expiresAt: string;
}> {
  const key = await loadSigningKey();
  const issuer = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://buildnlaunchai.com")
    .replace(/\/+$/, "");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + HUB_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({ email: input.email, tools: input.tools })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(input.userId)
    .setIssuer(issuer)
    .setAudience(input.audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

// ===========================================================================
// Licence tokens — the desktop app's offline entitlement cache.
//
// Same signing key, different question. The embed token above answers "who is
// this and what may they open, right now, online". A licence token answers "may
// this install keep running while it cannot reach us", which is the whole
// reason it must be signed at all: the desktop caches the answer to disk, and a
// cached JSON blob with no signature is a text file the user can edit.
//
// Why RS256 and not an HMAC baked into the binary: a shared secret compiled
// into a desktop app is extractable by anyone who owns a copy, and it is the
// SAME secret for every install — extract it once, mint "active: true" forever,
// for everybody. The public half of an RS256 pair can verify and cannot forge,
// so extracting it from the binary buys an attacker nothing. That is the entire
// argument, and it is the same one hub-jwt.ts already makes at the top of this
// file for the embedded apps.
// ===========================================================================

/**
 * How long a desktop install may trust a cached "active" licence with no
 * contact. Thirty days is a deliberate product judgement, not a security one:
 * long enough that a member on a plane or a shoot is never locked out of
 * software they paid for, short enough that a cancellation takes effect within
 * a billing cycle. Shorten it and offline stops working; lengthen it and a
 * refunded member keeps the app for a quarter.
 */
export const LICENCE_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long a NEGATIVE answer is cached. Short on purpose and asymmetric with
 * the above: someone who just paid must not wait thirty days to be let in, and
 * a "no" is cheap to re-ask because the app is already showing them a wall.
 */
export const LICENCE_INACTIVE_TTL_SECONDS = 60 * 60;

/** Never mint a token that is already dead — a same-second exp is a support ticket. */
const LICENCE_MIN_TTL_SECONDS = 60;

export type LicenceTokenInput = {
  userId: string;
  email: string;
  /** The app this licence is FOR — the tool slug. Becomes `aud`. */
  audience: string;
  /** The engine's verdict (can_access_tool), already computed by the caller. */
  active: boolean;
  /** Plan slug, or null when there is no membership row. */
  plan: string | null;
  /** ISO, or null for a membership that never expires. */
  membershipExpiresAt: string | null;
  /**
   * Why `active` is false — null whenever it is true.
   *
   * A SIGNED claim, not just an envelope field, and that is the point: the app
   * caches this token to disk and renders its wall from the cache. A reason
   * that lived only in the JSON would be gone the moment the app went offline,
   * and the suspended member would be back to reading "no active subscription".
   */
  reason: LicenceDenialReason | null;
};

/**
 * Mint an RS256 licence the desktop app can verify offline with the public key.
 *
 * The one subtle thing in here, and the thing to not "simplify" later: `exp` and
 * `membership_expires_at` are DIFFERENT DATES and mean different things. `exp`
 * is how long this cached answer may be trusted; `membership_expires_at` is when
 * the entitlement itself ends. They are separate claims because the desktop app
 * needs both — one to decide when to re-check, one to show the user.
 *
 * And `exp` is CLAMPED to the membership expiry. Without that clamp a member
 * whose plan ends next Tuesday could cache a thirty-day "active" licence on
 * Monday and keep the app running for a month past their own expiry. That is
 * the single most important line in this function.
 */
export async function mintLicenceToken(input: LicenceTokenInput): Promise<{
  token: string;
  /** ISO. When this cached answer stops being trustworthy — NOT the membership expiry. */
  expiresAt: string;
  checkedAt: string;
}> {
  const key = await loadSigningKey();
  const issuer = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://buildnlaunchai.com")
    .replace(/\/+$/, "");

  const now = Math.floor(Date.now() / 1000);

  let exp = now + (input.active ? LICENCE_TTL_SECONDS : LICENCE_INACTIVE_TTL_SECONDS);

  if (input.active && input.membershipExpiresAt) {
    const membershipEnd = Math.floor(
      new Date(input.membershipExpiresAt).getTime() / 1000,
    );
    // NaN guard: a malformed timestamp must not silently become Infinity-ish
    // through a failed comparison and hand out an unclamped token.
    if (Number.isFinite(membershipEnd)) exp = Math.min(exp, membershipEnd);
  }

  if (exp < now + LICENCE_MIN_TTL_SECONDS) exp = now + LICENCE_MIN_TTL_SECONDS;

  const checkedAt = new Date(now * 1000).toISOString();

  const token = await new SignJWT({
    email: input.email,
    active: input.active,
    // Always present, explicitly null on a positive, so the app can read
    // payload.reason without existence checks on either path.
    reason: input.active ? null : input.reason,
    plan: input.plan,
    membership_expires_at: input.membershipExpiresAt,
    checked_at: checkedAt,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject(input.userId)
    .setIssuer(issuer)
    .setAudience(input.audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    checkedAt,
  };
}
