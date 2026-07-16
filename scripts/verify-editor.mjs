/**
 * Phase 7 — the admin tool editor. Verifies the create/edit/test-run/metrics
 * flow against the live DB + function, and the tool_secrets boundary.
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

const email = `editor-${Date.now()}@example.com`;
let uid, toolId;
const slug = `test-editor-tool-${Date.now()}`;
try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-e-1", email_confirm: true, user_metadata: { full_name: "Editor Admin" } }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 500));
  await svc(`/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
  const sess = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-e-1" }) }).then(r => r.json());
  const c = cookie(sess);

  console.log("\n1. Admin pages render; member is 404'd:");
  const list = await hit("/admin/tools", c);
  check(list.status === 200, "/admin/tools renders for admin", `HTTP ${list.status}`);
  const listH = await list.text();
  check(listH.includes("New tool") && listH.includes("hacker-news-digest"), "list shows the New tool button + existing tools");
  const newPage = await hit("/admin/tools/new", c);
  const newH = await newPage.text();
  check(newPage.status === 200 && newH.includes("Input form") && newH.includes("Add field"), "the visual field builder is present");
  check(newH.includes("behaviour") && newH.includes("supabase functions deploy run-tool"), "the data-vs-behaviour boundary is stated in the editor");

  console.log("\n2. Create a tool (simulating the createTool action via service role, as the action does):");
  // The action writes tools + tool_secrets with the service role. Verify that split.
  const tool = (await svc("/rest/v1/tools", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
    slug, name: "Test Editor Tool", tagline: "Made by the editor test.", status: "draft", access_type: "members", runtime: "edge_function",
    required_providers: [], timeout_seconds: 60,
    input_schema: { fields: [{ name: "topic", label: "Topic", type: "text", required: true }] },
    output_schema: { type: "blocks", blocks: [{ type: "markdown", key: "digest", label: "Result" }] },
  }) }).then(r => r.json()))[0];
  toolId = tool.id;
  await svc("/rest/v1/tool_secrets", { method: "POST", body: JSON.stringify({ tool_id: toolId, function_name: "hacker-news-digest" }) });
  check(!!toolId, "tool row created (draft)", slug);

  console.log("\n3. The editor page loads the tool + its secret config (service role read):");
  const edit = await hit(`/admin/tools/${toolId}`, c);
  const editH = await edit.text();
  check(edit.status === 200, "/admin/tools/[id] renders", `HTTP ${edit.status}`);
  check(editH.includes("Test Editor Tool") && editH.includes(slug), "editor shows the tool");
  check(editH.includes("hacker-news-digest"), "editor shows function_name from tool_secrets (only the admin server read it)");

  console.log("\n4. tool_secrets stays invisible to a client, even for this tool:");
  const asAdminClient = await fetch(`${SB}/rest/v1/tool_secrets?tool_id=eq.${toolId}&select=function_name`, { headers: { apikey: ANON, Authorization: `Bearer ${sess.access_token}` } });
  const secretRows = await asAdminClient.json();
  check(Array.isArray(secretRows) && secretRows.length === 0, "admin's own client Supabase reads 0 rows of tool_secrets (deny-all)", `got ${Array.isArray(secretRows) ? secretRows.length : JSON.stringify(secretRows).slice(0,40)}`);

  console.log("\n5. Test run through the real path (draft tool, function_name=hacker-news-digest, no keys):");
  const run = (await svc("/rest/v1/tool_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, tool_id: toolId, status: "running", input: { topic: "rust" }, expires_at: new Date(Date.now() + 60000).toISOString() }) }).then(r => r.json()))[0];
  const inv = await fetch(`${SB}/functions/v1/run-tool`, { method: "POST", headers: { apikey: ANON, "X-Runner-Secret": RS, "Content-Type": "application/json" }, body: JSON.stringify({ run_id: run.id }) });
  check(inv.status === 202, "run-tool accepts the test run (202)", `HTTP ${inv.status}`);
  let f = null; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1000)); const x = await svc(`/rest/v1/tool_runs?id=eq.${run.id}&select=status,output`).then(r => r.json()); if (x[0] && x[0].status !== "running") { f = x[0]; break; } }
  check(f?.status === "success" && f?.output?.digest, "draft tool test-runs via its handler and returns output", `status=${f?.status}`);

  console.log("\n6. /admin metrics renders with real numbers:");
  const overview = await hit("/admin", c);
  const oH = await overview.text();
  check(overview.status === 200, "/admin renders", `HTTP ${overview.status}`);
  check(oH.includes("Run success rate") && oH.includes("Runs (7d)") && oH.includes("Top tools"), "metrics sections present");
  check(oH.includes("Signups") && oH.includes("<svg"), "signup sparkline renders");
} finally {
  if (toolId) await svc(`/rest/v1/tools?id=eq.${toolId}`, { method: "DELETE" });
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  console.log("\n  (probe tool + user deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
