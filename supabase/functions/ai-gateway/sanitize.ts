// Scrubbing anything that leaves this function.
//
// The gateway is the one place in the product that holds OUR provider keys and
// talks to a client at the same time. Two things must never cross that line: a
// key, and the request we made on the member's behalf.
//
// §9.6 applies with full force here. Edge Function logs are retained, so a
// console.log of an outbound header is not a debugging convenience — it writes
// a live API key into storage we then have to trust.

/**
 * Key-shaped strings, by provider prefix and by shape.
 *
 * Provider errors are the reason this exists. They frequently quote the request
 * back — "Incorrect API key provided: sk-proj-abc...xyz" is a real OpenAI error
 * body — so passing one through verbatim would hand the caller our key in the
 * course of telling them something went wrong.
 */
const KEY_PATTERNS: RegExp[] = [
  // The character classes include `*` and `.` DELIBERATELY, and that is the
  // whole lesson of this file's one real miss.
  //
  // OpenAI does not echo the key raw. It echoes it MASKED:
  //   "Incorrect API key provided: sk-proj-****************************abc4"
  // The original class was [A-Za-z0-9_-]{16,}, which stops dead at the first
  // asterisk — so `sk-proj-` is eight characters, the match fails, and the
  // whole thing sails through untouched. The scrubber was written against the
  // error body we imagined and never tested against the one OpenAI sends.
  //
  // What that forwarded is not the key, but it is not nothing: the prefix and
  // the last four characters of OUR platform key, handed to an external client
  // in an error message. Caught by a live 401 from api.openai.com during the
  // upstream allow-list proof, and pinned by sanitize.test.ts so it stays
  // caught.
  /\bsk-[A-Za-z0-9_\-*.•]{8,}/g, // OpenAI, raw or masked
  /\bxi-[A-Za-z0-9_\-*.•]{8,}/g, // ElevenLabs, raw or masked
  /\bBearer\s+[A-Za-z0-9._\-*•]{12,}/gi,
  // A masked secret in a format nobody has told us about yet: a run of four or
  // more mask characters with token characters either side. Ordinary prose does
  // not look like this.
  /[A-Za-z0-9_\-]{2,}[*•]{4,}[A-Za-z0-9_\-]{2,}/g,
  // Long unbroken high-entropy runs: catches an UNmasked key format nobody has
  // told us about yet. Deliberately last, and deliberately long, so ordinary
  // words and ids survive.
  /\b[A-Za-z0-9_\-]{40,}\b/g,
];

export function scrub(text: string): string {
  let out = text;
  for (const p of KEY_PATTERNS) out = out.replace(p, "[redacted]");
  return out;
}

/**
 * A provider's error, made safe to forward.
 *
 * Keeps the provider's status and its human-readable message, because a member
 * whose prompt was rejected for length deserves to be told that. Drops
 * everything structural — headers, echoed request bodies, anything we did not
 * explicitly choose to pass on.
 */
export async function safeProviderError(
  res: Response,
  provider: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let message = "The provider rejected this request.";

  try {
    const raw = await res.text();
    const m = providerMessage(JSON.parse(raw));
    if (m) message = scrub(m).slice(0, 500);
  } catch {
    // Non-JSON or unreadable. The generic message above is the honest answer —
    // never fall back to dumping the raw body, which is exactly the path that
    // would leak an echoed key.
  }

  // 5xx from a provider is not the member's fault and must not read as if it
  // were. 4xx usually is something about their request.
  const status = res.status >= 500 ? 502 : res.status;

  return { status, body: { error: message, code: `${provider}_error` } };
}

/**
 * The human-readable message, wherever this provider decided to put it.
 *
 * NOT A GENERALISATION FOR ITS OWN SAKE. Only `error.message` was read here,
 * which is OpenAI's shape — and ElevenLabs does not use it. It answers
 *
 *   {"detail":{"status":"api_key_id_used_as_api_key",
 *              "message":"API key ID used as API key - ... keys start with 'sk_'"}}
 *
 * so every ElevenLabs failure reached the desktop app as the generic sentence
 * below, with the one sentence that would have fixed it thrown away. That was
 * found the only way it could be — by a real 400 from api.elevenlabs.io during
 * the first run against the real providers, which is what that run is for.
 *
 * Order matters only in that the most specific shapes are read first. Anything
 * unrecognised falls through to null and the caller keeps its generic message,
 * which stays the right answer for a body we do not understand.
 */
function providerMessage(parsed: unknown): string | null {
  const b = parsed as {
    error?: { message?: unknown } | string;
    detail?: { message?: unknown } | string;
    message?: unknown;
  } | null;
  if (!b || typeof b !== "object") return null;

  const candidates: unknown[] = [
    typeof b.error === "object" ? b.error?.message : b.error, // OpenAI
    typeof b.detail === "object" ? b.detail?.message : b.detail, // ElevenLabs, FastAPI
    b.message, // plenty of others
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/**
 * Log a provider failure without logging the failure's contents.
 *
 * Status and provider only. Never the body, never the headers, never the URL
 * with its query string — any of which can carry the thing this file exists to
 * keep out of the log.
 */
export function logProviderFailure(
  provider: string,
  route: string,
  status: number,
): void {
  console.error(`ai-gateway: ${provider} ${route} returned ${status}`);
}
