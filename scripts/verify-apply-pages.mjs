const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const REF = new global.URL(URL).host.split(".")[0];

const svc = (p, init = {}) => fetch(`${URL}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const cookie = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const hit = (path, c) => fetch(`${APP}${path}`, { headers: { cookie: c }, redirect: "manual" });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const email = `applypage-${Date.now()}@example.com`;
let uid;
try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-not-real-771", email_confirm: true, user_metadata: { full_name: "Page Probe" } }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 500));
  const session = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-not-real-771" }) }).then(r => r.json());
  const c = cookie(session);

  console.log("\n1. Anonymous /apply → redirected to sign-in:");
  const anon = await fetch(`${APP}/apply`, { redirect: "manual" });
  const loc = anon.headers.get("location") ?? "";
  check(anon.status === 307 && loc.includes("/login") && loc.includes("next"), "unauth redirected to /login?next=/apply", `${anon.status} → ${loc}`);

  console.log("\n2. Member with NO application → sees the form:");
  const form = await hit("/apply", c);
  const formHtml = await form.text();
  check(form.status === 200, "/apply renders", `HTTP ${form.status}`);
  check(formHtml.includes("What would you automate first?"), "shows the use-case question");
  check(formHtml.includes("Send my application"), "shows the submit button");
  check(formHtml.includes(email), "greets the signed-in email");
  check(formHtml.includes("youtube-lead-finder") || formHtml.includes("YouTube lead finder"), "renders the tools multiselect from the live catalog");
  check(formHtml.includes("company_url"), "honeypot field is present in the markup");

  console.log("\n3. After applying → sees 'in the queue', NOT the form:");
  await svc("/rest/v1/applications", { method: "POST", body: JSON.stringify({ user_id: uid, email, full_name: "Page Probe", use_case: "A pending application so the apply page shows the queue state." }) });
  const queued = await hit("/apply", c);
  const qHtml = await queued.text();
  check(qHtml.includes("You&#x27;re in the queue") || qHtml.includes("You're in the queue"), "shows the pending status card");
  check(!qHtml.includes("Send my application"), "form is NOT shown once applied");

  console.log("\n4. Non-admin member → /admin/applications 404s:");
  const blocked = await hit("/admin/applications", c);
  check(blocked.status === 404, "member gets 404 on the review queue", `HTTP ${blocked.status}`);

  console.log("\n5. Admin → sees the application in the queue:");
  await svc(`/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) });
  const queue = await hit("/admin/applications", c);
  const queueHtml = await queue.text();
  check(queue.status === 200, "/admin/applications renders for admin", `HTTP ${queue.status}`);
  check(queueHtml.includes("Page Probe"), "the applicant's name appears");
  check(queueHtml.includes("Approve") && queueHtml.includes("Waitlist") && queueHtml.includes("Reject"), "approve / waitlist / reject controls present");
  check(queueHtml.includes(">Applications<") || queueHtml.includes("Applications"), "top-bar title reads Applications, not Overview");
} finally {
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  console.log("\n  (probe user deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
