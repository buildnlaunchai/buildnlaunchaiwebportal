import "server-only";

/**
 * Server-side verification of a Cloudflare Turnstile token (CLAUDE.md §13).
 *
 * The widget on the client produces a token; this exchanges it with Cloudflare
 * using the secret key. A token is single-use and short-lived, so verification
 * MUST happen server-side on submit — a client "I passed" is worth nothing.
 *
 * If TURNSTILE_SECRET_KEY is unset (local dev without Turnstile configured), we
 * fail OPEN and log it, so development isn't blocked. In production the key is
 * always set, so this never fails open where it matters. The honeypot and the
 * per-IP rate limit still apply either way.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // A misconfigured production is a real problem — do not silently allow.
      console.error("TURNSTILE_SECRET_KEY missing in production; rejecting.");
      return false;
    }
    console.warn("TURNSTILE_SECRET_KEY unset — skipping Turnstile in dev.");
    return true;
  }

  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Cloudflare unreachable. Fail closed on the captcha, but this is rare and
    // the user can retry — better than letting bots through on an outage.
    return false;
  }
}
