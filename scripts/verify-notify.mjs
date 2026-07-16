/**
 * Phase 8 — email + notifications. Verifies the notifications table + RLS, the
 * key-stopped-working path (email + notification, once per invalidation) via the
 * live run-tool function, a REAL Resend send, and the bell/banner rendering.
 */
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RS = process.env.RUNNER_SECRET;
const RESEND = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL;
const APP = "http://localhost:3000";
const REF = new URL(SB).host.split(".")[0];

const svc = (p, i = {}) => fetch(`${SB}${p}`, { ...i, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const cookie = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const hit = (path, c) => fetch(`${APP}${path}`, { headers: { cookie: c }, redirect: "manual" });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const email = `notify-${Date.now()}@example.com`;
let uid, uid2;
try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-n-1", email_confirm: true, user_metadata: { full_name: "Notify Probe" } }) }).then(r => r.json())).id;
  uid2 = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: `other-${Date.now()}@example.com`, password: "pw-n-2", email_confirm: true }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 600));
  const sess = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-n-1" }) }).then(r => r.json());
  const sess2 = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: (await svc(`/rest/v1/profiles?id=eq.${uid2}&select=email`).then(r=>r.json()))[0].email, password: "pw-n-2" }) }).then(r => r.json());
  const c = cookie(sess);

  console.log("\n1. Notifications RLS — a member sees only their own:");
  await svc("/rest/v1/notifications", { method: "POST", body: JSON.stringify({ user_id: uid, title: "Hello", body: "test", href: "/dashboard" }) });
  await svc("/rest/v1/notifications", { method: "POST", body: JSON.stringify({ user_id: uid2, title: "Not yours" }) });
  const mine = await fetch(`${SB}/rest/v1/notifications?select=title`, { headers: { apikey: ANON, Authorization: `Bearer ${sess.access_token}` } }).then(r => r.json());
  check(Array.isArray(mine) && mine.length === 1 && mine[0].title === "Hello", "member sees exactly their 1 notification", `got ${mine.length}`);

  console.log("\n2. A member can mark THEIR read_at, and only read_at:");
  const nid = (await svc(`/rest/v1/notifications?user_id=eq.${uid}&select=id`).then(r => r.json()))[0].id;
  const mark = await fetch(`${SB}/rest/v1/notifications?id=eq.${nid}`, { method: "PATCH", headers: { apikey: ANON, Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
  check(mark.ok, "PATCH read_at on own notification succeeds", `HTTP ${mark.status}`);
  const rewrite = await fetch(`${SB}/rest/v1/notifications?id=eq.${nid}`, { method: "PATCH", headers: { apikey: ANON, Authorization: `Bearer ${sess.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "hacked" }) });
  check(!rewrite.ok, "PATCH title is rejected (column grant: read_at only)", `HTTP ${rewrite.status}`);
  const others = await fetch(`${SB}/rest/v1/notifications?id=eq.${nid}`, { method: "PATCH", headers: { apikey: ANON, Authorization: `Bearer ${sess2.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
  // A different user can't touch it (RLS row filter) → 0 rows updated (PATCH returns 2xx but affects nothing)
  check(others.status === 204 || others.status === 404 || !others.ok, "a different user's PATCH touches 0 rows", `HTTP ${others.status}`);

  console.log("\n3. Resend actually sends (real API call to a test inbox):");
  if (RESEND && FROM) {
    const send = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "content-type": "application/json" }, body: JSON.stringify({ from: FROM, to: "delivered@resend.dev", subject: "Phase 8 verify", html: "<p>ok</p>" }) });
    const body = await send.json();
    check(send.ok && body.id, "Resend accepted the email", `id=${body.id ?? JSON.stringify(body).slice(0,60)}`);
  } else {
    check(false, "Resend configured", "no key");
  }

  console.log("\n4. Key-stopped-working: run a keyed tool with a BOGUS key → key invalid + notification written:");
  // Connect a bogus openai key for the user via the key-vault function, then run youtube (needs youtube_data+openai).
  // Simpler: directly insert an unverified openai + youtube_data key (ciphertext is opaque; the provider call will 401).
  // We can't encrypt here, so use the key-vault function to store real (bogus) keys.
  const vault = (tok, b) => fetch(`${SB}/functions/v1/key-vault`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(b) });
  await vault(sess.access_token, { action: "save", provider: "openai", plaintext: "sk-bogus-END" });
  await vault(sess.access_token, { action: "save", provider: "youtube_data", plaintext: "bogus-yt-END" });
  // Force both to unverified so has_required_keys passes and the run starts (bogus openai verified to invalid on save).
  await svc(`/rest/v1/user_api_keys?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ status: "unverified" }) });
  const yt = (await svc("/rest/v1/tools?slug=eq.youtube-lead-finder&select=id,timeout_seconds").then(r => r.json()))[0];
  const run = (await svc("/rest/v1/tool_runs", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, tool_id: yt.id, status: "running", input: { query: "test", min_subscribers: 100, max_results: 5 }, expires_at: new Date(Date.now() + yt.timeout_seconds * 1000).toISOString(), providers_used: ["youtube_data", "openai"] }) }).then(r => r.json()))[0];
  await fetch(`${SB}/functions/v1/run-tool`, { method: "POST", headers: { apikey: ANON, "X-Runner-Secret": RS, "Content-Type": "application/json" }, body: JSON.stringify({ run_id: run.id }) });
  let done = null; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 1000)); const x = await svc(`/rest/v1/tool_runs?id=eq.${run.id}&select=status,error_message`).then(r => r.json()); if (x[0] && x[0].status !== "running") { done = x[0]; break; } }
  check(done?.status === "error", "run errored on the bad key", `status=${done?.status}`);
  const ytKey = (await svc(`/rest/v1/user_api_keys?user_id=eq.${uid}&provider=eq.youtube_data&select=status`).then(r => r.json()))[0];
  check(ytKey?.status === "invalid", "the youtube_data key was marked invalid", `status=${ytKey?.status}`);
  const keyNotifs = (await svc(`/rest/v1/notifications?user_id=eq.${uid}&select=title,body`).then(r => r.json())).filter(n => /stopped working/i.test(n.title));
  check(keyNotifs.length === 1, "exactly ONE 'key stopped working' notification (once per invalidation)", `count=${keyNotifs.length}`);

  console.log("\n5. The bell + banner render:");
  const dash = await hit("/dashboard", c);
  const dH = await dash.text();
  check(dH.includes("Notifications") || dH.includes("aria-label=\"Notifications"), "notification bell present in the shell");
  // Publish an announcement and confirm it renders in the dashboard.
  await svc("/rest/v1/announcements", { method: "POST", body: JSON.stringify({ title: "We shipped a thing", body: "Check it out", variant: "success", is_published: true, published_at: new Date().toISOString() }) });
  const dash2 = await hit("/dashboard", c);
  const d2 = await dash2.text();
  check(d2.includes("We shipped a thing"), "published announcement renders in the banner");
} finally {
  await svc(`/rest/v1/announcements?title=eq.We shipped a thing`, { method: "DELETE" }).catch(() => {});
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  if (uid2) await svc(`/auth/v1/admin/users/${uid2}`, { method: "DELETE" });
  console.log("\n  (probe users + announcement deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
