const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL = `rls-probe-${Date.now()}@example.com`;
const PASSWORD = "probe-password-9f2a-not-a-real-account";

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

const asUser = (token, path, init = {}) =>
  fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
};

let userId;

try {
  // ---- 1. Signup fires handle_new_user -------------------------------------
  console.log("\n1. Signup creates a profile row (handle_new_user trigger)");
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "RLS Probe", avatar_url: "https://example.com/a.png" },
    }),
  });
  const user = await created.json();
  userId = user.id;
  check(created.ok && !!userId, "auth.users row created", `id=${userId}`);

  await new Promise((r) => setTimeout(r, 600)); // let the trigger land

  const profRes = await svc(`/rest/v1/profiles?id=eq.${userId}&select=*`);
  const [profile] = await profRes.json();
  check(!!profile, "profiles row auto-created by trigger");
  check(profile?.role === "member", "default role is 'member'", `got ${profile?.role}`);
  check(profile?.is_suspended === false, "default is_suspended is false");
  check(!!profile?.referral_code, "referral_code generated", profile?.referral_code);
  check(profile?.full_name === "RLS Probe", "full_name copied from OAuth metadata");
  check(profile?.email === EMAIL, "email copied from auth.users");

  // ---- 2. Sign in as that member -------------------------------------------
  console.log("\n2. Sign in as the member");
  const tokenRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const { access_token: token } = await tokenRes.json();
  check(!!token, "member obtained a JWT");

  // ---- 3. THE ATTACK: escalate to admin ------------------------------------
  console.log("\n3. Member tries to make themselves an admin (the whole point)");
  const esc = await asUser(token, `/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ role: "admin" }),
  });
  await esc.text();
  check(!esc.ok, `PATCH role='admin' on OWN row is rejected`, `HTTP ${esc.status}`);

  const afterRes = await svc(`/rest/v1/profiles?id=eq.${userId}&select=role`);
  const [after] = await afterRes.json();
  check(after?.role === "member", "role is still 'member' in the database", `got ${after?.role}`);

  const susp = await asUser(token, `/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ is_suspended: false }),
  });
  check(!susp.ok, "PATCH is_suspended on OWN row is rejected", `HTTP ${susp.status}`);

  // ---- 4. Legitimate self-service still works ------------------------------
  console.log("\n4. But a member CAN edit their own name");
  const ok = await asUser(token, `/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ full_name: "Renamed By Owner" }),
  });
  check(ok.ok, "PATCH full_name on own row succeeds", `HTTP ${ok.status}`);

  // ---- 5. Row isolation ----------------------------------------------------
  console.log("\n5. A member sees only their own row");
  const allRes = await asUser(token, `/rest/v1/profiles?select=id,email`);
  const all = await allRes.json();
  check(
    Array.isArray(all) && all.length === 1 && all[0].id === userId,
    "select * on profiles returns exactly 1 row (their own)",
    `got ${Array.isArray(all) ? all.length : "?"} rows`,
  );

  // ---- 6. Insert / delete are closed ---------------------------------------
  console.log("\n6. Members cannot insert or delete profiles");
  const ins = await asUser(token, `/rest/v1/profiles`, {
    method: "POST",
    body: JSON.stringify({ id: crypto.randomUUID(), email: "forged@example.com" }),
  });
  check(!ins.ok, "INSERT into profiles is rejected", `HTTP ${ins.status}`);

  const del = await asUser(token, `/rest/v1/profiles?id=eq.${userId}`, { method: "DELETE" });
  const stillThere = await svc(`/rest/v1/profiles?id=eq.${userId}&select=id`);
  const rows = await stillThere.json();
  check(rows.length === 1, "DELETE of own profile does not remove the row", `HTTP ${del.status}`);

  // ---- 7. Anonymous sees nothing -------------------------------------------
  console.log("\n7. Anonymous (anon key, no session) sees nothing");
  const anonRes = await fetch(`${URL}/rest/v1/profiles?select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const anonRows = await anonRes.json();
  check(
    Array.isArray(anonRows) && anonRows.length === 0,
    "anon select on profiles returns 0 rows",
    `got ${Array.isArray(anonRows) ? anonRows.length : JSON.stringify(anonRows).slice(0, 40)}`,
  );

  // ---- 8. The bootstrap path works -----------------------------------------
  console.log("\n8. Admin promotion via a trusted server context still works");
  const promote = await svc(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });
  const promotedRes = await svc(`/rest/v1/profiles?id=eq.${userId}&select=role`);
  const [promoted] = await promotedRes.json();
  check(
    promote.ok && promoted?.role === "admin",
    "service role CAN promote (this is the bootstrap SQL path)",
    `role=${promoted?.role}`,
  );
} finally {
  if (userId) {
    await svc(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    const gone = await svc(`/rest/v1/profiles?id=eq.${userId}&select=id`);
    const rows = await gone.json();
    console.log(
      `\n9. Cleanup\n  ${rows.length === 0 ? "PASS" : "FAIL"}  deleting auth.users cascades the profile away`,
    );
    if (rows.length === 0) pass++; else fail++;
  }
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail === 0 ? 0 : 1);
