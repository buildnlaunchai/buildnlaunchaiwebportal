/**
 * Phase 11, Step 3 — the iframe runtime branch, end to end against the LIVE
 * page, DB and Edge Function.
 *
 * Step 2 proved the token. This proves the SCREEN: that a member with access
 * gets a real app with a real token in its src, that a member without access
 * gets nothing minted at all, and that the signing key is nowhere near the
 * browser.
 *
 * Needs the dev server on :3000 (pnpm dev), like the other page-level checks.
 */
import { readFileSync } from "node:fs";
import { importSPKI, jwtVerify } from "jose";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const REF = new global.URL(URL_).host.split(".")[0];
const SLUG = "image_animator";
const PW = "probe-password-4c81-not-a-real-account";

const svc = (p, i = {}) => fetch(`${URL_}${p}`, { ...i, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", Prefer: "return=representation", ...(i.headers ?? {}) } });
const cookieFor = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const hit = (path, cookie) => fetch(`${APP}${path}`, { headers: { cookie }, redirect: "manual" });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const pubPem = readFileSync(new global.URL("../secrets/hub-jwt-public.pem", import.meta.url), "utf8");
const privPem = readFileSync(new global.URL("../secrets/hub-jwt-private.pem", import.meta.url), "utf8");
const pubKey = await importSPKI(pubPem, "RS256");
// Copied from the animator's lib/hub/verify.ts — its options, not ours.
const ANIMATOR_OPTS = { algorithms: ["RS256"], audience: SLUG, clockTolerance: "30s", maxTokenAge: "1h" };

const tokenFromHtml = (html) => {
  const m = html.match(/hub_token=([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
};

const stamp = Date.now();
const EMAIL = `embed-page-${stamp}@example.com`;
let uid;

try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PW, email_confirm: true }) }).then((r) => r.json())).id;
  await new Promise((r) => setTimeout(r, 800));
  const session = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PW }) }).then((r) => r.json());
  const cookie = cookieFor(session);

  console.log("\n1. The tool row is what an iframe tool must be:");
  const row = (await svc(`/rest/v1/tools?slug=eq.${SLUG}&select=runtime,status,access_type,required_providers`).then((r) => r.json()))[0];
  check(row?.runtime === "iframe", "runtime = iframe", row?.runtime);
  check(row?.status === "published" && row?.access_type === "members", "published + members", `${row?.status}/${row?.access_type}`);
  check((row?.required_providers ?? []).length === 0, "needs no API key — usable the minute a member is approved");

  console.log("\n2. A member WITHOUT a membership — locked, and nothing minted:");
  const denied = await hit(`/dashboard/tools/${SLUG}`, cookie);
  const deniedHtml = await denied.text();
  check(denied.status === 404, "the runner page 404s (§13: don't confirm it exists)", `HTTP ${denied.status}`);
  check(!deniedHtml.includes("hub_token"), "no hub_token anywhere in the response");
  check(!deniedHtml.includes("animator.buildnlaunchai.com"), "the embed_url is not leaked either");
  const dashNoAccess = await hit("/dashboard", cookie).then((r) => r.text());
  check(!dashNoAccess.includes(`/dashboard/tools/${SLUG}`), "and no card for it on /dashboard");

  console.log("\n3. Give them an active membership — the app renders:");
  await svc("/rest/v1/memberships", { method: "POST", body: JSON.stringify({ user_id: uid, status: "active", source: "gift", is_gift: true, started_at: new Date().toISOString() }) });
  const okRes = await hit(`/dashboard/tools/${SLUG}`, cookie);
  const html = await okRes.text();
  check(okRes.status === 200, "the runner page renders", `HTTP ${okRes.status}`);
  check(/<iframe/i.test(html), "an iframe is present");
  check(html.includes("https://animator.buildnlaunchai.com/?hub_token=") || html.includes("https://animator.buildnlaunchai.com/?hub_token"), "its src is the hub SUBDOMAIN (not a vercel.app URL — that would be cross-site)");
  check(/sandbox="[^"]*allow-same-origin/.test(html), "sandbox has allow-same-origin (without it the app loses its cookie)");
  check(/sandbox="[^"]*allow-scripts/.test(html) && /sandbox="[^"]*allow-downloads/.test(html), "…plus allow-scripts and allow-downloads (it exports video)");
  check(!/<form|ToolForm|Run\b/.test(html.split("<iframe")[0].slice(-400)), "no generated form is rendered above it — the app IS the interface");

  console.log("\n4. The token in that src is real, and scoped:");
  const tok = tokenFromHtml(html);
  check(Boolean(tok), "a token is on the iframe src");
  let claims = null;
  try {
    ({ payload: claims } = await jwtVerify(tok, pubKey, ANIMATOR_OPTS));
    check(true, "it verifies under the animator's OWN verify options + the public key");
  } catch (e) {
    check(false, "it verifies under the animator's own verify options", e.message);
  }
  check(claims?.sub === uid, "sub is this member", `${claims?.sub?.slice(0, 8)}…`);
  check(claims?.email === EMAIL, "email is this member");
  check(JSON.stringify(claims?.tools) === `["${SLUG}"]`, "tools = [image_animator] — scoped to this app alone", JSON.stringify(claims?.tools));
  check(claims?.aud === SLUG, "aud = image_animator", String(claims?.aud));
  check(claims?.exp - claims?.iat === 3600, "60-minute life", `${claims?.exp - claims?.iat}s`);

  console.log("\n5. THE KEY: nothing signing-related reaches the browser:");
  const privBody = privPem.split("\n").filter((l) => l && !l.includes("---"))[0];
  check(!html.includes(privBody), "no private key bytes in the page HTML");
  check(!/BEGIN (RSA )?PRIVATE KEY|HUB_JWT_PRIVATE_KEY/.test(html), "no PEM header, no env var name");
  const priv401 = await fetch(`${URL_}/rest/v1/tool_secrets?select=embed_url`, { headers: { apikey: ANON, Authorization: `Bearer ${session.access_token}` } });
  const privBodyRes = await priv401.json();
  check(!priv401.ok || (Array.isArray(privBodyRes) && privBodyRes.length === 0), "the member cannot read tool_secrets from the API, as themselves", `HTTP ${priv401.status} ${JSON.stringify(privBodyRes).slice(0, 44)}`);

  console.log("\n6. Revocation and suspension still win:");
  await svc(`/rest/v1/memberships?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ status: "revoked" }) });
  const revoked = await hit(`/dashboard/tools/${SLUG}`, cookie);
  const revokedHtml = await revoked.text();
  check(revoked.status === 404, "membership revoked → 404 on the next load", `HTTP ${revoked.status}`);
  check(!revokedHtml.includes("hub_token"), "and no token minted");

  await svc(`/rest/v1/memberships?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
  await svc(`/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ is_suspended: true }) });
  const susp = await hit(`/dashboard/tools/${SLUG}`, cookie);
  check(susp.status === 307 || susp.status === 404, "suspended → no app (suspension beats everything)", `HTTP ${susp.status}`);
  check(!(await susp.text()).includes("hub_token"), "and no token minted");
  await svc(`/rest/v1/profiles?id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ is_suspended: false }) });

  // ---- 7. The other half of the loop: the LIVE app, over HTTPS -----------
  //
  // The app's middleware sets the hub_token cookie ONLY when the token
  // verifies. So Set-Cookie is a signal we can read from here: it proves the
  // deployed HUB_PUBLIC_KEY really is the pair of the key in Supabase secrets.
  // No browser needed for that — a browser is needed for what happens after.
  console.log("\n7. The live app at animator.buildnlaunchai.com:");
  const bare = await fetch("https://animator.buildnlaunchai.com/", { redirect: "manual" });
  const bareHtml = await bare.text();
  check(bare.status === 200 && /locked/i.test(bareHtml), "no token → locked state (not its standalone login)", `HTTP ${bare.status}`);

  const handoff = async (t) => {
    const r = await fetch(`https://animator.buildnlaunchai.com/?hub_token=${t}`, { redirect: "manual" });
    return { status: r.status, setCookie: r.headers.get("set-cookie") ?? "" };
  };

  const good = await handoff(tok);
  check(/hub_token=/.test(good.setCookie), "OUR token → the app accepts it and sets its session cookie", `HTTP ${good.status}`);
  check(good.status === 307 || good.status === 302, "…and redirects to the clean URL, stripping the token", `HTTP ${good.status}`);

  const { SignJWT, generateKeyPair, importPKCS8 } = await import("jose");
  const priv = await importPKCS8(privPem, "RS256");
  const foreign = await generateKeyPair("RS256");
  const forged = await new SignJWT({ email: EMAIL, tools: [SLUG] }).setProtectedHeader({ alg: "RS256" }).setSubject(uid).setAudience(SLUG).setIssuedAt().setExpirationTime("10m").sign(foreign.privateKey);
  const forgedRes = await handoff(forged);

  // Minted with the REAL key but addressed elsewhere. This is the cross-app
  // replay a compromised sibling app would attempt.
  const wrongAud = await new SignJWT({ email: EMAIL, tools: [SLUG] }).setProtectedHeader({ alg: "RS256" }).setSubject(uid).setAudience("some-other-app").setIssuedAt().setExpirationTime("10m").sign(priv);
  const wrongAudRes = await handoff(wrongAud);

  const cspLive = bare.headers.get("content-security-policy") ?? "";
  const redeployed = /frame-ancestors/.test(cspLive);

  // Does the live app accept ANY token from us? Everything below depends on it,
  // and if it doesn't, every other live signal is meaningless rather than good:
  // "rejects a token for another app" reads like aud enforcement when in fact
  // the app is rejecting everything, including tokens it should accept.
  const liveAccepts = /hub_token=/.test(good.setCookie);

  if (!liveAccepts) {
    console.log("\n  ⚠ THE LIVE APP REJECTS OUR TOKEN — and that is a real failure, not a pending one.");
    console.log("    Our side is proven: this exact token verifies under the public key in");
    console.log("    secrets/ using the animator's own verify options (checks above). So the");
    console.log("    key deployed as HUB_PUBLIC_KEY is not the pair of the key in Supabase —");
    console.log("    missing, malformed, or added to Vercel AFTER the build that is live.");
    console.log("    Vercel logs on the embedded project print the exact reason:");
    console.log("      [hub] rejected token from query: <reason>");
    console.log("        'HUB_PUBLIC_KEY is missing or not a valid PEM…' → not set / mangled");
    console.log("        'signature verification failed'                 → wrong key");
    console.log("    Nothing about aud or SameSite can be judged until this passes: the app");
    console.log("    rejects every token, so a rejection proves nothing.");
  } else if (redeployed) {
    // Only meaningful now that we know the app accepts a good token: a rejection
    // is evidence of a working check, not of a broken key.
    check(!/hub_token=/.test(forgedRes.setCookie), "a token signed by a DIFFERENT key → no cookie (its key really is ours)");
    // frame-ancestors must allow BOTH hub origins: the hub answers at the apex
    // and at www, and Next client-side nav can leave the parent on either. A
    // www-only list blocked the apex parent with a CSP violation (empty iframe).
    check(
      cspLive.startsWith("frame-ancestors") &&
        cspLive.includes("https://buildnlaunchai.com") &&
        cspLive.includes("https://www.buildnlaunchai.com"),
      "frame-ancestors allows both hub origins (apex + www)",
      cspLive.slice(0, 90),
    );
    check(!/hub_token=/.test(wrongAudRes.setCookie), "a real-key token for ANOTHER app → rejected (aud enforced)");
    check(/samesite=lax/i.test(good.setCookie), "the session cookie is SameSite=Lax", good.setCookie.split(";").slice(1).join(";").trim().slice(0, 50));
    check(!/domain=/i.test(good.setCookie), "…and host-only (no Domain= — it must not reach sibling apps)");
  } else {
    console.log("\n  ⚠ PENDING REDEPLOY — the app accepts our token, but still runs pre-Phase-11 code:");
    console.log(`      · frame-ancestors pinned to the hub      → now: ${cspLive || "no CSP header — any site can frame it"}`);
    console.log(`      · aud enforced (cross-app replay closed) → now: ${/hub_token=/.test(wrongAudRes.setCookie) ? "ACCEPTS a token minted for another app" : "rejected"}`);
    console.log(`      · session cookie SameSite=Lax            → now: ${(good.setCookie.match(/samesite=\w+/i) ?? ["not set"])[0]}`);
    console.log("    Commit + redeploy the animator, then re-run this script.");
  }
} finally {
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  console.log("\n  (probe user deleted; the image_animator row is real and stays)");
}

console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
