// The allow-list, tested against the values an attacker would actually try.
//
// WHY THIS FILE EXISTS. An earlier version of upstream.ts gated the override on
// SUPABASE_URL looking like localhost. Inside the Edge runtime container
// SUPABASE_URL is never a loopback address, so that condition was false
// everywhere — the override was silently ignored and the "no money spent" test
// suite quietly called the real OpenAI with a fake key. It failed safe only
// because the key was fake. With OUR key in the environment the same bug spends
// real money on every call.
//
// So the guard does not get to be reviewed by reading it. It gets asserted, on
// the hostile inputs, before any run that has a real key anywhere near it:
//
//   deno test --allow-env supabase/functions/ai-gateway/upstream.test.ts
//
// Only --allow-env. If this file ever needs --allow-net to make its point, the
// point has been lost.

import { elevenLabsBase, openAiBase } from "./upstream.ts";

const OPENAI_REAL = "https://api.openai.com";
const ELEVENLABS_REAL = "https://api.elevenlabs.io";

function set(name: string, value: string | null) {
  if (value === null) Deno.env.delete(name);
  else Deno.env.set(name, value);
}

function assertEq(actual: string, expected: string, what: string) {
  if (actual !== expected) {
    throw new Error(`${what}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

/** Values that MUST be honoured: they cannot leave the machine. */
const LOCAL: string[] = [
  "http://127.0.0.1:8799",
  "http://localhost:8799",
  "http://[::1]:8799",
  "http://host.docker.internal:8799",
  "https://localhost:8799",
  // Case is normalised by the URL parser, so this is the same host.
  "http://LOCALHOST:8799",
];

/**
 * Values that MUST be ignored. Each is a different way of looking local while
 * resolving somewhere else — the suffix, the path, the userinfo trick — plus
 * the near-misses that prove the match is on the exact hostname and not on a
 * substring.
 */
const HOSTILE: string[] = [
  "https://api.evil.example",
  "http://127.0.0.1.evil.example:8799",     // suffix
  "https://evil.example/127.0.0.1",         // in the path
  "http://127.0.0.1@evil.example",          // userinfo — hostname is evil.example
  "http://localhost@evil.example/v1",       // same trick, spelled differently
  "http://evil.example#127.0.0.1",          // fragment
  "http://evil.example?h=localhost",        // query
  "http://127.0.0.2:8799",                  // near-miss address
  "http://169.254.169.254/latest/meta-data", // cloud metadata, the classic target
  "not a url at all",
  "//127.0.0.1:8799",
  "",
];

/**
 * Local-ish spellings the list deliberately does NOT carry.
 *
 * These fall back to the real provider, which is the safe direction — but it is
 * a surprising one, so it is asserted rather than left to be discovered. Adding
 * either to LOCAL_HOSTS is a decision, not a bug fix.
 */
const NOT_RECOGNISED: string[] = [
  "http://0.0.0.0:8799",             // binds locally, but is not an address you dial
  "http://[::ffff:127.0.0.1]:8799",  // IPv4-mapped IPv6: loopback, different string
];

Deno.test("unset -> the real provider", () => {
  set("OPENAI_BASE_URL", null);
  set("ELEVENLABS_BASE_URL", null);
  assertEq(openAiBase(), OPENAI_REAL, "openai with no override");
  assertEq(elevenLabsBase(), ELEVENLABS_REAL, "elevenlabs with no override");
});

Deno.test("a local override is honoured", () => {
  for (const v of LOCAL) {
    set("OPENAI_BASE_URL", v);
    assertEq(openAiBase(), v, `openai should use local override ${v}`);
    set("ELEVENLABS_BASE_URL", v);
    assertEq(elevenLabsBase(), v, `elevenlabs should use local override ${v}`);
  }
});

Deno.test("a trailing slash is trimmed, so paths never double up", () => {
  set("OPENAI_BASE_URL", "http://127.0.0.1:8799///");
  assertEq(openAiBase(), "http://127.0.0.1:8799", "trailing slashes trimmed");
});

Deno.test("NO hostile override reaches a non-local host", () => {
  for (const v of HOSTILE) {
    set("OPENAI_BASE_URL", v);
    assertEq(openAiBase(), OPENAI_REAL, `openai must ignore ${JSON.stringify(v)}`);
    set("ELEVENLABS_BASE_URL", v);
    assertEq(
      elevenLabsBase(),
      ELEVENLABS_REAL,
      `elevenlabs must ignore ${JSON.stringify(v)}`,
    );
  }
});

Deno.test("the two providers read their own variable and only their own", () => {
  set("OPENAI_BASE_URL", "http://127.0.0.1:8799");
  set("ELEVENLABS_BASE_URL", null);
  assertEq(openAiBase(), "http://127.0.0.1:8799", "openai honours its own var");
  assertEq(elevenLabsBase(), ELEVENLABS_REAL, "elevenlabs is not affected by openai's var");

  set("OPENAI_BASE_URL", null);
  set("ELEVENLABS_BASE_URL", "http://127.0.0.1:8799");
  assertEq(openAiBase(), OPENAI_REAL, "openai is not affected by elevenlabs' var");
  assertEq(elevenLabsBase(), "http://127.0.0.1:8799", "elevenlabs honours its own var");
});

Deno.test("the override is read per call, not cached at module load", () => {
  // The routes call openAiBase() on every request. If the value were captured
  // once, a redeploy would be needed to change it — and worse, a test that set
  // the env after import would be testing nothing at all.
  set("OPENAI_BASE_URL", "http://127.0.0.1:8799");
  assertEq(openAiBase(), "http://127.0.0.1:8799", "first read");
  set("OPENAI_BASE_URL", null);
  assertEq(openAiBase(), OPENAI_REAL, "second read sees the change");
});

Deno.test("local-ish spellings that are not on the list fall back to the real host", () => {
  for (const v of NOT_RECOGNISED) {
    set("OPENAI_BASE_URL", v);
    assertEq(openAiBase(), OPENAI_REAL, `openai falls back for ${JSON.stringify(v)}`);
  }
});
