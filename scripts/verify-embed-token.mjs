/**
 * Phase 11, Step 2 — the embed token, against the LIVE Edge Function and DB.
 *
 * The token asserts identity and tool access to an app we do not control, so the
 * checks are adversarial and mostly negative:
 *   - no access → no token (not an empty-claims token: no token at all)
 *   - a token names ONLY its audience app, even when the user owns other tools
 *   - a token minted for app A is rejected by app B (aud, enforced)
 *   - a user_id in the body is ignored; sub comes from the JWT
 *   - a revoked grant is honoured by the NEXT mint (live read, nothing cached)
 *   - the token expires, and no key material is ever in a response
 *
 * Tokens are verified with the real `jose`, using the animator's exact verify
 * options (lib/hub/verify.ts) and the public key from secrets/ — not a
 * re-implementation that could agree with a bug.
 */
import { readFileSync } from "node:fs";
import { importSPKI, jwtVerify, decodeJwt } from "jose";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FN = `${URL_}/functions/v1/embed-token`;
const PW = "pw-not-real-5521";

const svc = (p, init = {}) =>
  fetch(`${URL_}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
const token = async (email) =>
  (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PW }) }).then((r) => r.json())).access_token;
const mint = (tok, body) =>
  fetch(FN, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

// The animator's verify options, copied from its lib/hub/verify.ts.
const pubPem = readFileSync(new global.URL("../secrets/hub-jwt-public.pem", import.meta.url), "utf8");
const pubKey = await importSPKI(pubPem, "RS256");
const verifyAs = (audience) => ({ algorithms: ["RS256"], audience, clockTolerance: "30s", maxTokenAge: "1h" });

const stamp = Date.now();
const APP_A = `test-embed-a-${stamp}`;   // the audience app
const APP_B = `test-embed-b-${stamp}`;   // a second app the same user also owns
const EDGE_TOOL = `test-embed-edge-${stamp}`;
let uidWith, uidWithout, toolA, toolB, toolEdge;

const mkTool = async (slug, runtime) =>
  (await svc("/rest/v1/tools", { method: "POST", body: JSON.stringify({ slug, name: slug, tagline: "probe", status: "published", access_type: "manual", runtime }) }).then((r) => r.json()))[0];

try {
  // ---- fixtures --------------------------------------------------------
  uidWith = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: `embed-yes-${stamp}@example.com`, password: PW, email_confirm: true }) }).then((r) => r.json())).id;
  uidWithout = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: `embed-no-${stamp}@example.com`, password: PW, email_confirm: true }) }).then((r) => r.json())).id;
  await new Promise((r) => setTimeout(r, 800));

  toolA = await mkTool(APP_A, "iframe");
  toolB = await mkTool(APP_B, "iframe");
  toolEdge = await mkTool(EDGE_TOOL, "edge_function");

  // access_type='manual', so ONLY an explicit grant opens it.
  await svc("/rest/v1/user_tool_access", { method: "POST", body: JSON.stringify([{ user_id: uidWith, tool_id: toolA.id, source: "manual" }, { user_id: uidWith, tool_id: toolB.id, source: "manual" }]) });

  const tokWith = await token(`embed-yes-${stamp}@example.com`);
  const tokWithout = await token(`embed-no-${stamp}@example.com`);

  // ---- 1. anonymous ----------------------------------------------------
  console.log("\n1. Anonymous cannot mint:");
  const anon = await fetch(FN, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: JSON.stringify({ tool_slug: APP_A }) });
  const anonBody = await anon.text();
  check(anon.status === 401, "anon key (no user) → 401", `HTTP ${anon.status}`);
  check(!anonBody.includes("eyJ"), "no token in the response body");

  // ---- 2. a member WITHOUT access --------------------------------------
  console.log("\n2. A member without access gets NO token:");
  const denied = await mint(tokWithout, { tool_slug: APP_A });
  const deniedBody = await denied.text();
  check(denied.status === 403, "→ 403", `HTTP ${denied.status}`);
  check(!deniedBody.includes("eyJ"), "no token minted, not even an empty-claims one", deniedBody.slice(0, 60));

  // ---- 3. a member WITH access -----------------------------------------
  console.log("\n3. A member with access gets a valid token:");
  const okRes = await mint(tokWith, { tool_slug: APP_A });
  const ok = await okRes.json();
  check(okRes.status === 200, "→ 200", `HTTP ${okRes.status}`);
  let claims = null;
  try {
    const { payload, protectedHeader } = await jwtVerify(ok.token, pubKey, verifyAs(APP_A));
    claims = payload;
    check(protectedHeader.alg === "RS256", "signed RS256, verifies against the emitted public key");
  } catch (e) {
    check(false, "verifies against the emitted public key", e.message);
  }
  check(claims?.sub === uidWith, "sub is the hub user id", `sub=${claims?.sub?.slice(0, 8)}…`);
  check(claims?.email === `embed-yes-${stamp}@example.com`, "email claim present", claims?.email);
  check(claims?.aud === APP_A, "aud is the specific app", String(claims?.aud));
  check(typeof claims?.iss === "string" && claims.iss.startsWith("http"), "iss present", String(claims?.iss));
  check(typeof claims?.iat === "number", "iat present");
  const ttl = (claims?.exp ?? 0) - (claims?.iat ?? 0);
  check(ttl === 3600, "exp is 60 minutes after iat — the animator's maxTokenAge ceiling", `ttl=${ttl}s`);

  // ---- 4. THE SCOPE: only the audience app, not everything they own -----
  console.log("\n4. The tools claim is scoped to the audience app:");
  const idsA = new Set((await svc(`/rest/v1/user_tool_access?user_id=eq.${uidWith}&select=tool_id`).then((r) => r.json())).map((r) => r.tool_id));
  check(idsA.has(toolA.id) && idsA.has(toolB.id), "(fixture) the user really does own BOTH apps");
  check(JSON.stringify(claims?.tools) === JSON.stringify([APP_A]), "tools = [the audience app] only", JSON.stringify(claims?.tools));
  check(!claims?.tools?.includes(APP_B), "the other app they own is NOT named in this token");

  // ---- 5. THE REPLAY HOLE, closed --------------------------------------
  console.log("\n5. A token minted for app A is rejected by app B (aud enforced):");
  try {
    await jwtVerify(ok.token, pubKey, verifyAs(APP_B));
    check(false, "app B rejects app A's token", "IT VERIFIED — replay is possible");
  } catch (e) {
    check(e.code === "ERR_JWT_CLAIM_VALIDATION_FAILED", "app B rejects app A's token", e.code ?? e.message);
  }

  // ---- 6. identity cannot be asserted by the caller ---------------------
  console.log("\n6. A user_id in the body is ignored — sub comes from the JWT:");
  const spoof = await mint(tokWith, { tool_slug: APP_A, user_id: uidWithout, sub: uidWithout, email: "attacker@example.com" }).then((r) => r.json());
  const spoofClaims = spoof.token ? decodeJwt(spoof.token) : {};
  check(spoofClaims.sub === uidWith, "sub is still the JWT's user, not the body's", `sub=${spoofClaims.sub?.slice(0, 8)}…`);
  check(spoofClaims.email === `embed-yes-${stamp}@example.com`, "email is still the JWT's user");

  // ---- 7. non-iframe tools get no identity token ------------------------
  console.log("\n7. A non-iframe tool cannot mint an embed token:");
  await svc("/rest/v1/user_tool_access", { method: "POST", body: JSON.stringify({ user_id: uidWith, tool_id: toolEdge.id, source: "manual" }) });
  const edge = await mint(tokWith, { tool_slug: EDGE_TOOL });
  const edgeBody = await edge.text();
  check(edge.status === 400, "an edge_function tool → 400", `HTTP ${edge.status}`);
  check(!edgeBody.includes("eyJ"), "no token, even though the user has access to it");

  const missing = await mint(tokWith, { tool_slug: `does-not-exist-${stamp}` });
  check(missing.status === 404, "an unknown slug → 404", `HTTP ${missing.status}`);

  // ---- 8. expiry --------------------------------------------------------
  console.log("\n8. The token expires:");
  const past = new Date((claims.exp + 60) * 1000); // 60s past exp, beyond the 30s tolerance
  try {
    await jwtVerify(ok.token, pubKey, { ...verifyAs(APP_A), currentDate: past });
    check(false, "rejected once exp passes", "STILL VALID after exp");
  } catch (e) {
    check(e.code === "ERR_JWT_EXPIRED", "rejected once exp passes (checked at exp+60s)", e.code ?? e.message);
  }

  // ---- 9. THE INVARIANT: access is read live, never persisted -----------
  console.log("\n9. Revoking access is honoured by the NEXT mint (live read):");
  await svc(`/rest/v1/user_tool_access?user_id=eq.${uidWith}&tool_id=eq.${toolA.id}`, { method: "DELETE" });
  const afterRevoke = await mint(tokWith, { tool_slug: APP_A });
  check(afterRevoke.status === 403, "revoked → 403 immediately, no cached grant", `HTTP ${afterRevoke.status}`);

  // Suspension beats everything (can_access_tool), so it must beat this too.
  await svc("/rest/v1/user_tool_access", { method: "POST", body: JSON.stringify({ user_id: uidWith, tool_id: toolA.id, source: "manual" }) });
  check((await mint(tokWith, { tool_slug: APP_A })).status === 200, "(re-granted → 200 again)");
  await svc(`/rest/v1/profiles?id=eq.${uidWith}`, { method: "PATCH", body: JSON.stringify({ is_suspended: true }) });
  const susp = await mint(tokWith, { tool_slug: APP_A });
  check(susp.status === 403, "a suspended user gets no token, grant or not", `HTTP ${susp.status}`);
  await svc(`/rest/v1/profiles?id=eq.${uidWith}`, { method: "PATCH", body: JSON.stringify({ is_suspended: false }) });

  // ---- 10. no key material anywhere in a response -----------------------
  console.log("\n10. No key material is ever returned:");
  const fresh = await mint(tokWith, { tool_slug: APP_A }).then((r) => r.text());
  check(!/PRIVATE KEY|BEGIN RSA|HUB_JWT_PRIVATE_KEY/.test(fresh), "no PEM / no env name in the response body");
  const privPem = readFileSync(new global.URL("../secrets/hub-jwt-private.pem", import.meta.url), "utf8");
  const privBody = privPem.split("\n").filter((l) => l && !l.includes("---"))[0];
  check(!fresh.includes(privBody), "no private key bytes in the response body");
} finally {
  for (const t of [toolA, toolB, toolEdge]) if (t?.id) await svc(`/rest/v1/tools?id=eq.${t.id}`, { method: "DELETE" });
  for (const u of [uidWith, uidWithout]) if (u) await svc(`/auth/v1/admin/users/${u}`, { method: "DELETE" });
  console.log("\n  (probe users and tools deleted)");
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
