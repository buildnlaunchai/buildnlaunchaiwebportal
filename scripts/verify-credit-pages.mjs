/**
 * Does /dashboard/credits render the right thing for each of its three states?
 *
 * ─── WHY A THROWAWAY ACCOUNT AND NOT THE REAL LAPSED MEMBER ─────────────────
 *
 * There is a real lapsed member with credit on production, and checking the page
 * as them would mean minting a session for somebody else's account. That is
 * impersonation, for a question a disposable account answers just as well.
 * Nothing here touches a real member, and nothing buys anything.
 *
 * ─── TWO TRAPS THIS SCRIPT FELL INTO ON ITS FIRST RUN ───────────────────────
 *
 * 1. REACT SPLITS ADJACENT TEXT. `{a} credits · ${b}` is serialised as
 *    `50,000<!-- --> credits · $<!-- -->5`, so a naive substring match for
 *    "50,000 credits" fails against a page that is rendering perfectly. Every
 *    assertion below runs against `text()`, which strips those markers first.
 *
 * 2. AN ASSERTION PASSED WITHOUT LOOKING AT ANYTHING. "the buy buttons are
 *    gone" searched for a string that never appears in ANY state — so it would
 *    have passed just as happily on a page covered in buy buttons. That is the
 *    silence-is-not-success failure: a negative assertion is only worth
 *    something if the positive form of it is also asserted somewhere. So the
 *    state is now read back from the database between phases, and the negative
 *    checks use strings that are proven present in the state where they belong.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.VERIFY_SITE_URL ?? "https://www.buildnlaunchai.com";

if (!URL_ || !ANON || !SVC) {
  console.error("  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const REF = new URL(URL_).hostname.split(".")[0];
const PASSWORD = "credit-pages-4c19-not-a-real-account";
const EMAIL = `credit-pages-${Date.now()}@example.com`;

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
};
const svc = (path, init = {}) =>
  fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: SVC, Authorization: `Bearer ${SVC}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });

/** The rendered page as a reader sees it: no tags, no React comment markers. */
const text = (html) =>
  html
    .replace(/<!--.*?-->/gs, "")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

let userId, cookie;
try {
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`create: ${created.status} ${await created.text()}`);
  userId = (await created.json()).id;

  const signIn = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!signIn.ok) throw new Error(`sign in: ${signIn.status} ${await signIn.text()}`);
  // @supabase/ssr's cookie format: a `base64-` prefix, then the session as base64.
  const b64 = Buffer.from(JSON.stringify(await signIn.json())).toString("base64");
  cookie = `sb-${REF}-auth-token=base64-${b64}`;

  const page = async (query = "") => {
    const res = await fetch(`${SITE}/dashboard/credits${query}`, {
      headers: { cookie, "cache-control": "no-cache" },
      redirect: "follow",
    });
    return { status: res.status, body: text(await res.text()) };
  };

  // on_conflict is not optional: memberships' PK is `id`, so without naming the
  // unique column PostgREST tries to insert a fresh row and the second call is a
  // 409 that leaves the first state in place — which is how the first run of
  // this script tested `active` three times and reported it as three states.
  const setMembership = async (status) => {
    const res = await svc("/rest/v1/memberships?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, status, started_at: new Date(0).toISOString() }),
    });
    if (!res.ok) throw new Error(`membership ${status}: ${res.status} ${await res.text()}`);
    const [row] = await (await svc(`/rest/v1/memberships?select=status&user_id=eq.${userId}`)).json();
    check(row?.status === status, `state is really '${status}'`, `database says '${row?.status}'`);
  };

  // Written straight to credit_balances rather than through credit_topup, and
  // only ever on a throwaway: credit_ledger is append-only, so a real top-up row
  // would make this account undeletable. The page reads the balance, which is
  // all this is testing.
  const setBalance = async (balance) => {
    const res = await svc("/rest/v1/credit_balances?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, balance }),
    });
    if (!res.ok) throw new Error(`balance ${balance}: ${res.status} ${await res.text()}`);
  };

  console.log("\n  ACTIVE MEMBER — the three buy buttons");
  {
    await setMembership("active");
    const { status, body } = await page();
    check(status === 200, "the page renders", `HTTP ${status}`);
    for (const [credits, dollars] of [["50,000", "5"], ["200,000", "20"], ["500,000", "50"]]) {
      // A LITERAL SINGLE SPACE, not \s*. The first version of this used \s*
      // and passed against a button that read "50,000credits · $5" — JSX drops
      // a bare space next to an expression, and a regex loose enough to
      // tolerate the bug is not a check. The spacing IS the assertion here.
      check(
        body.includes(`${credits} credits · $${dollars}`),
        `the button reads "${credits} credits · $${dollars}", spacing included`,
      );
    }
    check(!body.includes("Renew membership"), "and no renew CTA");
    check(!body.includes("not open yet"), "and it no longer says buying isn't open");
    check(
      body.includes("Credits can only be bought while your membership is active."),
      "the buy panel states the one thing not said elsewhere: the window closes",
    );
    // Guarding the removal, not just the addition. The sentence it replaced was
    // CREDIT_TERMS.whenSpent, which the top of this same page already renders —
    // the same sentence twice, four panels apart. Counting it is how that stays
    // fixed when somebody reaches for the shared constant again.
    const repeats = body.split("credits keep the apps working").length - 1;
    check(repeats === 1, "and says nothing this page has already said", `whenSpent appears ${repeats}×`);
    // The general form of the same bug, since it can appear at any JSX seam:
    // a sentence ending and the next word with no space between them.
    const runOn = body.match(/[a-z][.;][A-Z][a-z]{2,}/g);
    check(!runOn, "no two sentences are run together at a JSX seam", String(runOn));
  }

    console.log("\n  THE RETURN FROM CHECKOUT — the banner must not outlive the credit");
  {
    // The ordering production actually hit: the webhook wins, so the credit is
    // already there when the page renders. The first watcher compared the live
    // balance against the rendered one and waited for it to RISE, which in this
    // ordering never happens — the banner sat for its full 40-second timeout
    // under a balance that was already correct. Reliably wrong for the fastest,
    // healthiest case, which is why the question changed to one the ledger can
    // answer: has a top-up landed since the checkout started?
    const started = Date.now() - 60_000;
    await svc("/rest/v1/credit_ledger", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: userId, kind: "topup", credits: 1, balance_after: 1,
        credit_usd_value_at: 0.0001, margin_multiplier_at: 1.6,
        source: "verify", reference: `verify-banner-${userId}`,
      }),
    });
    const { body } = await page(`?topup=1&t=${started}`);
    check(!body.includes("Adding your credits"),
      "a top-up already landed -> no banner, not a 40-second spinner over the right number");

    // And the other ordering still shows it: nothing has landed since `t`.
    const { body: waiting } = await page(`?topup=1&t=${Date.now() + 60_000}`);
    check(waiting.includes("Adding your credits"),
      "nothing landed yet -> the banner is shown");
  }

  console.log("\n  LAPSED, WITH CREDIT — the live member's actual state");
  {
    await setMembership("expired");
    await setBalance(49994);
    const { body } = await page();
    check(body.includes("Renew membership"), "the renew CTA is there");
    check(/Renew membership\s*—\s*\$10\/mo/.test(body), "reading as a sentence, not an HTML entity", body.match(/Renew membership[^.]{0,24}/)?.[0]);
    check(!body.includes("50,000 credits · $5"), "and the buy buttons are gone");
    check(body.includes("keep working until they run out"), "it says the credits they hold still work");
  }

  console.log("\n  LAPSED, OUT OF CREDIT — the dead end that must not be one");
  {
    await setBalance(0);
    const { body } = await page();
    check(body.includes("Renew membership"), "the way through is offered");
    check(body.includes("credits have run out"), "and it names the situation plainly");
    check(!body.includes("costs less than the smallest"), "and makes no false price claim");
    check(body.includes("back on your own keys"), "it says what renewing actually gets them");
  }
} catch (err) {
  check(false, "the check itself failed", err.message);
} finally {
  if (userId) {
    // Through the guarded RPC, not the auth admin API: this test writes a
    // credit_ledger row, and credit_ledger is append-only — a plain delete
    // cascades into the trigger and is refused, which is how earlier probes
    // stranded accounts in production. erase_synthetic_credit_account refuses
    // anything with a membership, an application, a key, a run, or a ledger row
    // that is not source verify/test, so it cannot reach a real account.
    await svc(`/rest/v1/memberships?user_id=eq.${userId}`, { method: "DELETE" });
    const erased = await (
      await svc("/rest/v1/rpc/erase_synthetic_credit_account", {
        method: "POST",
        body: JSON.stringify({ p_user_id: userId }),
      })
    ).json();
    console.log(`\n  cleanup: ${erased === "ok" ? "throwaway account erased" : `LEFT BEHIND ${userId}: ${JSON.stringify(erased)}`}`);
  }
}
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
