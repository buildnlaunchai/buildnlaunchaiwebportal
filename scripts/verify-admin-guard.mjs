/**
 * Proves the thing Phase 1 actually promises: a signed-in MEMBER cannot reach
 * /admin, and the same user CAN once promoted. Uses a real session cookie in
 * the exact format @supabase/ssr reads, so it exercises middleware +
 * requireAdmin() for real rather than trusting them.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const REF = new global.URL(URL).host.split(".")[0];

const EMAIL = `guard-probe-${Date.now()}@example.com`;
const PASSWORD = "probe-password-4c81-not-a-real-account";

const svc = (path, init = {}) =>
  fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/** The cookie @supabase/ssr writes: base64-<base64 of the session JSON>. */
function sessionCookie(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  return `sb-${REF}-auth-token=${value}`;
}

const hit = (path, cookie) =>
  fetch(`${APP}${path}`, { headers: { cookie }, redirect: "manual" });

let userId;
try {
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  userId = (await created.json()).id;

  const tokenRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await tokenRes.json();
  const cookie = sessionCookie(session);

  console.log("\nAs a signed-in MEMBER:");
  const dash = await hit("/dashboard", cookie);
  check(dash.status === 200, "/dashboard renders", `HTTP ${dash.status}`);

  const html = await dash.text();
  check(html.includes("Nothing here yet"), "sees the empty Apps state");
  check(html.includes(EMAIL), "sees their own email in the top bar");
  check(!html.includes(">ADMIN<"), "does NOT see the ADMIN chip");

  const admin = await hit("/admin", cookie);
  check(
    admin.status === 404,
    "/admin returns 404 (not 403 — we don't confirm the route exists)",
    `HTTP ${admin.status}`,
  );

  console.log("\nNow promoted to admin (the bootstrap SQL path):");
  await svc(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });

  const adminNow = await hit("/admin", cookie);
  check(adminNow.status === 200, "/admin renders for the same user", `HTTP ${adminNow.status}`);
  const adminHtml = await adminNow.text();
  check(adminHtml.includes("ADMIN"), "the ADMIN chip is in the top bar");
  check(adminHtml.includes("Pending applications"), "admin overview renders");

  console.log("\nSuspended:");
  await svc(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_suspended: true }),
  });
  const susAdmin = await hit("/admin", cookie);
  check(susAdmin.status === 404, "a suspended admin loses /admin", `HTTP ${susAdmin.status}`);
  const susDash = await hit("/dashboard", cookie);
  check(
    susDash.status === 307 && (susDash.headers.get("location") ?? "").includes("/suspended"),
    "a suspended user is sent to /suspended",
    `HTTP ${susDash.status} -> ${susDash.headers.get("location")}`,
  );
} finally {
  if (userId) await svc(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
  console.log("\n  (probe user deleted)");
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail === 0 ? 0 : 1);
