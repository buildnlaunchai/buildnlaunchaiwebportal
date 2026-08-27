// The scrubber, tested against the error bodies providers ACTUALLY send.
//
//   deno test --allow-env supabase/functions/ai-gateway/sanitize.test.ts
//
// The first case in MUST_REDACT is not hypothetical. It is the verbatim string
// api.openai.com returned during the upstream allow-list proof, and the
// scrubber let it through: the pattern expected a raw key and OpenAI sends a
// masked one. Every line below is here so the next mismatch of that kind is a
// failing test rather than a key prefix in someone's error toast.

import { scrub } from "./sanitize.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Strings that must not survive scrub() with any key material intact. */
const MUST_REDACT: Array<[string, string]> = [
  [
    "OpenAI's masked echo — the real one, from a real 401",
    "Incorrect API key provided: sk-blai-*************************-key. You can find your API key at https://platform.openai.com/account/api-keys.",
  ],
  [
    "OpenAI's masked echo, project-key shape",
    "Incorrect API key provided: sk-proj-****************************abc4. Check your key.",
  ],
  ["an unmasked OpenAI key", "auth failed for sk-proj-aB3dEfGh1JkLmN0pQrStUvWxYz012345"],
  ["an unmasked ElevenLabs key", "bad key xi-api-aB3dEfGh1JkLmN0pQrStUvWxYz01"],
  ["a bearer header quoted back", "sent Bearer aB3dEfGh1JkLmN0pQrStUvWxYz012345"],
  ["a masked secret in a shape we have never seen", "key ak_live_****************f9Q2 was rejected"],
  ["bullet masking rather than asterisks", "key sk-proj-••••••••••••••••abc4 rejected"],
  ["a long unbroken high-entropy run", "token aB3dEfGh1JkLmN0pQrStUvWxYz0123456789abcdef"],
];

/**
 * Strings that must SURVIVE. A scrubber that redacts the message is no better
 * than one that redacts nothing — the member still cannot act on it.
 */
const MUST_SURVIVE: string[] = [
  "This model's maximum context length is 8192 tokens, however you requested 9000.",
  "Rate limit reached for gpt-4o-mini in organization org-abc on requests per min.",
  "The voice voice_x does not exist.",
  "Invalid value for 'max_tokens': must be greater than 0.",
];

Deno.test("every key shape a provider echoes is redacted", () => {
  for (const [what, input] of MUST_REDACT) {
    const out = scrub(input);
    assert(out.includes("[redacted]"), `${what}: nothing was redacted\n  ${out}`);
    // The specific leak: a masked key still carries its prefix and its tail.
    assert(!/sk-[A-Za-z0-9]/.test(out), `${what}: an sk- prefix survived\n  ${out}`);
    assert(!/xi-api/.test(out), `${what}: an xi- prefix survived\n  ${out}`);
    assert(!/[*•]{4,}/.test(out), `${what}: a masked run survived\n  ${out}`);
  }
});

Deno.test("an ordinary provider message is left alone", () => {
  for (const input of MUST_SURVIVE) {
    const out = scrub(input);
    assert(
      out === input,
      `a message the member needs was mangled:\n  in:  ${input}\n  out: ${out}`,
    );
  }
});

Deno.test("the tail of a masked key does not survive", () => {
  // The point of the fix, stated as its own assertion: OpenAI's mask reveals
  // the last four characters of our key, and those are the part worth keeping.
  const out = scrub("Incorrect API key provided: sk-proj-****************************9xQ4.");
  assert(!out.includes("9xQ4"), `the key tail survived: ${out}`);
});

// ---- safeProviderError: the message survives, the key does not --------------

import { safeProviderError } from "./sanitize.ts";

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.test("OpenAI's error shape is read", async () => {
  const out = await safeProviderError(
    res(400, { error: { message: "This model's maximum context length is 8192 tokens." } }),
    "openai",
  );
  assert(out.status === 400, `status ${out.status}`);
  assert(
    out.body.error === "This model's maximum context length is 8192 tokens.",
    `got ${JSON.stringify(out.body)}`,
  );
});

Deno.test("ElevenLabs' error shape is read — it is detail.message, not error.message", async () => {
  // Verbatim from api.elevenlabs.io, the run that found this.
  const out = await safeProviderError(
    res(400, {
      detail: {
        type: "authentication_error",
        code: "invalid_api_key",
        message:
          "API key ID used as API key - only valid API keys can be used. API keys start with 'sk_' and are shown when the key is created or rotated.",
        status: "api_key_id_used_as_api_key",
      },
    }),
    "elevenlabs",
  );
  assert(
    String(out.body.error).startsWith("API key ID used as API key"),
    `the message was thrown away: ${JSON.stringify(out.body)}`,
  );
});

Deno.test("a bare string detail is read too", async () => {
  const out = await safeProviderError(res(422, { detail: "voice_id is required" }), "elevenlabs");
  assert(out.body.error === "voice_id is required", JSON.stringify(out.body));
});

Deno.test("a body we do not understand keeps the generic sentence", async () => {
  const out = await safeProviderError(res(400, { weird: { nested: true } }), "openai");
  assert(
    out.body.error === "The provider rejected this request.",
    JSON.stringify(out.body),
  );
});

Deno.test("a 5xx is reported as 502 — not the member's fault", async () => {
  const out = await safeProviderError(res(503, { error: { message: "overloaded" } }), "openai");
  assert(out.status === 502, `status ${out.status}`);
});

Deno.test("a key inside the message is still scrubbed on the way out", async () => {
  const out = await safeProviderError(
    res(401, { detail: { message: "bad key sk-proj-****************************9xQ4" } }),
    "elevenlabs",
  );
  assert(String(out.body.error).includes("[redacted]"), JSON.stringify(out.body));
  assert(!String(out.body.error).includes("9xQ4"), JSON.stringify(out.body));
});
