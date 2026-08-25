/**
 * The desktop app backend — licence + key release, against the LIVE Edge
 * Functions and DB.
 *
 * desktop-keys is the only endpoint in the product that returns a plaintext
 * member API key, so the checks here are adversarial and mostly negative:
 *   - no licence → no keys, and no signed "active"
 *   - consent is required PER PROVIDER, and revoking it takes effect at once
 *   - a user_id in the body is ignored; identity comes from the JWT
 *   - a licence token's exp is CLAMPED to the membership expiry
 *   - a licence minted for this app is rejected by any other audience
 *   - a released key is logged, and a REFUSED one is not
 *   - suspension beats a live membership, and says so: `reason: "suspended"`,
 *     signed, so a paid-up suspended member is never sent to checkout
 *
 * Licence tokens are verified with the real `jose` against the public key in
 * secrets/ — the same half the desktop binary will carry — not a
 * re-implementation that could agree with a bug.
 *
 * Run: npm run verify:desktop
 */
import { readFileSync } from "node:fs";
import { importSPKI, jwtVerify, decodeJwt } from "jose";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LICENCE_FN = `${URL_}/functions/v1/desktop-licence`;
const KEYS_FN = `${URL_}/functions/v1/desktop-keys`;
const SLUG = "raw-footage-real-story";
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
// What the desktop binary will do: RS256 only, this audience only.
const verifyAs = (audience) => ({ algorithms: ["RS256"], audience, clockTolerance: "30s" });

const stamp = Date.now();
const EMAIL_OK = `desk-yes-${stamp}@example.com`;
const EMAIL_NO = `desk-no-${stamp}@example.com`;
// A real-looking key so the "is the plaintext in the response" checks are honest.
const FAKE_OPENAI = `sk-proj-verifyprobe${stamp}ABCDEF`;

let uidOk, uidNo, toolId, planId, membershipId;

try {
  // ---- fixtures --------------------------------------------------------
  const tool = await svc(`/rest/v1/tools?slug=eq.${SLUG}&select=id`).then((r) => r.json());
  if (!tool?.[0]?.id) {
    console.error(`\n  The '${SLUG}' tool row is missing. Apply 20260818120000_desktop_app.sql first.\n`);
    process.exit(1);
  }
  toolId = tool[0].id;

  planId = (await svc("/rest/v1/plans?slug=eq.founding&select=id").then((r) => r.json()))?.[0]?.id ?? null;

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
  for (const [name, fn] of [["desktop-licence", LICENCE_FN], ["desktop-keys", KEYS_FN]]) {
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
  check(negTtl <= 3600, "a negative is cached for ~1h, not 30 days", `ttl=${negTtl}s`);
  check(neg.reason === "no_membership", "reason: no_membership", String(neg.reason));
  check(
    negClaims?.reason === "no_membership",
    "the reason is a SIGNED claim — survives into the offline cache",
    String(negClaims?.reason),
  );

  // ---- 3. licence: active membership -----------------------------------
  console.log("\n3. An active member gets a signed positive:");
  const okRes = await call(LICENCE_FN, tokOk);
  const ok = await okRes.json();
  check(okRes.status === 200, "→ 200", `HTTP ${okRes.status}`);
  check(ok.active === true, "active: true");
  check(ok.plan === "founding" || ok.plan === null, "plan reported", String(ok.plan));
  check(typeof ok.checked_at === "string", "checked_at present");
  check(ok.reason === null, "reason is null when active — no wall to explain", String(ok.reason));
  let claims = null;
  try {
    const { payload, protectedHeader } = await jwtVerify(ok.licence_token, pubKey, verifyAs(SLUG));
    claims = payload;
    check(protectedHeader.alg === "RS256", "signed RS256 — the binary carries only the PUBLIC key");
  } catch (e) {
    check(false, "verifies against the public key", e.message);
  }
  check(claims?.sub === uidOk, "sub is the hub user id");
  check(claims?.aud === SLUG, "aud is this app", String(claims?.aud));
  const ttl = (claims?.exp ?? 0) - (claims?.iat ?? 0);
  check(ttl > 29 * 86400 && ttl <= 30 * 86400, "offline window is ~30 days", `ttl=${Math.round(ttl / 86400)}d`);

  // ---- 4. THE CLAMP ----------------------------------------------------
  console.log("\n4. exp is CLAMPED to the membership expiry (the offline hole):");
  const soon = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ expires_at: soon }) });
  const clamped = await call(LICENCE_FN, tokOk).then((r) => r.json());
  const cc = decodeJwt(clamped.licence_token);
  const clampedTtl = cc.exp - cc.iat;
  check(clamped.active === true, "(still active — expiry is in the future)");
  check(clampedTtl <= 3 * 86400 + 60, "exp never outlives the membership", `ttl=${Math.round(clampedTtl / 3600)}h`);
  // Compare INSTANTS, not strings: Postgres renders timestamptz as
  // '…+00:00' while JS toISOString() emits '…Z'. Same moment, different
  // spelling — a string compare here fails on formatting and says nothing
  // about the claim being right.
  check(
    new Date(cc.membership_expires_at).getTime() === new Date(soon).getTime(),
    "membership_expires_at is a SEPARATE claim from exp",
    `claim=${cc.membership_expires_at}`,
  );
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ expires_at: null }) });

  // ---- 5. audience isolation -------------------------------------------
  console.log("\n5. A licence for this app is rejected by any other audience:");
  try {
    await jwtVerify(ok.licence_token, pubKey, verifyAs("some-other-app"));
    check(false, "another app rejects it", "IT VERIFIED — replay is possible");
  } catch (e) {
    check(e.code === "ERR_JWT_CLAIM_VALIDATION_FAILED", "another app rejects it", e.code ?? e.message);
  }

  // ---- 6. identity cannot be asserted by the caller --------------------
  console.log("\n6. A user_id in the body is ignored — sub comes from the JWT:");
  const spoof = await call(LICENCE_FN, tokOk, { user_id: uidNo, sub: uidNo, active: true }).then((r) => r.json());
  check(decodeJwt(spoof.licence_token).sub === uidOk, "sub is still the JWT's user, not the body's");

  // ---- 7. keys: no licence ---------------------------------------------
  console.log("\n7. desktop-keys refuses a user with no licence:");
  const keysNo = await call(KEYS_FN, tokNo);
  const keysNoBody = await keysNo.text();
  check(keysNo.status === 403, "→ 403", `HTTP ${keysNo.status}`);
  check(!keysNoBody.includes("sk-"), "no key material in a refusal");

  // ---- 8. keys: consent is required ------------------------------------
  console.log("\n8. An active licence is NOT enough — consent is required:");
  // Give the member a real (encrypted) OpenAI key via the key-vault function,
  // so this exercises the true storage path rather than a hand-made row.
  const saved = await fetch(`${URL_}/functions/v1/key-vault`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tokOk}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", provider: "openai", plaintext: FAKE_OPENAI }) });
  check(saved.ok, "(fixture) key saved through key-vault", `HTTP ${saved.status}`);

  const noConsent = await call(KEYS_FN, tokOk);
  const nc = await noConsent.json();
  check(noConsent.status === 200, "→ 200", `HTTP ${noConsent.status}`);
  check(nc.mode === "byok", "mode: byok is declared");
  check(nc.openai?.present === false, "openai withheld despite the key existing");
  check(nc.openai?.reason === "consent_required", "reason names the fix", String(nc.openai?.reason));
  // The base URL comes from the function's own PUBLIC_SITE_URL secret, which
  // this script cannot read — so derive it from the answer rather than
  // hardcoding a host, and assert the PATH, which is the part that is ours.
  check(
    /\/dashboard\/keys\/desktop$/.test(String(nc.openai?.consent_url)),
    "consent_required → the DESKTOP page (the only place consent can be granted)",
    String(nc.openai?.consent_url),
  );
  const SITE = String(nc.openai?.consent_url ?? "").replace(/\/dashboard\/keys\/desktop$/, "");
  check(
    nc.elevenlabs?.consent_url === `${SITE}/dashboard/keys/desktop`,
    "elevenlabs gets the same consent page — the two providers are symmetric",
    String(nc.elevenlabs?.consent_url),
  );
  check(!JSON.stringify(nc).includes(FAKE_OPENAI), "THE PLAINTEXT IS NOT IN THE RESPONSE");

  const logAfterRefusal = await svc(`/rest/v1/key_release_log?user_id=eq.${uidOk}&select=id`).then((r) => r.json());
  check(logAfterRefusal.length === 0, "a REFUSED request writes no access log row", `${logAfterRefusal.length} rows`);

  // ---- 8b. an INVALID key is withheld even with consent ----------------
  //
  // The probe key is deliberately fake, so key-vault's verify marks it
  // 'invalid' on save. That is not an inconvenience to work around — it is a
  // second, independent gate worth asserting: consent says "you may read my
  // key", it does not say "hand over one you already know is broken".
  console.log("\n8b. Consent granted, but the key is known-invalid:");
  await svc("/rest/v1/key_release_consent", { method: "POST", body: JSON.stringify({ user_id: uidOk, tool_id: toolId, provider: "openai" }) });
  const storedStatus = (await svc(`/rest/v1/user_api_keys?user_id=eq.${uidOk}&provider=eq.openai&select=status`).then((r) => r.json()))?.[0]?.status;
  check(storedStatus === "invalid", "(fixture) the fake key verified as invalid", String(storedStatus));
  const invalidRes = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(invalidRes.openai?.present === false, "consent alone does NOT release a broken key");
  check(invalidRes.openai?.reason === "key_invalid", "reason distinguishes 'broken' from 'never added'", String(invalidRes.openai?.reason));
  check(
    invalidRes.openai?.consent_url === `${SITE}/dashboard/keys?provider=openai`,
    "key_invalid → the VAULT, provider preselected (replacing a key is not a consent problem)",
    String(invalidRes.openai?.consent_url),
  );

  // ---- 8c. no_key: consented, but nothing stored -----------------------
  //
  // The one refusal the suite never exercised, and the one whose URL the
  // desktop app was hardcoding. elevenlabs has consent here but no key row.
  console.log("\n8c. Consented, but no key stored at all:");
  await svc("/rest/v1/key_release_consent", { method: "POST", body: JSON.stringify({ user_id: uidOk, tool_id: toolId, provider: "elevenlabs" }) });
  const noKeyRes = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(noKeyRes.elevenlabs?.present === false, "elevenlabs withheld — consent without a key releases nothing");
  check(noKeyRes.elevenlabs?.reason === "no_key", "reason: no_key", String(noKeyRes.elevenlabs?.reason));
  check(
    noKeyRes.elevenlabs?.consent_url === `${SITE}/dashboard/keys?provider=elevenlabs`,
    "no_key → the VAULT with ?provider=elevenlabs, symmetric with openai",
    String(noKeyRes.elevenlabs?.consent_url),
  );
  // Every withheld slot carries a URL now — that is what lets the app stop guessing.
  const withheld = ["openai", "elevenlabs"].map((p) => noKeyRes[p]).filter((s) => s && s.present === false);
  check(
    withheld.length > 0 && withheld.every((s) => typeof s.consent_url === "string" && s.consent_url.startsWith("http")),
    "EVERY withheld slot carries a consent_url",
    `${withheld.length} withheld, all with a URL`,
  );
  await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}&tool_id=eq.${toolId}&provider=eq.elevenlabs`, { method: "DELETE" });
  check(!JSON.stringify(invalidRes).includes(FAKE_OPENAI), "no plaintext for an invalid key");

  // ---- 9. keys: with consent AND a usable key --------------------------
  //
  // Flip the stored status to 'valid' with the service role. We are testing
  // the consent gate and the AES round-trip, not OpenAI's opinion of a made-up
  // key — and the ciphertext is the real one key-vault wrote, so the decrypt
  // path is still exercised end to end.
  console.log("\n9. With consent and a usable key, it is released — and logged:");
  await svc(`/rest/v1/user_api_keys?user_id=eq.${uidOk}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ status: "valid" }) });
  const withConsent = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(withConsent.openai?.present === true, "openai released");
  check(withConsent.openai?.key === FAKE_OPENAI, "the plaintext round-trips correctly through AES-GCM");
  check(withConsent.elevenlabs?.present === false, "elevenlabs still withheld — consent is PER PROVIDER");
  check(
    withConsent.openai?.manage_url === `${SITE}/dashboard/keys?provider=openai`,
    "a RELEASED key carries manage_url → the vault, for review/replace",
    String(withConsent.openai?.manage_url),
  );
  check(
    withConsent.openai?.consent_url === undefined,
    "a released slot carries no consent_url — one URL per slot, and the field names which",
    String(withConsent.openai?.consent_url),
  );
  // The invariant the desktop app can actually rely on: every slot, in either
  // state, hands back exactly one link. No state needs the app to build a URL.
  const allSlots = ["openai", "elevenlabs"].map((p) => withConsent[p]).filter(Boolean);
  check(
    allSlots.length === 2 &&
      allSlots.every((s) => typeof (s.present ? s.manage_url : s.consent_url) === "string"),
    "EVERY slot carries a link, released or withheld",
    `${allSlots.length} slots`,
  );

  const log = await svc(`/rest/v1/key_release_log?user_id=eq.${uidOk}&select=provider`).then((r) => r.json());
  check(log.length === 1 && log[0].provider === "openai", "exactly one access row, naming openai", `${log.length} rows`);

  // ---- 10. revocation is immediate -------------------------------------
  console.log("\n10. Revoking consent takes effect on the next call:");
  await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}&tool_id=eq.${toolId}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
  const revoked = await call(KEYS_FN, tokOk).then((r) => r.json());
  check(revoked.openai?.present === false, "openai withheld again immediately");
  check(!JSON.stringify(revoked).includes(FAKE_OPENAI), "no plaintext after revocation");

  // ---- 11. suspension beats everything ---------------------------------
  console.log("\n11. Suspension beats a live membership AND live consent:");
  await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}&tool_id=eq.${toolId}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ revoked_at: null }) });
  await svc(`/rest/v1/profiles?id=eq.${uidOk}`, { method: "PATCH", body: JSON.stringify({ is_suspended: true }) });
  const susKeys = await call(KEYS_FN, tokOk);
  const susBody = await susKeys.text();
  check(susKeys.status === 403, "desktop-keys → 403 for a suspended user", `HTTP ${susKeys.status}`);
  check(!susBody.includes(FAKE_OPENAI), "no plaintext for a suspended user");
  const susLic = await call(LICENCE_FN, tokOk).then((r) => r.json());
  check(susLic.active === false, "desktop-licence → active: false for a suspended user");

  // The distinct signal. The membership below is live and unexpired, so a
  // reason derived in the wrong order would say "no_membership" here and send a
  // paid-up suspended member to checkout to fix something checkout cannot fix.
  check(susLic.reason === "suspended", "reason: suspended, NOT no_membership", String(susLic.reason));
  let susClaims = null;
  try {
    susClaims = (await jwtVerify(susLic.licence_token, pubKey, verifyAs(SLUG))).payload;
  } catch (e) {
    check(false, "the suspended negative verifies", e.message);
  }
  check(susClaims?.active === false, "the signed claim agrees: active false");
  check(
    susClaims?.reason === "suspended",
    "the signed claim carries the reason — an offline app still says 'suspended'",
    String(susClaims?.reason),
  );
  const susTtl = (susClaims?.exp ?? 0) - (susClaims?.iat ?? 0);
  check(susTtl <= 3600, "the suspension negative is cached ~1h, not 30 days", `ttl=${susTtl}s`);
  check(
    new Date(susLic.checked_at).getTime() > Date.now() - 120_000,
    "checked_at is THIS call — the answer is read live, never cached server-side",
    String(susLic.checked_at),
  );

  // Unsuspending is equally immediate, in the same direction. A suspension that
  // could not be undone on the next call would be a support problem, not a
  // security feature.
  await svc(`/rest/v1/profiles?id=eq.${uidOk}`, { method: "PATCH", body: JSON.stringify({ is_suspended: false }) });
  const unsus = await call(LICENCE_FN, tokOk).then((r) => r.json());
  check(unsus.active === true, "unsuspending restores active on the very next call");
  check(unsus.reason === null, "and the reason clears with it", String(unsus.reason));

  // ---- 11b. an expired membership is its own reason --------------------
  console.log("\n11b. An expired membership reads as expired, not as suspended:");
  const past = new Date(Date.now() - 86400 * 1000).toISOString();
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ status: "expired", expires_at: past }) });
  const expLic = await call(LICENCE_FN, tokOk).then((r) => r.json());
  check(expLic.active === false, "active: false once the membership has lapsed");
  check(expLic.reason === "membership_inactive", "reason: membership_inactive", String(expLic.reason));
  check(expLic.expires_at !== null, "expires_at still carries the date to show the member", String(expLic.expires_at));
  await svc(`/rest/v1/memberships?id=eq.${membershipId}`, { method: "PATCH", body: JSON.stringify({ status: "active", expires_at: null }) });

  // ---- 12. the member can read their own trail, and only their own -----
  console.log("\n12. The access log is the MEMBER's to read:");
  const asMember = await fetch(`${URL_}/rest/v1/key_release_log?select=provider,created_at`, { headers: { apikey: ANON, Authorization: `Bearer ${tokOk}` } }).then((r) => r.json());
  check(Array.isArray(asMember) && asMember.length >= 1, "the member sees their own reads", `${asMember?.length} rows`);
  const asOther = await fetch(`${URL_}/rest/v1/key_release_log?select=provider`, { headers: { apikey: ANON, Authorization: `Bearer ${tokNo}` } }).then((r) => r.json());
  check(Array.isArray(asOther) && asOther.length === 0, "another member sees none of them (RLS)", `${asOther?.length} rows`);

  // ---- 13. ciphertext is still unreachable from the browser ------------
  console.log("\n13. The vault's own guarantees are untouched:");
  const ct = await fetch(`${URL_}/rest/v1/user_api_keys?select=ciphertext`, { headers: { apikey: ANON, Authorization: `Bearer ${tokOk}` } });
  const ctBody = await ct.text();
  check(!ct.ok || !ctBody.includes("ciphertext") || ct.status >= 400, "a member still cannot select ciphertext", `HTTP ${ct.status}`);
} finally {
  if (uidOk) await svc(`/rest/v1/key_release_consent?user_id=eq.${uidOk}`, { method: "DELETE" });
  if (uidOk) await svc(`/rest/v1/key_release_log?user_id=eq.${uidOk}`, { method: "DELETE" });
  for (const u of [uidOk, uidNo]) if (u) await svc(`/auth/v1/admin/users/${u}`, { method: "DELETE" });
  console.log("\n  (probe users, consent, logs and keys deleted)");
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
