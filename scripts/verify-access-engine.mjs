/**
 * Phase 4 — the access engine. The most important checks in the project. Proves
 * both levers and, above all, the architecture-review fix: can_access_tool takes
 * a SUBJECT, so an admin evaluating a member's access gets the MEMBER's answer,
 * not "true for everything because an admin is asking".
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const svc = (p, init = {}) => fetch(`${URL}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const rpcAs = (tok, fn, args) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(args) }).then((r) => r.json());
const rpcSvc = (fn, args) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" }, body: JSON.stringify(args) }).then((r) => r.json());

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const mkUser = async (email) => (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-not-real-4419", email_confirm: true }) }).then((r) => r.json())).id;
const token = async (email) => (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-not-real-4419" }) }).then((r) => r.json())).access_token;
const toolId = async (slug) => (await svc(`/rest/v1/tools?slug=eq.${slug}&select=id`).then((r) => r.json()))[0].id;

const memberEmail = `ae-member-${Date.now()}@example.com`;
const adminEmail = `ae-admin-${Date.now()}@example.com`;
const applicantEmail = `ae-applicant-${Date.now()}@example.com`;
let memberId, adminId, applicantId;

try {
  memberId = await mkUser(memberEmail);
  adminId = await mkUser(adminEmail);
  applicantId = await mkUser(applicantEmail);
  await new Promise((r) => setTimeout(r, 700));

  await svc(`/rest/v1/profiles?id=eq.${adminId}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });

  const memberTok = await token(memberEmail);
  const adminTok = await token(adminEmail);

  const youtube = await toolId("youtube-lead-finder"); // published, members
  const hn = await toolId("hacker-news-digest");        // published, public_preview
  const reddit = await toolId("reddit-pain-miner");     // coming_soon, members

  console.log("\n1. Applicant (no membership) — engine says NO to a members tool, YES to preview:");
  check((await rpcSvc("can_access_tool", { p_tool_id: youtube, uid: applicantId })) === false, "no membership → no youtube-lead-finder");
  check((await rpcSvc("can_access_tool", { p_tool_id: hn, uid: applicantId })) === true, "public_preview → yes hacker-news-digest");

  console.log("\n2. Lever 1 — give them a membership, and every `members` tool opens:");
  await svc("/rest/v1/memberships", { method: "POST", body: JSON.stringify({ user_id: memberId, status: "active", source: "gift", started_at: new Date().toISOString() }) });
  check((await rpcSvc("can_access_tool", { p_tool_id: youtube, uid: memberId })) === true, "active member → yes youtube-lead-finder (members)");

  console.log("\n3. Lever 2 — grant ONE manual tool to the applicant, they get exactly that one:");
  // reddit is coming_soon (not published) so a normal member can't access it; an explicit grant on a
  // published members tool is the clean lever test. Use youtube for the applicant via explicit grant.
  await svc("/rest/v1/user_tool_access", { method: "POST", body: JSON.stringify({ user_id: applicantId, tool_id: youtube, source: "manual", granted_by: adminId }) });
  check((await rpcSvc("can_access_tool", { p_tool_id: youtube, uid: applicantId })) === true, "explicit grant → yes youtube for the applicant");
  check((await rpcSvc("can_access_tool", { p_tool_id: reddit, uid: applicantId })) === false, "but NOT reddit (no grant, not published)");

  console.log("\n4. THE FIX — admin evaluating a MEMBER's access via accessible_tool_ids(member):");
  // As the admin's session, ask the engine about the APPLICANT (who has only the youtube grant + preview).
  const idsForApplicant = await rpcAs(adminTok, "accessible_tool_ids", { uid: applicantId });
  const set = new Set(idsForApplicant);
  check(set.has(youtube), "admin sees applicant CAN access youtube (granted)");
  check(set.has(hn), "admin sees applicant CAN access hacker-news (preview)");
  check(!set.has(reddit), "admin sees applicant CANNOT access reddit — NOT true-for-everything");
  check(set.size === 2, "exactly 2 accessible, not all tools", `got ${set.size}`);

  console.log("\n5. Suspended beats everything — even an explicit grant:");
  await svc(`/rest/v1/profiles?id=eq.${applicantId}`, { method: "PATCH", body: JSON.stringify({ is_suspended: true }) });
  check((await rpcSvc("can_access_tool", { p_tool_id: youtube, uid: applicantId })) === false, "suspended → no youtube despite the grant");
  check((await rpcSvc("can_access_tool", { p_tool_id: hn, uid: applicantId })) === false, "suspended → no preview either");
  await svc(`/rest/v1/profiles?id=eq.${applicantId}`, { method: "PATCH", body: JSON.stringify({ is_suspended: false }) });

  console.log("\n6. approve_application RPC creates a membership atomically:");
  const appRow = await svc("/rest/v1/applications", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: applicantId, email: applicantEmail, full_name: "Applicant Probe", use_case: "Testing the approve RPC creates a membership atomically here." }) }).then((r) => r.json());
  const appId = appRow[0].id;
  // Call approve as the ADMIN's session so is_admin(auth.uid()) passes.
  const approvedUid = await rpcAs(adminTok, "approve_application", { p_application_id: appId });
  check(approvedUid === applicantId, "approve returns the applicant's user_id", approvedUid);
  const mem = await svc(`/rest/v1/memberships?user_id=eq.${applicantId}&select=status,source`).then((r) => r.json());
  check(mem[0]?.status === "active" && mem[0]?.source === "application", "membership created: active, source=application");
  const app = await svc(`/rest/v1/applications?id=eq.${appId}&select=status,reviewed_by`).then((r) => r.json());
  check(app[0]?.status === "approved" && app[0]?.reviewed_by === adminId, "application marked approved + reviewer recorded");

  console.log("\n7. A member CANNOT call approve_application (not admin):");
  const denied = await rpcAs(memberTok, "approve_application", { p_application_id: appId });
  check(denied?.code === "42501" || denied?.message?.includes("not authorized") || denied?.message?.toLowerCase().includes("privilege"), "member approve → rejected", JSON.stringify(denied).slice(0, 60));

  console.log("\n8. Audit rows were written and are admin-only:");
  const auditAdmin = await fetch(`${URL}/rest/v1/audit_logs?select=action&order=created_at.desc&limit=5`, { headers: { apikey: ANON, Authorization: `Bearer ${adminTok}` } }).then((r) => r.json());
  check(Array.isArray(auditAdmin) && auditAdmin.some((a) => a.action === "application.approve"), "admin sees application.approve audit row");
  const auditMember = await fetch(`${URL}/rest/v1/audit_logs?select=action`, { headers: { apikey: ANON, Authorization: `Bearer ${memberTok}` } }).then((r) => r.json());
  check(Array.isArray(auditMember) && auditMember.length === 0, "a member sees 0 audit rows");
} finally {
  for (const id of [memberId, adminId, applicantId]) if (id) await svc(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  console.log("\n  (probe users deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
