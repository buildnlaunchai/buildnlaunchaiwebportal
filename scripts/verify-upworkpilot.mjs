/**
 * The UpworkPilot extension backend — licence + consented key release, against
 * the LIVE Edge Functions and DB.
 *
 * A mirror of verify-desktop.mjs, with the same adversarial posture: that script
 * is the reason the desktop key-release path is trustworthy, and a second client
 * releasing plaintext keys deserves no less. Mostly negative checks:
 *
 *   - no licence -> no keys, and no signed "active"
 *   - a user_id in the body is ignored; identity comes from the JWT
 *   - a licence minted for this client is rejected by the desktop app's audience
 *   - a provider OUTSIDE UPWORKPILOT_PROVIDERS is never released, even with a
 *     valid stored key AND a consent row planted for it
 *   - consent for THIS client does not unlock the OTHER client's keys
 *   - the licence TTL is 24 HOURS, not the desktop's 30 days
 *   - user_api_keys.ciphertext stays unreadable to the member's own token
 *
 * Licence tokens are verified with the real `jose` against the public key in
 * secrets/ — the same half the extension will carry — not a re-implementation
 * that could agree with a bug.
 *
 * ⚠️  THIS SCRIPT TEMPORARILY CHANGES THE upworkpilot TOOL'S STATUS.
 *
 *     The row ships as 'draft', and can_access_tool short-circuits a draft tool
 *     to is_admin(uid) BEFORE it ever looks at membership — so a probe user with
 *     a perfectly good membership would be denied, and every membership,
 *     expiry and suspension assertion below would test nothing.
 *
 *     So the run flips it to 'maintenance' and restores whatever it found in a
 *     finally block. 'maintenance' rather than 'published' on purpose: it passes
 *     the same access-engine branch as published, so the suite is honest, but if
 *     this script is hard-killed before its cleanup runs, the worst residue is a
 *     tool showing a maintenance notice rather than one fully open to every
 *     member. Choose the safer crash state.
 *
 * Run: pnpm verify:upworkpilot
 */
import { readFileSync } from "node:fs";
import { importSPKI, jwtVerify, decodeJwt } from "jose";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LICENCE_FN = `${URL_}/functions/v1/upworkpilot-licence`;
const KEYS_FN = `${URL_}/functions/v1/upworkpilot-keys`;
const DESKTOP_KEYS_FN = `${URL_}/functions/v1/desktop-keys`;
const SLUG = "upworkpilot";
const DESKTOP_SLUG = "raw-footage-real-story";
const PW = "pw-not-real-8813";

const svc = (p, init = {}) =>
  fetch(`${URL_}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
const token = async (email) =>
  (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PW }) }).then((r) => r.json())).access_token;
const call = (fn, tok, body = {}) =>
  fetch(fn, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const pubPem = readFileSync(new global.URL("../secrets/hub-jwt-public.pem", import.meta.url), "utf8");
const pubKey = await importSPKI(pubPem, "RS256");
// What the extension will do: RS256 only, this audience only.
const verifyAs = (audience) => ({ algorithms: ["RS256"], audience, clockTolerance: "30s" });

// ===========================================================================
// 0. STATIC: the two halves of the provider allow-list must agree.
//
// The list exists twice — once in Deno (_shared/clients/<name>.ts, which is the
// half that actually gates a release) and once in TypeScript (lib/key-release.ts,
// which decides which switches a member is shown and which ones the Server
// Action accepts). Edge Functions cannot import from lib/, so nothing enforces
// the match at compile time and a comment is the only thing asking for it.
//
// A drift here is quiet and bad in both directions: Deno wider than lib means a
// provider can be released that no screen ever asked the member about, and lib
// wider than Deno means a member grants a permission that silently does nothing.
//
// Read as TEXT, not imported: the Deno module pulls a type from a URL Node
// cannot resolve, and lib/key-release.ts starts with `import "server-only"`,
// which throws outside a React Server Component. Both lists are plain literals,
// so a regex is the honest tool here.
//
// Covers BOTH clients, not just this one — it is the general drift guard, and it
// lives in this script because this is the change that created a second list.
// ===========================================================================
console.log("\n0. The Deno and lib/ provider allow-lists agree:");
{
  const read = (p) => readFileSync(new global.URL(p, import.meta.url), "utf8");
  const libSrc = read("../lib/key-release.ts");

  const denoList = (file, constName) => {
    const m = read(file).match(
      new RegExp(`export const ${constName}\\s*=\\s*\\[([^\\]]*)\\]`),
    );
    return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : null;
  };

  // The registry entry for a slug, then its providers array.
  const libList = (slug) => {
    const block = libSrc.match(
      new RegExp(`slug:\\s*"${slug}"[\\s\\S]{0,300}?providers:\\s*\\[([^\\]]*)\\]`),
    );
    return block ? [...block[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : null;
  };

  for (const [label, file, constName, slug] of [
    ["upworkpilot", "../supabase/functions/_shared/clients/upworkpilot.ts", "UPWORKPILOT_PROVIDERS", SLUG],
    ["desktop", "../supabase/functions/_shared/clients/desktop.ts", "DESKTOP_PROVIDERS", DESKTOP_SLUG],
  ]) {
    const deno = denoList(file, constName);
    const lib = libList(slug);
    check(Array.isArray(deno) && deno.length > 0, `${label}: Deno list parsed`, JSON.stringify(deno));
    check(Array.isArray(lib) && lib.length > 0, `${label}: lib/ list parsed`, JSON.stringify(lib));
    check(
      JSON.stringify([...(deno ?? [])].sort()) === JSON.stringify([...(lib ?? [])].sort()),
      `${label}: the two halves match`,
      `deno=${JSON.stringify(deno)} lib=${JSON.stringify(lib)}`,
    );
  }

  // The specific decision this change made, asserted by name rather than left
  // to the match above: UpworkPilot gets OpenAI and nothing else.
  const up = denoList("../supabase/functions/_shared/clients/upworkpilot.ts", "UPWORKPILOT_PROVIDERS");
  check(
    JSON.stringify(up) === JSON.stringify(["openai"]),
    "upworkpilot's allow-list is exactly ['openai']",
    JSON.stringify(up),
  );
}

const stamp = Date.now();
const EMAIL_OK = `up-yes-${stamp}@example.com`;
const EMAIL_NO = `up-no-${stamp}@example.com`;
// Real-looking keys so the "is the plaintext in the response" checks are honest.
const FAKE_OPENAI = `sk-proj-upprobe${stamp}ABCDEF`;
const FAKE_ELEVEN = `el-upprobe${stamp}ABCDEF`;

let uidOk, uidNo, toolId, desktopToolId, planId, membershipId, originalStatus;

try {
  // ---- fixtures --------------------------------------------------------
  const tool = await svc(`/rest/v1/tools?slug=eq.${SLUG}&select=id,status`).then((r) => r.json());
  if (!tool?.[0]?.id) {
    console.error(`\n  The '${SLUG}' tool row is missing. Apply 20260825120000_key_release_consent.sql first.\n`);
    process.exit(1);
  }
  toolId = tool[0].id;
  originalStatus = tool[0].status;
  if (originalStatus === "archived") {
    console.error(`\n  '${SLUG}' is archived. Refusing to change its status to run a test.\n`);
    process.exit(1);
  }

  desktopToolId = (await svc(`/rest/v1/tools?slug=eq.${DESKTOP_SLUG}&select=id`).then((r) => r.json()))?.[0]?.id ?? null;

  // See the header: 'maintenance' passes the same access-engine branch as
  // 'published', so membership actually decides. Restored in finally.
  await svc(`/rest/v1/tools?id=eq.${toolId}`, { method: "PATCH", body: JSON.stringify({ status: "maintenance" }) });
  console.log(`\n  (tool '${SLUG}' temporarily ${originalStatus} -> maintenance for this run)`);

  planId = (await svc("/rest/v1/plans?slug=eq.member&select=id").then((r) => r.json()))?.[0]?.id
        ?? (await svc("/rest/v1/plans?slug=eq.founding&select=id").then((r) => r.json()))?.[0]?.id
        ?? null;

  uidOk = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL_OK, password: PW, email_confirm: true }) }).then((r) => r.json())).id;
  uidNo = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL_NO, password: PW, email_confirm: true }) }).then((r) => r.json())).id;
  await new Promise((r) => setTimeout(r, 800));

  // uidOk gets an active membership; uidNo gets nothing. access_type is
  // 'members', so the membership IS the licence.
  membershipId = (await svc("/rest/v1/memberships", { method: "POST", body: JSON.stringify({ user_id: uidOk, plan_id: planId, status: "active", source: "gift", started_at: new Date().toISOString() }) }).then((r) => r.json()))?.[0]?.id;

  const tokOk = await token(EMAIL_OK);
  const tokNo = await token(EMAIL_NO);

  // ---- 1. anonymous ----------------------------------------------------
  console.log("\n1. Anonymous is refused by both endpoints:");
  for (const [name, fn] of [["upworkpilot-licence", LICENCE_FN], ["upworkpilot-keys", KEYS_FN]]) {
    const r = await fetch(fn, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: "{}" });
    const body = await r.text();
    check(r.status === 401, `${name}: anon key (no user) → 401`, `HTTP ${r.status}`);
    check(!body.includes("eyJ") && !body.includes("sk-"), `${name}: nothing signed or secret in the body`);
  }

  // ---- 2. licence: no membership ---------------------------------------
  console.log("\n2. A user with no membership gets a SIGNED negative:");
  const negRes = await call(LICENCE_FN, tokNo);
  const neg = await negRes.json();
  check(negRes.status === 200, "→ 200 (a negative is still an answer)", `HTTP ${negRes.status}`);
  check(neg.active === false, "active: false", String(neg.active));
  let negClaims = null;
  try {
    negClaims = (await jwtVerify(neg.licence_token, pubKey, verifyAs(SLUG))).payload;
    check(true, "the negative is signed and verifies — cacheable, not forgeable");
  } catch (e) {
    check(false, "the negative verifies", e.message);
  }
  check(negClaims?.active === false, "the CLAIM says false too, not just the JSON");
  const negTtl = (negClaims?.exp ?? 0) - (negClaims?.iat ?? 0);
  check(negTtl <= 3600, "a negative is cached ~1h", `ttl=${negTtl}s`);
  check(neg.reason === "no_membership", "reason: no_membership", String(neg.reason));
  check(negClaims?.reason === "no_membership", "the reason is a SIGNED claim — survives into the cache", String(negClaims?.reason));

  // ---- 3. licence: active member, and THE TTL ---------------------------
  console.log("\n3. An active member gets a signed positive — cached for 24h, NOT 30 days:");
  const okRes = await call(LICENCE_FN, tokOk);
  const ok = await okRes.json();
  check(okRes.status === 200, "→ 200", `HTTP ${okRes.status}`);
  check(ok.active === true, "active: true", JSON.stringify(ok.reason ?? ok));
  check(ok.reason === null, "reason is null when active — no wall to explain", String(ok.reason));
  check(typeof ok.checked_at === "string", "checked_at present");
  let claims = null;
  try {
    const { payload, protectedHeader } = await jwtVerify(ok.licence_token, pubKey, verifyAs(SLUG));
    claims = payload;
    check(protectedHeader.alg === "RS256", "signed RS256 — the extension carries only the PUBLIC key");
  } catch (e) {
    check(false, "verifies against the public key", e.message);
  }
  check(claims?.sub === uidOk, "sub is the hub user id");
  check(claims?.aud === SLUG, "aud is this client", String(claims?.aud));

  const ttl = (claims?.exp ?? 0) - (claims?.iat ?? 0);
  check(
    ttl > 23 * 3600 && ttl <= 24 * 3600 + 60,
    "the offline window is ~24 hours",
    `ttl=${(ttl / 3600).toFixed(1)}h`,
  );
  // Stated as its own assertion, in the direction that actually costs money.
  // A default inherited from the desktop client would pass every other check in
  // this file and quietly hand a cancelled member a month of access.
  check(
    ttl < 2 * 86400,
    "and it is NOT the desktop's 30 days — a cancellation takes effect within a day",
    `ttl=${Math.round(ttl / 86400)}d`,
  );

  // ---- 4. THE CLAMP -----------------------------------------------------
  //
  // Deliberately SIX HOURS, not the three days verify-desktop uses. Against a
  // 24h TTL a three-day expiry is already further away than exp, so the copied
  // test would pass without the clamp existing at all — a check that cannot
  // fail is worse than no check, because it reads as coverage.
  console.log("\n4. exp is CLAMPED to the membership expiry (with 6h, inside the 24h window):");
  const soon = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ expires_at: soon }) });
  const clamped = await call(LICENCE_FN, tokOk).then((r) => r.json());
  const cc = decodeJwt(clamped.licence_token);
  const clampedTtl = cc.exp - cc.iat;
  check(clamped.active === true, "(still active — expiry is in the future)");
  check(clampedTtl <= 6 * 3600 + 60, "exp never outlives the membership", `ttl=${(clampedTtl / 3600).toFixed(1)}h`);
  check(clampedTtl < ttl, "and the clamp actually bit (shorter than the unclamped window)", `${(clampedTtl / 3600).toFixed(1)}h < ${(ttl / 3600).toFixed(1)}h`);
  // Compare INSTANTS, not strings: Postgres renders timestamptz as '…+00:00'
  // while JS toISOString() emits '…Z'. Same moment, different spelling.
  check(
    new Date(cc.membership_expires_at).getTime() === new Date(soon).getTime(),
    "membership_expires_at is a SEPARATE claim from exp",
    `claim=${cc.membership_expires_at}`,
  );
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ expires_at: null }) });

  // ---- 5. audience isolation --------------------------------------------
  console.log("\n5. This licence is rejected by any other audience:");
  for (const other of [DESKTOP_SLUG, "some-other-app"]) {
    try {
      await jwtVerify(ok.licence_token, pubKey, verifyAs(other));
      check(false, `'${other}' rejects it`, "IT VERIFIED — replay across clients is possible");
    } catch (e) {
      check(e.code === "ERR_JWT_CLAIM_VALIDATION_FAILED", `'${other}' rejects it`, e.code ?? e.message);
    }
  }

  // ---- 6. identity cannot be asserted by the caller ---------------------
  console.log("\n6. A user_id in the body is ignored — sub comes from the JWT:");
  const spoof = await call(LICENCE_FN, tokOk, { user_id: uidNo, sub: uidNo, active: true, tool_slug: DESKTOP_SLUG }).then((r) => r.json());
  check(decodeJwt(spoof.licence_token).sub === uidOk, "sub is still the JWT's user, not the body's");
  check(decodeJwt(spoof.licence_token).aud === SLUG, "aud is still this client, not the body's tool_slug", String(decodeJwt(spoof.licence_token).aud));

  // ---- 7. keys: no licence ----------------------------------------------
  console.log("\n7. upworkpilot-keys refuses a user with no licence:");
  const keysNo = await call(KEYS_FN, tokNo);
  const keysNoBody = await keysNo.text();
  check(keysNo.status === 403, "→ 403", `HTTP ${keysNo.status}`);
  check(!keysNoBody.includes("sk-"), "no key material in a refusal");

  // ---- 8. keys: consent is required -------------------------------------
  console.log("\n8. An active licence is NOT enough — consent is required:");
  // Save a real (encrypted) key through key-vault, so this exercises the true
  // storage path rather than a hand-made row.
  const saved = await fetch(`${URL_}/functions/v1/key-vault`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tokOk}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", provider: "openai", plaintext: FAKE_OPENAI }) });
  check(saved.ok, "(fixture) key saved through key-vault", `HTTP ${saved.status}`);

  const noConsent = await call(KEYS_FN, tokOk);
  const nc = await noConsent.json();
  check(noConsent.status === 200, "→ 200", `HTTP ${noConsent.status}`);
  check(nc.mode === "byok", "mode: byok is declared");
  check(nc.openai?.present === false, "openai withheld despite the key existing");
  check(nc.openai?.reason === "consent_required", "reason names the fix", String(nc.openai?.reason));
  // The base URL comes from the function's own PUBLIC_SITE_URL secret, which
  // this script cannot read — so derive it from the answer and assert the PATH,
  // which is the part that is ours.
  check(
    /\/dashboard\/keys\/permissions#upworkpilot$/.test(String(nc.openai?.consent_url)),
    "consent_required → the permissions page, anchored at this client",
    String(nc.openai?.consent_url),
  );
  const SITE = String(nc.openai?.consent_url ?? "").replace(/\/dashboard\/keys\/permissions#upworkpilot$/, "");
  check(!JSON.stringify(nc).includes(FAKE_OPENAI), "THE PLAINTEXT IS NOT IN THE RESPONSE");

  const logAfterRefusal = await svc(`/rest/v1/key_release_log?user_id=eq.${uidOk}&select=id`).then((r) => r.json());
  check(logAfterRefusal.length === 0, "a REFUSED request writes no release-log row", `${logAfterRefusal.length} rows`);

  // ---- 8b. THE ALLOW-LIST ------------------------------------------------
  //
  // The adversarial version, not the easy one. Give the member a VALID
  // ElevenLabs key AND plant a consent row for elevenlabs against THIS tool, so
  // every gate except the allow-list says yes. The only thing standing between
  // the extension and a key it was never meant to see is
  // UPWORKPILOT_PROVIDERS — which is exactly the guard that has to survive a
  // silent Chrome Web Store update.
  console.log("\n8b. A provider outside UPWORKPILOT_PROVIDERS is never released:");
  const savedEl = await fetch(`${URL_}/functions/v1/key-vault`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tokOk}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", provider: "elevenlabs", plaintext: FAKE_ELEVEN }) });
  check(savedEl.ok, "(fixture) an elevenlabs key is stored too", `HTTP ${savedEl.status}`);
  await svc(`/rest/v1/user_api_keys?user_id=eq.${uidOk}&provider=eq.elevenlabs`, { method: "PATCH", body: JSON.stringify({ status: "valid" }) });
  await svc("/rest/v1/key_release_consent", { method: "POST", body: JSON.stringify({ user_id: uidOk, tool_id: toolId, provider: "elevenlabs" }) });

  const outOfList = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(outOfList.elevenlabs === undefined, "no elevenlabs slot at all — not even a withheld one", JSON.stringify(outOfList.elevenlabs));
  check(!JSON.stringify(outOfList).includes(FAKE_ELEVEN), "THE ELEVENLABS PLAINTEXT IS NOT IN THE RESPONSE");
  check(
    Object.keys(outOfList).filter((k) => k !== "mode").join(",") === "openai",
    "the response names exactly one provider",
    Object.keys(outOfList).join(","),
  );

  // ---- 8c. cross-client isolation ---------------------------------------
  //
  // One consent table, two clients, keyed by tool_id. A bug in either function's
  // tool resolution would make a permission granted to one apply to the other —
  // and that is a consent failure, not a rate-limit bug. Cheap to assert now
  // that both exist.
  console.log("\n8c. Consent for this client does NOT unlock the other one:");
  await svc("/rest/v1/key_release_consent", { method: "POST", body: JSON.stringify({ user_id: uidOk, tool_id: toolId, provider: "openai" }) });
  await svc(`/rest/v1/user_api_keys?user_id=eq.${uidOk}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ status: "valid" }) });
  if (desktopToolId) {
    const crossed = await call(DESKTOP_KEYS_FN, tokOk).then((r) => r.json());
    // The desktop tool is 'members' + published, so this member has a licence for
    // it too — which is what makes the test meaningful: the ONLY thing withholding
    // the key is that consent was granted to a different tool_id.
    check(crossed.openai?.present === false, "desktop-keys still withholds openai", JSON.stringify(crossed.openai?.present));
    check(crossed.openai?.reason === "consent_required", "…and says consent is required", String(crossed.openai?.reason));
    check(!JSON.stringify(crossed).includes(FAKE_OPENAI), "no plaintext crossed between clients");
  } else {
    check(false, "(skipped) the desktop tool row is missing — cross-client isolation untested");
  }

  // ---- 9. release, and the trail ----------------------------------------
  console.log("\n9. With consent and a usable key, it is released — and logged:");
  const released = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(released.openai?.present === true, "openai released", JSON.stringify(released.openai?.reason));
  check(released.openai?.key === FAKE_OPENAI, "the plaintext round-trips correctly through AES-GCM");
  check(
    released.openai?.manage_url === `${SITE}/dashboard/keys?provider=openai`,
    "a RELEASED key carries manage_url → the vault, for review/replace",
    String(released.openai?.manage_url),
  );
  check(released.openai?.consent_url === undefined, "a released slot carries no consent_url — one link per slot");

  const log = await svc(`/rest/v1/key_release_log?user_id=eq.${uidOk}&tool_id=eq.${toolId}&select=provider`).then((r) => r.json());
  check(log.length === 1 && log[0].provider === "openai", "exactly one release row for this client, naming openai", `${log.length} rows`);

  // ---- 10. revocation is immediate --------------------------------------
  console.log("\n10. Revoking consent takes effect on the next call:");
  await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}&tool_id=eq.${toolId}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  const revoked = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(revoked.openai?.present === false, "openai withheld again immediately");
  check(!JSON.stringify(revoked).includes(FAKE_OPENAI), "no plaintext after revocation");

  // ---- 11. suspension beats everything ----------------------------------
  console.log("\n11. Suspension beats a live membership AND live consent:");
  await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}&tool_id=eq.${toolId}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ revoked_at: null }) });
  await svc(`/rest/v1/profiles?id=eq.${uidOk}`, { method: "PATCH", body: JSON.stringify({ is_suspended: true }) });
  const susKeys = await call(KEYS_FN, tokOk);
  const susBody = await susKeys.text();
  check(susKeys.status === 403, "upworkpilot-keys → 403 for a suspended user", `HTTP ${susKeys.status}`);
  check(!susBody.includes(FAKE_OPENAI), "no plaintext for a suspended user");

  const susLic = await call(LICENCE_FN, tokOk).then((r) => r.json());
  check(susLic.active === false, "upworkpilot-licence → active: false for a suspended user");
  // The membership below is live and unexpired, so a reason derived in the wrong
  // order would say "no_membership" and send a paid-up suspended member to
  // checkout to fix something checkout cannot fix.
  check(susLic.reason === "suspended", "reason: suspended, NOT no_membership", String(susLic.reason));
  let susClaims = null;
  try {
    susClaims = (await jwtVerify(susLic.licence_token, pubKey, verifyAs(SLUG))).payload;
  } catch (e) {
    check(false, "the suspended negative verifies", e.message);
  }
  check(susClaims?.reason === "suspended", "the signed claim carries the reason — an offline client still says 'suspended'", String(susClaims?.reason));
  const susTtl = (susClaims?.exp ?? 0) - (susClaims?.iat ?? 0);
  check(susTtl <= 3600, "the suspension negative is cached ~1h", `ttl=${susTtl}s`);
  check(
    new Date(susLic.checked_at).getTime() > Date.now() - 120_000,
    "checked_at is THIS call — the answer is read live, never cached server-side",
    String(susLic.checked_at),
  );

  await svc(`/rest/v1/profiles?id=eq.${uidOk}`, { method: "PATCH", body: JSON.stringify({ is_suspended: false }) });
  const unsus = await call(LICENCE_FN, tokOk).then((r) => r.json());
  check(unsus.active === true, "unsuspending restores active on the very next call");
  check(unsus.reason === null, "and the reason clears with it", String(unsus.reason));

  // ---- 11b. an expired membership is its own reason ---------------------
  console.log("\n11b. An expired membership reads as expired, not as suspended:");
  const past = new Date(Date.now() - 86400 * 1000).toISOString();
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ status: "expired", expires_at: past }) });
  const expLic = await call(LICENCE_FN, tokOk).then((r) => r.json());
  check(expLic.active === false, "active: false once the membership has lapsed");
  check(expLic.reason === "membership_inactive", "reason: membership_inactive", String(expLic.reason));
  check(expLic.expires_at !== null, "expires_at still carries the date to show the member", String(expLic.expires_at));
  const expKeys = await call(KEYS_FN, tokOk);
  check(expKeys.status === 403, "and the keys endpoint refuses outright", `HTTP ${expKeys.status}`);
  check(!(await expKeys.text()).includes(FAKE_OPENAI), "no plaintext for a lapsed member");
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ status: "active", expires_at: null }) });

  // ---- 12. the member owns the trail ------------------------------------
  console.log("\n12. The release log is the MEMBER's to read:");
  const asMember = await fetch(`${URL_}/rest/v1/key_release_log?select=provider,created_at`, { headers: { apikey: ANON, Authorization: `Bearer ${tokOk}` } }).then((r) => r.json());
  check(Array.isArray(asMember) && asMember.length >= 1, "the member sees their own releases", `${asMember?.length} rows`);
  const asOther = await fetch(`${URL_}/rest/v1/key_release_log?select=provider`, { headers: { apikey: ANON, Authorization: `Bearer ${tokNo}` } }).then((r) => r.json());
  check(Array.isArray(asOther) && asOther.length === 0, "another member sees none of them (RLS)", `${asOther?.length} rows`);

  // ---- 13. the vault's own guarantees are untouched ---------------------
  console.log("\n13. ciphertext is still unreachable from the browser:");
  const ct = await fetch(`${URL_}/rest/v1/user_api_keys?select=ciphertext`, { headers: { apikey: ANON, Authorization: `Bearer ${tokOk}` } });
  const ctBody = await ct.text();
  check(!ct.ok || !ctBody.includes("ciphertext") || ct.status >= 400, "a member still cannot select ciphertext, as themselves", `HTTP ${ct.status}`);
  const ctAll = await fetch(`${URL_}/rest/v1/user_api_keys?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${tokOk}` } });
  const ctAllBody = await ctAll.text();
  check(
    !ctAllBody.includes(FAKE_OPENAI) && !ctAllBody.includes("ciphertext"),
    "and `select=*` leaks neither ciphertext nor plaintext",
    `HTTP ${ctAll.status}`,
  );
} finally {
  if (uidOk) await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}`, { method: "DELETE" });
  if (uidOk) await svc(`/rest/v1/key_release_log?user_id=eq.${uidOk}`, { method: "DELETE" });
  for (const u of [uidOk, uidNo]) if (u) await svc(`/auth/v1/admin/users/${u}`, { method: "DELETE" });
  // Last, and unconditional: the tool's status is the one piece of GLOBAL state
  // this script touches, so it is the one thing that must be put back.
  if (toolId && originalStatus) {
    await svc(`/rest/v1/tools?id=eq.${toolId}`, { method: "PATCH", body: JSON.stringify({ status: originalStatus }) });
    const now = (await svc(`/rest/v1/tools?id=eq.${toolId}&select=status`).then((r) => r.json()))?.[0]?.status;
    console.log(`\n  (tool '${SLUG}' restored to ${now}${now === originalStatus ? "" : "  ⚠️ RESTORE FAILED — SET IT BACK BY HAND"})`);
  }
  console.log("  (probe users, consent, logs and keys deleted)");
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
