// What the gateway reads out of a provider's response, pinned.
//
//   deno test --allow-env supabase/functions/ai-gateway/usage.test.ts
//
// The ElevenLabs half of this file is the whole reason it exists. The route
// used to read a header called `x-character-count`, which ElevenLabs has never
// sent, and fall back to counting the request text whenever it was missing — so
// the fallback ran on every call and the bill was our own guess wearing the
// provider's name. A test asserting the header NAME would have caught it on day
// one. This is that test, written late.

import { elevenLabsCredits, openAiUsage, usageFromSseChunk } from "./usage.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
const h = (init: Record<string, string>) => new Headers(init);

Deno.test("elevenlabs: the header is character-cost, and it is read", () => {
  // Verbatim from api.elevenlabs.io: "Test." on eleven_flash_v2_5.
  const got = elevenLabsCredits(h({ "character-cost": "2" }));
  assert(got === 2, `expected 2, got ${got}`);
});

Deno.test("elevenlabs: header lookup is case-insensitive, as Headers guarantees", () => {
  assert(elevenLabsCredits(h({ "Character-Cost": "17" })) === 17, "mixed case");
  assert(elevenLabsCredits(h({ "CHARACTER-COST": "17" })) === 17, "upper case");
});

Deno.test("elevenlabs: x-character-count is NOT what we read", () => {
  // The old name. If someone reintroduces it as an alias, this fails and they
  // have to come and read why it was removed.
  const got = elevenLabsCredits(h({ "x-character-count": "42" }));
  assert(got === null, `the dead header was honoured: ${got}`);
});

Deno.test("elevenlabs: a missing header is null, NEVER a guess", () => {
  assert(elevenLabsCredits(h({})) === null, "absent header must be null");
  assert(elevenLabsCredits(h({ "content-type": "audio/mpeg" })) === null, "unrelated headers");
});

Deno.test("elevenlabs: an unreadable value is null too", () => {
  for (const bad of ["", "abc", "NaN", "-1", "Infinity"]) {
    const got = elevenLabsCredits(h({ "character-cost": bad }));
    assert(got === null, `${JSON.stringify(bad)} should be null, got ${got}`);
  }
});

Deno.test("elevenlabs: zero is a real answer and survives", () => {
  // Distinct from null. Zero means "the provider billed nothing", which we
  // settle at zero; null means "we cannot tell", which fails the call.
  assert(elevenLabsCredits(h({ "character-cost": "0" })) === 0, "zero must not read as null");
});

Deno.test("openai: both usage spellings are read", () => {
  const chat = openAiUsage({ usage: { prompt_tokens: 10, completion_tokens: 2 } });
  assert(chat?.inputTokens === 10 && chat?.outputTokens === 2, JSON.stringify(chat));

  const responses = openAiUsage({ usage: { input_tokens: 9, output_tokens: 6 } });
  assert(responses?.inputTokens === 9 && responses?.outputTokens === 6, JSON.stringify(responses));

  assert(openAiUsage({}) === null, "no usage object");
  assert(openAiUsage(null) === null, "null body");
});

Deno.test("openai: usage is found in the SSE chunk that carries it", () => {
  const chunk =
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}\n\ndata: [DONE]\n\n';
  const u = usageFromSseChunk(chunk);
  assert(u?.inputTokens === 10 && u?.outputTokens === 2, JSON.stringify(u));

  assert(usageFromSseChunk('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n') === null,
    "a content chunk carries no usage");
});
