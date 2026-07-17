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
