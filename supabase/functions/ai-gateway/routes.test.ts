// What each route is allowed to touch, asserted from the source itself.
//
//   deno test --allow-read supabase/functions/ai-gateway/routes.test.ts
//
// A structural test rather than a behavioural one, because what it protects is
// structural: the read-only routes must never grow metering, and the metered
// ones must never lose it. Both mistakes look reasonable while you are making
// them — "be consistent, add a hold here too" and "this one is cheap, skip it" —
// and neither shows up in an output anybody looks at.

const here = new URL(".", import.meta.url);
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, here));

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEquals(actual: string[], expected: string[]) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`the forwarded paths are ${a}, expected ${e}`);
}

Deno.test("the read-only route cannot open a hold, because it cannot see one", () => {
  const src = read("./routes/elevenlabs-read.ts");

  // The import is the thing being asserted, not the call. A file that cannot
  // name openHold cannot accidentally acquire one in a hurry six months from
  // now — and if somebody adds the import deliberately, this test asks them why
  // before they get to the pull request.
  assert(!/from ["'](\.\.\/)+hold\.ts["']/.test(src), "elevenlabs-read.ts imports hold.ts");
  for (const forbidden of ["openHold", "settleHold", "releaseHold", "credit_hold"]) {
    assert(!src.includes(forbidden), `elevenlabs-read.ts references ${forbidden}`);
  }

  // And it says why, so the next person meets the reasoning before the rule.
  assert(
    src.includes("OPENS NO HOLD"),
    "the no-metering decision must stay explained in the file, not just enforced here",
  );
});

Deno.test("it still rate-limits, because free to us is not unlimited", () => {
  const src = read("./routes/elevenlabs-read.ts");
  assert(src.includes("rate_limit_take"), "the read route takes no rate limit");
  assert(
    /ai_gateway_reads:user:/.test(src),
    "the read route must use its own bucket, not share the narration budget",
  );
});

Deno.test("it forwards an allow-list, never a prefix", () => {
  const src = read("./routes/elevenlabs-read.ts");

  // A prefix match on /elevenlabs would make this an open proxy for our key.
  const list = src.match(/const ALLOWED = new Set\(\[([^\]]*)\]\)/);
  assert(list !== null, "no ALLOWED set found in the read route");

  const paths = [...list![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assertEquals(paths, ["/v1/models", "/v2/voices"]);

  // Read from the SET, not from the file: the file mentions
  // /v1/user/subscription on purpose, in the paragraph explaining why it is
  // excluded. A test that forbids the string would forbid the explanation.
  assert(
    !paths.includes("/v1/user/subscription"),
    "user/subscription reports OUR quota in credit mode and must never be forwarded",
  );
});

Deno.test("every route that spends money still settles", () => {
  // The other half of the same rule. A metered route losing its settle is how
  // a call gets made, billed to us, and charged to nobody.
  for (const rel of [
    "./routes/openai-chat.ts",
    "./routes/openai-responses.ts",
    "./routes/elevenlabs-tts.ts",
  ]) {
    const src = read(rel);
    assert(src.includes("openHold"), `${rel} opens no hold`);
    assert(
      src.includes("settleHold") || src.includes("releaseHold"),
      `${rel} opens a hold and never resolves it`,
    );
  }
});

Deno.test("the router registers the read paths as GET, and only those", () => {
  const src = read("./index.ts");
  assert(src.includes('p === "/elevenlabs/v2/voices"'), "voices is not routed");
  assert(src.includes('p === "/elevenlabs/v1/models"'), "models is not routed");
  assert(
    !src.includes("/elevenlabs/v1/user/subscription"),
    "subscription must not be routed at all",
  );
});

Deno.test("the kill switch is resolved PER MEMBER, never read raw", () => {
  const src = read("./index.ts");

  // The regression this stops: reading credit_settings.credit_mode_enabled here
  // to decide. tool_access_resolve answers 'credit' for a member with an
  // override, so a raw read would 503 the one account credit mode was switched
  // on for — the only account that could not use it would be the test account.
  assert(
    src.includes('rpc(\n    "credit_mode_for"') || src.includes('"credit_mode_for"'),
    "index.ts does not resolve the mode through credit_mode_for",
  );

  // The column may still be SELECTED (it is, so a debugger sees the global
  // setting beside the resolved one). What it must not be is the thing branched
  // on. Anything of the form `settingsRow.credit_mode_enabled !== true` or
  // `if (...credit_mode_enabled)` is that branch coming back.
  assert(
    !/settingsRow\.credit_mode_enabled\s*[!=]==/.test(src),
    "index.ts branches on the raw global flag instead of credit_mode_for",
  );
});
