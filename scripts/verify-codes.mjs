/**
 * Phase 9 — access codes + referrals. The critical checks: every grant lands in
 * memberships / user_tool_access (the engine's tables), members can't self-grant
 * or read codes, and the redeem/referral RPCs enforce their rules.
 */
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const svc = (p, i = {}) => fetch(`${SB}${p}`, { ...i, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const token = async (email, pw) => (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) }).then(r => r.json())).access_token;
const rpcAs = (tok, fn, args) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(args) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const mk = async (email) => (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-c-1", email_confirm: true }) }).then(r => r.json())).id;

const A = `codeuser-a-${Date.now()}@example.com`;
const B = `codeuser-b-${Date.now()}@example.com`;
const admin = `codeadmin-${Date.now()}@example.com`;
let aId, bId, adminId;
const madeCodeIds = [];
try {
  aId = await mk(A); bId = await mk(B); adminId = await mk(admin);
  await new Promise(r => setTimeout(r, 700));
  await svc(`/rest/v1/profiles?id=eq.${adminId}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
  const aTok = await token(A, "pw-c-1");
  const bTok = await token(B, "pw-c-1");

  const yt = (await svc("/rest/v1/tools?slug=eq.youtube-lead-finder&select=id").then(r => r.json()))[0].id;
  const plan = (await svc("/rest/v1/plans?is_default=eq.true&select=id").then(r => r.json()))[0].id;

  console.log("\n1. Members cannot read access_codes at all:");
  const mk1 = (await svc("/rest/v1/access_codes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ code: `TESTM-${Date.now()}`, kind: "membership", plan_id: plan, max_uses: 2 }) }).then(r => r.json()))[0];
  madeCodeIds.push(mk1.id);
  const readCodes = await fetch(`${SB}/rest/v1/access_codes?select=code`, { headers: { apikey: ANON, Authorization: `Bearer ${aTok}` } }).then(r => r.json());
  check(Array.isArray(readCodes) && readCodes.length === 0, "member reads 0 access_codes (RLS)", `got ${Array.isArray(readCodes) ? readCodes.length : "?"}`);

  console.log("\n2. A member CANNOT self-grant by inserting into memberships / user_tool_access:");
  const forgeMem = await fetch(`${SB}/rest/v1/memberships`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${aTok}`, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: aId, status: "active" }) });
  check(!forgeMem.ok, "direct INSERT into memberships is rejected", `HTTP ${forgeMem.status}`);
  const forgeTool = await fetch(`${SB}/rest/v1/user_tool_access`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${aTok}`, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: aId, tool_id: yt }) });
  check(!forgeTool.ok, "direct INSERT into user_tool_access is rejected", `HTTP ${forgeTool.status}`);

  console.log("\n3. Redeem a MEMBERSHIP code → grant lands in memberships (source='code'):");
  const r1 = await rpcAs(aTok, "redeem_access_code", { p_code: mk1.code });
  check(r1.status === 200 && r1.body?.kind === "membership", "redeem succeeds", `status=${r1.status}`);
  const mem = (await svc(`/rest/v1/memberships?user_id=eq.${aId}&select=status,source`).then(r => r.json()))[0];
  check(mem?.status === "active" && mem?.source === "code", "membership active with source=code (engine's table)", JSON.stringify(mem));

  console.log("\n4. Double-redeem is blocked; used_count increments:");
  const r2 = await rpcAs(aTok, "redeem_access_code", { p_code: mk1.code });
  check(r2.status >= 400 && /already redeemed/i.test(JSON.stringify(r2.body)), "same user redeeming again → rejected", `status=${r2.status}`);
  const used = (await svc(`/rest/v1/access_codes?id=eq.${mk1.id}&select=used_count`).then(r => r.json()))[0].used_count;
  check(used === 1, "used_count is 1 (not double-counted)", `used=${used}`);

  console.log("\n5. Redeem a TOOL-ACCESS code → grant lands in user_tool_access (source='code'):");
  const tc = (await svc("/rest/v1/access_codes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ code: `TESTT-${Date.now()}`, kind: "tool_access", tool_ids: [yt], max_uses: 1, duration_days: 30 }) }).then(r => r.json()))[0];
  madeCodeIds.push(tc.id);
  const r3 = await rpcAs(bTok, "redeem_access_code", { p_code: tc.code });
  check(r3.status === 200 && r3.body?.kind === "tool_access", "tool-access redeem succeeds", `status=${r3.status}`);
  const grant = (await svc(`/rest/v1/user_tool_access?user_id=eq.${bId}&tool_id=eq.${yt}&select=source,expires_at`).then(r => r.json()))[0];
  check(grant?.source === "code" && grant?.expires_at, "user_tool_access row with source=code + 30d expiry", JSON.stringify(grant));
  // And the engine now says B can access it:
  const canB = await fetch(`${SB}/rest/v1/rpc/can_access_tool`, { method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_tool_id: yt, uid: bId }) }).then(r => r.json());
  check(canB === true, "can_access_tool(yt, B) is now true (engine reads the grant)", `${canB}`);

  console.log("\n6. max_uses enforced:");
  const r4 = await rpcAs(bTok, "redeem_access_code", { p_code: tc.code }); // B already redeemed → already-redeemed, but also max_uses=1 spent
  check(r4.status >= 400, "a fully-used code can't be redeemed again", `status=${r4.status}`);

  console.log("\n7. Referral: B signs up 'referred by' A; auto-grant at threshold:");
  // A's referral code:
  const aCode = (await svc(`/rest/v1/profiles?id=eq.${aId}&select=referral_code`).then(r => r.json()))[0].referral_code;
  // Reset A to have no membership so we can see the auto-grant fire (A got one from the code above).
  await svc(`/rest/v1/memberships?user_id=eq.${aId}`, { method: "DELETE" });
  // Make 3 referred users pointing at A (simulating 3 sign-ups via A's link).
  const refIds = [];
  for (let i = 0; i < 3; i++) {
    const id = await mk(`ref-${i}-${Date.now()}@example.com`);
    refIds.push(id);
    await new Promise(r => setTimeout(r, 250));
  }
  // Directly set referred_by for the first two, then have the 3rd claim via RPC to test the grant path.
  await svc(`/rest/v1/profiles?id=in.(${refIds[0]},${refIds[1]})`, { method: "PATCH", body: JSON.stringify({ referred_by: aId }) });
  // Use B (fresh, referred_by null) to claim A's code as the 3rd referral.
  await svc(`/rest/v1/profiles?id=eq.${bId}`, { method: "PATCH", body: JSON.stringify({ referred_by: null }) });
  const claim = await rpcAs(bTok, "claim_referral", { p_code: aCode });
  check(claim.status === 200 && claim.body?.claimed === true, "claim_referral attributes B to A", JSON.stringify(claim.body));
  check(claim.body?.granted === true, "3rd referral auto-grants A a membership", `granted=${claim.body?.granted}`);
  const aMem = (await svc(`/rest/v1/memberships?user_id=eq.${aId}&select=status,source`).then(r => r.json()))[0];
  check(aMem?.status === "active" && aMem?.source === "referral", "A's membership is active, source=referral (engine's table)", JSON.stringify(aMem));

  console.log("\n8. Referral never re-attributes or self-refers:");
  const reclaim = await rpcAs(bTok, "claim_referral", { p_code: aCode });
  check(reclaim.body?.claimed === false, "claiming again is a no-op (referred_by already set)", JSON.stringify(reclaim.body));
  const selfCode = (await svc(`/rest/v1/profiles?id=eq.${aId}&select=referral_code`).then(r => r.json()))[0].referral_code;
  await svc(`/rest/v1/profiles?id=eq.${aId}`, { method: "PATCH", body: JSON.stringify({ referred_by: null }) });
  const selfClaim = await rpcAs(aTok, "claim_referral", { p_code: selfCode });
  check(selfClaim.body?.claimed === false, "a user can't refer themselves", JSON.stringify(selfClaim.body));

  for (const id of refIds) await svc(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
} finally {
  for (const id of madeCodeIds) await svc(`/rest/v1/access_codes?id=eq.${id}`, { method: "DELETE" });
  for (const id of [aId, bId, adminId]) if (id) await svc(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  console.log("\n  (probe users + codes deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
