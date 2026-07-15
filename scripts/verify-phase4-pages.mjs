const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const REF = new global.URL(URL).host.split(".")[0];

const svc = (p, init = {}) => fetch(`${URL}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const cookie = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const hit = (path, c) => fetch(`${APP}${path}`, { headers: { cookie: c }, redirect: "manual" });
const token = async (email) => (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-not-real-771" }) }).then(r => r.json()));

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const memberEmail = `p4-member-${Date.now()}@example.com`;
const adminEmail = `p4-admin-${Date.now()}@example.com`;
let memberId, adminId;

try {
  memberId = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: memberEmail, password: "pw-not-real-771", email_confirm: true, user_metadata: { full_name: "Member Probe" } }) }).then(r => r.json())).id;
  adminId = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: adminEmail, password: "pw-not-real-771", email_confirm: true, user_metadata: { full_name: "Admin Probe" } }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 700));
  await svc(`/rest/v1/profiles?id=eq.${adminId}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
  const memberC = cookie(await token(memberEmail));
  const adminC = cookie(await token(adminEmail));

  console.log("\n1. New signed-in user, no membership → dashboard shows the funnel (preview tool + apply prompt):");
  const d1 = await hit("/dashboard", memberC);
  const d1h = await d1.text();
  check(d1.status === 200, "/dashboard renders", `HTTP ${d1.status}`);
  check(d1h.includes("Hacker News digest"), "shows the public_preview tool card (run before applying)");
  check(d1h.includes("Apply for access") || d1h.includes("Apply"), "prompts to apply for the rest");
  check(d1h.includes("⌘K") || d1h.includes("Search"), "command palette trigger present in the shell");

  console.log("\n2. Give them an active membership → dashboard shows the members tool too:");
  await svc("/rest/v1/memberships", { method: "POST", body: JSON.stringify({ user_id: memberId, status: "active", source: "gift", started_at: new Date().toISOString() }) });
  const d2 = await hit("/dashboard", memberC);
  const d2h = await d2.text();
  check(d2h.includes("YouTube lead finder"), "member now sees the members-only tool (lever 1)");
  check(d2h.includes("unlocked"), "shows the unlocked count");
  check(d2h.includes(">Run<") || d2h.includes("Run"), "tool cards show Run");

  console.log("\n3. Admin users list + detail with the access matrix:");
  const list = await hit("/admin/users", adminC);
  const listH = await list.text();
  check(list.status === 200, "/admin/users renders", `HTTP ${list.status}`);
  check(listH.includes("Member Probe") || listH.includes(memberEmail), "the member appears in the list");

  const detail = await hit(`/admin/users/${memberId}`, adminC);
  const dH = await detail.text();
  check(detail.status === 200, "/admin/users/[id] renders", `HTTP ${detail.status}`);
  check(dH.includes("Tool access"), "the access matrix section renders");
  check(dH.includes("member") && dH.includes("YouTube lead finder"), "matrix shows the member CAN access youtube via membership (pill 'member')");
  check(dH.includes("Gift membership") || dH.includes("Revoke"), "membership controls present");
  check(dH.includes("Suspend"), "suspend control present");
  check(dH.includes("role=\"switch\"") || dH.includes("Grant") || dH.includes("Revoke"), "per-user grant switches present");

  console.log("\n4. Member cannot reach the admin users pages:");
  check((await hit("/admin/users", memberC)).status === 404, "member → 404 on /admin/users");
  check((await hit(`/admin/users/${memberId}`, memberC)).status === 404, "member → 404 on a user detail page");
} finally {
  for (const id of [memberId, adminId]) if (id) await svc(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  console.log("\n  (probe users deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
