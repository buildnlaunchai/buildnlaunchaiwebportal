/**
 * Phase 3 acceptance checks against the LIVE database. Exercises the RLS and the
 * constraints directly — the Server Action's Turnstile/honeypot/rate-limit are
 * tested at the HTTP layer separately. Creates two throwaway users and cleans up.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const svc = (p, init = {}) =>
  fetch(`${URL}${p}`, {
    ...init,
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
const asUser = (tok, p, init = {}) =>
  fetch(`${URL}${p}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
};

async function mkUser(email) {
  const r = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: "probe-pw-8823-not-real", email_confirm: true }),
  });
  return (await r.json()).id;
}
async function token(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "probe-pw-8823-not-real" }),
  });
  return (await r.json()).access_token;
}

const alice = `applicant-a-${Date.now()}@example.com`;
const bob = `applicant-b-${Date.now()}@example.com`;
let aliceId, bobId;

try {
  aliceId = await mkUser(alice);
  bobId = await mkUser(bob);
  await new Promise((r) => setTimeout(r, 600));
  const aTok = await token(alice);
  const bTok = await token(bob);

  console.log("\n1. A member can submit their own application (RLS insert-own):");
  const ins = await asUser(aTok, "/rest/v1/applications", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: aliceId,
      email: alice,
      full_name: "Alice Probe",
      use_case: "Automate weekly competitor research digests for my newsletter.",
      tools_wanted: ["youtube-lead-finder", "hacker-news-digest"],
      willingness_to_pay: "$20-50",
      heard_from: "youtube",
    }),
  });
  const [app] = ins.ok ? await ins.json() : [null];
  check(ins.ok && app?.status === "pending", "insert succeeds, defaults to pending", `HTTP ${ins.status}`);

  console.log("\n2. One-open-application-per-user (partial unique index):");
  const dup = await asUser(aTok, "/rest/v1/applications", {
    method: "POST",
    body: JSON.stringify({ user_id: aliceId, email: alice, full_name: "Alice Probe", use_case: "second application attempt while first is pending" }),
  });
  check(dup.status === 409, "a second PENDING application is rejected (409)", `HTTP ${dup.status}`);

  console.log("\n3. A member cannot apply AS SOMEONE ELSE (insert-own check):");
  const forge = await asUser(aTok, "/rest/v1/applications", {
    method: "POST",
    body: JSON.stringify({ user_id: bobId, email: bob, full_name: "Not Alice", use_case: "forging an application for another user account here" }),
  });
  check(!forge.ok, "insert with someone else's user_id is rejected", `HTTP ${forge.status}`);

  console.log("\n4. Row isolation — a member sees only their own application:");
  const mine = await asUser(aTok, "/rest/v1/applications?select=email");
  const rows = await mine.json();
  check(Array.isArray(rows) && rows.length === 1 && rows[0].email === alice, "Alice sees exactly her 1 application", `got ${Array.isArray(rows) ? rows.length : "?"}`);
  const bobSees = await asUser(bTok, "/rest/v1/applications?select=email");
  const bobRows = await bobSees.json();
  check(Array.isArray(bobRows) && bobRows.length === 0, "Bob (no application) sees 0", `got ${bobRows.length}`);

  console.log("\n5. A member cannot review (set status) — that's admin-only:");
  await asUser(aTok, `/rest/v1/applications?id=eq.${app.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" }),
  });
  const afterSelf = await svc(`/rest/v1/applications?id=eq.${app.id}&select=status`);
  const [stillPending] = await afterSelf.json();
  check(stillPending?.status === "pending", "self-approve does not change status", `status=${stillPending?.status}`);

  console.log("\n6. discord_webhook_url is never exposed to a client:");
  const pubView = await asUser(aTok, "/rest/v1/app_settings_public?select=*");
  const pv = await pubView.json();
  const cols = Array.isArray(pv) && pv[0] ? Object.keys(pv[0]) : [];
  check(!cols.includes("discord_webhook_url"), "app_settings_public has no discord_webhook_url", cols.join(","));
  const baseTable = await asUser(aTok, "/rest/v1/app_settings?select=discord_webhook_url");
  const bt = await baseTable.json();
  check(!Array.isArray(bt) || bt.length === 0, "app_settings base table returns 0 rows to a member", Array.isArray(bt) ? `${bt.length} rows` : JSON.stringify(bt).slice(0, 40));

  console.log("\n7. rate_limit_take enforces a window:");
  const bucket = `test:${Date.now()}`;
  const r1 = await svc("/rest/v1/rpc/rate_limit_take", { method: "POST", body: JSON.stringify({ p_bucket: bucket, p_limit: 2, p_window: "1 hour" }) });
  const r2 = await svc("/rest/v1/rpc/rate_limit_take", { method: "POST", body: JSON.stringify({ p_bucket: bucket, p_limit: 2, p_window: "1 hour" }) });
  const r3 = await svc("/rest/v1/rpc/rate_limit_take", { method: "POST", body: JSON.stringify({ p_bucket: bucket, p_limit: 2, p_window: "1 hour" }) });
  const [v1, v2, v3] = [await r1.json(), await r2.json(), await r3.json()];
  check(v1 === true && v2 === true && v3 === false, "take() allows 2, denies the 3rd", `${v1},${v2},${v3}`);

  console.log("\n8. Admin sees all applications; a member cannot:");
  await svc(`/rest/v1/profiles?id=eq.${bobId}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
  const bTokAdmin = await token(bob); // re-mint so the role is fresh (JWT claims don't matter; RLS reads the table)
  const adminSees = await asUser(bTokAdmin, "/rest/v1/applications?select=email");
  const adminRows = await adminSees.json();
  check(Array.isArray(adminRows) && adminRows.some((r) => r.email === alice), "admin Bob sees Alice's application", `got ${adminRows.length}`);
} finally {
  if (aliceId) await svc(`/auth/v1/admin/users/${aliceId}`, { method: "DELETE" });
  if (bobId) await svc(`/auth/v1/admin/users/${bobId}`, { method: "DELETE" });
  console.log("\n  (probe users deleted; applications cascade away)");
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
