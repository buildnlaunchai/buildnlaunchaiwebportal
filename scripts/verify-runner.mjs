/**
 * Phase 6 — the runner, end to end. The signature moment.
 * Covers: the gate, a real HN run via the ACTUAL runner page flow, RLS on
 * tool_runs, the reaper, and the resumed-run render.
 */
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RS = process.env.RUNNER_SECRET;
const APP = "http://localhost:3000";
const REF = new URL(SB).host.split(".")[0];

const svc = (p, i = {}) => fetch(`${SB}${p}`, { ...i, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const cookie = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const hit = (path, c) => fetch(`${APP}${path}`, { headers: { cookie: c }, redirect: "manual" });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const email = `runner-${Date.now()}@example.com`;
let uid;
try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-r-1", email_confirm: true, user_metadata: { full_name: "Runner Probe" } }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 600));
  const sess = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-r-1" }) }).then(r => r.json());
  const c = cookie(sess);

  console.log("\n1. The gate — run-tool rejects a caller without the runner secret:");
  const noSecret = await fetch(`${SB}/functions/v1/run-tool`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ run_id: "x" }) });
  check(noSecret.status === 404, "no X-Runner-Secret → 404", `HTTP ${noSecret.status}`);

  console.log("\n2. Runner page renders for an accessible keyless tool (hacker-news, public_preview):");
  const page = await hit("/dashboard/tools/hacker-news-digest", c);
  const pageH = await page.text();
  check(page.status === 200, "/dashboard/tools/hacker-news-digest renders", `HTTP ${page.status}`);
  check(pageH.includes("Topic") && (pageH.includes(">Run<") || pageH.includes("Run")), "the auto-rendered form + Run button are present");
  check(pageH.includes("hacker-news-digest"), "the waiting well shows the slug");

  console.log("\n3. A REAL run through startRun's exact path (insert running + invoke run-tool):");
  const hn = (await svc("/rest/v1/tools?slug=eq.hacker-news-digest&select=id,timeout_seconds").then(r => r.json()))[0];
  const run = (await svc("/rest/v1/tool_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, tool_id: hn.id, status: "running", input: { topic: "typescript", timeframe: "month", max_items: 6 }, expires_at: new Date(Date.now() + hn.timeout_seconds * 1000).toISOString(), providers_used: [] }) }).then(r => r.json()))[0];
  const inv = await fetch(`${SB}/functions/v1/run-tool`, { method: "POST", headers: { apikey: ANON, "X-Runner-Secret": RS, "Content-Type": "application/json" }, body: JSON.stringify({ run_id: run.id }) });
  check(inv.status === 202, "run-tool accepts (202)", `HTTP ${inv.status}`);
  let final = null;
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1000)); const x = await svc(`/rest/v1/tool_runs?id=eq.${run.id}&select=status,output,duration_ms`).then(r => r.json()); if (x[0] && x[0].status !== "running") { final = x[0]; break; } }
  check(final?.status === "success", "run completes: success", `status=${final?.status}, ${final?.duration_ms}ms`);
  check(final?.output?.digest && Array.isArray(final?.output?.stories), "output has digest + stories");

  console.log("\n4. The run detail page renders that finished run (resumed, no ceremony):");
  const detail = await hit(`/dashboard/runs/${run.id}`, c);
  const dH = await detail.text();
  check(detail.status === 200, "/dashboard/runs/[id] renders", `HTTP ${detail.status}`);
  check(dH.includes("run_" + run.id.replace(/-/g, "").slice(0, 8)), "the receipt line shows the run id");
  check(/\d+\.\d+s/.test(dH), "the receipt shows a duration");

  console.log("\n5. Run history lists it; RLS scopes to the owner:");
  const runsPage = await hit("/dashboard/runs", c);
  const rH = await runsPage.text();
  check(rH.includes("Hacker News digest"), "the run appears in history");
  // A second user sees none of it
  const email2 = `runner2-${Date.now()}@example.com`;
  const uid2 = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: email2, password: "pw-r-2", email_confirm: true }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 400));
  const sess2 = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: email2, password: "pw-r-2" }) }).then(r => r.json());
  const other = await svc(`/rest/v1/tool_runs?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${sess2.access_token}` } }).then(r => r.json());
  check(Array.isArray(other) && other.length === 0, "a different user sees 0 runs (RLS)", `got ${other.length}`);
  await svc(`/auth/v1/admin/users/${uid2}`, { method: "DELETE" });

  console.log("\n6. The reaper: a run past expires_at is swept to timeout by the real cron (waits ~70s):");
  const stale = (await svc("/rest/v1/tool_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, tool_id: hn.id, status: "running", input: {}, expires_at: new Date(Date.now() - 120000).toISOString() }) }).then(r => r.json()))[0];
  let reaped = null;
  for (let i = 0; i < 15; i++) { // up to ~75s, one cron tick per minute
    await new Promise(r => setTimeout(r, 5000));
    const x = (await svc(`/rest/v1/tool_runs?id=eq.${stale.id}&select=status,error_message`).then(r => r.json()))[0];
    if (x?.status === "timeout") { reaped = x; break; }
  }
  check(reaped?.status === "timeout", "the reaper swept the stale run to 'timeout'", reaped ? "reaped" : "not within 75s");
  check(/never reported back/i.test(reaped?.error_message ?? ""), "with the honest timeout message");
} finally {
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  console.log("\n  (probe users deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
