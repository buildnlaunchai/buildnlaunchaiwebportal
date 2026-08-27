/**
 * Proves that an ADMIN can write a member's credit, and a MEMBER cannot.
 *
 * ─── THE GAP THIS EXISTS TO CLOSE ────────────────────────────────────────────
 *
 * The credit admin screen shipped unable to write anything. `profiles` grants
 * UPDATE on three columns to `authenticated` and credit_mode_override is
 * deliberately not one of them — and a GRANT is checked before RLS and knows
 * nothing about roles, so it refused the admin exactly as firmly as it refused
 * everybody else. `credit_admin_adjust` was broken the same way and simply had
 * not been pressed yet: it was granted to postgres and service_role only.
 *
 * The test that existed proved a member could NOT write the column. Nothing
 * asked whether an admin COULD. One of those is a security property and the
 * other is the feature working, and a suite that only checks the first will
 * happily watch the second stay broken — which is what happened.
 *
 * So both directions are asserted here, for both operations, with real
 * sessions: the security property and the feature, together, because they are
 * two halves of one rule and either alone is misleading.
 *
 * Runs against whatever NEXT_PUBLIC_SUPABASE_URL points at — which for
 * `pnpm verify:credits` is .env.local, i.e. production, exactly like the rest of
 * the verify:* family. It creates its own throwaway accounts and deletes them in
 * a `finally`, so it leaves nothing behind either way.
 *
 * It cannot be pointed at the local stack: local GoTrue signs with ES256, and
 * its admin API rejects both the legacy service-role JWT and the sb_secret_ key
 * with `bad_jwt ... signing method HS256 is invalid`. So no throwaway account can
 * be created there. Same root cause as the --no-verify-jwt note in TEMPLATE.md.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SVC) {
  console.error("  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const PASSWORD = "credits-probe-9f21-not-a-real-account";
const stamp = Date.now();
const ADMIN_EMAIL = `credits-admin-${stamp}@example.com`;
const MEMBER_EMAIL = `credits-member-${stamp}@example.com`;

const svc = (path, init = {}) =>
  fetch(`${URL_}${path}`, {
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
  if (ok) pass++; else fail++;
};

async function createUser(email) {
  const res = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

async function tokenFor(email) {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign in ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/** An RPC call made as a real signed-in person, not as the service role. */
async function rpcAs(token, fn, args) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const overrideOf = async (id) =>
  (await (await svc(`/rest/v1/profiles?select=credit_mode_override&id=eq.${id}`)).json())[0]
    ?.credit_mode_override ?? null;
const balanceOf = async (id) =>
  (await (await svc(`/rest/v1/credit_balances?select=balance&user_id=eq.${id}`)).json())[0]
    ?.balance ?? 0;

let adminId, memberId;
try {
  adminId = await createUser(ADMIN_EMAIL);
  memberId = await createUser(MEMBER_EMAIL);
  await svc(`/rest/v1/profiles?id=eq.${adminId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ role: "admin" }),
  });

  const adminToken = await tokenFor(ADMIN_EMAIL);
  const memberToken = await tokenFor(MEMBER_EMAIL);

  console.log("\n  credit_mode_override — the column no client role may write directly");
  {
    // The first lock, and the one that made the admin screen fail. A grant is
    // checked before RLS, so this is refused for BOTH of them — which is why
    // the admin needs a different path rather than a wider grant.
    for (const [who, token] of [["admin", adminToken], ["member", memberToken]]) {
      const res = await fetch(`${URL_}/rest/v1/profiles?id=eq.${memberId}`, {
        method: "PATCH",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ credit_mode_override: true }),
      });
      check(res.status === 403, `a direct table write is refused for the ${who}`, `HTTP ${res.status}`);
    }
    check((await overrideOf(memberId)) === null, "and nothing was written");
  }

  console.log("\n  credit_set_mode_override — the admin's path");
  {
    const asAdmin = await rpcAs(adminToken, "credit_set_mode_override", {
      p_user_id: memberId,
      p_value: true,
    });
    check(asAdmin.body === "ok", "an ADMIN can set it", JSON.stringify(asAdmin.body));
    check((await overrideOf(memberId)) === true, "and it took effect");

    const asMember = await rpcAs(memberToken, "credit_set_mode_override", {
      p_user_id: memberId,
      p_value: false,
    });
    check(asMember.body === "not_admin", "a MEMBER cannot", JSON.stringify(asMember.body));
    check(
      (await overrideOf(memberId)) === true,
      "and their attempt changed nothing — not even on their own row",
    );

    // A member granting themselves is the case that actually matters: the
    // override is an authority to spend the platform's money.
    const onSelf = await rpcAs(memberToken, "credit_set_mode_override", {
      p_user_id: memberId,
      p_value: true,
    });
    check(onSelf.body === "not_admin", "a member cannot grant it to themselves either");

    const cleared = await rpcAs(adminToken, "credit_set_mode_override", {
      p_user_id: memberId,
      p_value: null,
    });
    check(cleared.body === "ok", "null is a real value — back to following the switch");
    check((await overrideOf(memberId)) === null, "and it cleared");
  }

  console.log("\n  credit_admin_adjust — the same two directions");
  {
    const before = await balanceOf(memberId);

    const asMember = await rpcAs(memberToken, "credit_admin_adjust", {
      p_user_id: memberId,
      p_credits: 5000,
      p_note: "a member helping themselves",
    });
    check(asMember.body === "not_admin", "a MEMBER cannot adjust a balance", JSON.stringify(asMember.body));
    check((await balanceOf(memberId)) === before, "and no credit appeared");

    const asAdmin = await rpcAs(adminToken, "credit_admin_adjust", {
      p_user_id: memberId,
      p_credits: 1000,
      // Passed exactly as the Server Action passes it. TWO DIFFERENT ACTORS are
      // recorded by an admin adjustment and they come from different places:
      // the LEDGER's actor is this argument, and the AUDIT row's is auth.uid()
      // inside log_audit. A test that omitted p_actor would pass while quietly
      // proving the ledger can lose the person who moved the money.
      p_actor: adminId,
      p_note: "verify-credits probe",
    });
    check(asAdmin.body === "ok", "an ADMIN can", JSON.stringify(asAdmin.body));
    check((await balanceOf(memberId)) === before + 1000, "and the balance moved");

    const ledger = await (
      await svc(`/rest/v1/credit_ledger?select=kind,credits,note,actor_id&user_id=eq.${memberId}&order=created_at.desc&limit=1`)
    ).json();
    check(ledger[0]?.kind === "admin_adjustment", "with a ledger row behind it", JSON.stringify(ledger[0]));
    check(ledger[0]?.note === "verify-credits probe", "carrying the admin's note");
    check(
      ledger[0]?.actor_id === adminId,
      "and naming the admin who moved it",
      JSON.stringify(ledger[0]?.actor_id),
    );
  }
} catch (err) {
  check(false, "the probe itself failed", err.message);
} finally {
  // Deleting the auth user cascades to the profile, the balance and the ledger.
  for (const id of [adminId, memberId]) {
    if (id) await svc(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
  }
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
