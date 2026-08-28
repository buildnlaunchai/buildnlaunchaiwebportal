/**
 * Is the error boundary MOUNTED, and does a real browser render it?
 *
 * ─── THE BLIND SPOT THIS EXISTS TO CLOSE ────────────────────────────────────
 *
 * Every other verify:* script uses fetch. The auth-outage work spent four
 * rounds on a bug that fetch structurally cannot see: error.tsx is a CLIENT
 * component, so on a document request the server streams a 500 plus a digest
 * and the fallback renders after hydration. curl reported a bare 500 for a fix
 * that was already correct, and I believed it.
 *
 * So this script does two things no other one does: it reads the RSC payload
 * for whether Next mounted a boundary at all, and it renders the page in
 * headless Chrome.
 *
 * ─── WHAT EACH LAYER PROVES, AND WHAT IT DOES NOT ───────────────────────────
 *
 * LAYER 1 — MOUNTED. Runs against production on a healthy day, no outage
 * required, and it is the exact failure that cost the four rounds. The root
 * layout's children slot carries the boundary, and the payload says so plainly:
 *
 *     "error":"$undefined"   no boundary — the throw reaches the root unhandled
 *     "error":"$3"           mounted, with errorScripts to load it
 *
 * Three placements produced the first form and looked identical from outside.
 * This assertion is cheap, always runnable, and catches all three.
 *
 * LAYER 2 — RENDERS. Loads the page in Chrome and confirms hydration completes
 * and the app paints. On a healthy backend that proves the browser harness
 * works and the page is not broken; it does NOT prove the unavailable screen
 * appears, because that needs the backend to actually be down.
 *
 * For the real thing, point it at a black-holed deployment:
 *
 *     node scripts/verify-error-boundary.mjs --outage-url https://<preview>
 *
 * and it asserts the ServiceUnavailable copy is on screen. That is how the fix
 * was finally proved; the proxy that makes such a deployment is deliberately not
 * in this repo (it forwards arbitrary requests to Supabase), so recreating it is
 * a deliberate act, which is the point.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.VERIFY_SITE_URL ?? "https://www.buildnlaunchai.com";
const outageIdx = process.argv.indexOf("--outage-url");
const OUTAGE = outageIdx > 0 ? process.argv[outageIdx + 1] : null;
const TARGET = OUTAGE ?? SITE;

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => existsSync(p));

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
};
const svc = (p, i = {}) =>
  fetch(`${URL_}${p}`, {
    ...i,
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(i.headers ?? {}) },
  });

/** The cookie name @supabase/ssr derives, which is the project ref for prod. */
const cookieName = (supabaseUrl) =>
  "sb-" + new URL(supabaseUrl).hostname.split(".")[0] + "-auth-token";

/**
 * Chrome reads cookies from its own SQLite jar, not from a header we pass. The
 * first version of this script skipped that, so the browser loaded /dashboard
 * signed OUT, got redirected to /login, and reported "199 chars of text" as
 * though the page were broken.
 */
function plantCookie(profile, host, name, value) {
  const dir = join(profile, "Default");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "Cookies"));
  db.exec(`
    CREATE TABLE cookies(creation_utc INTEGER NOT NULL,host_key TEXT NOT NULL,top_frame_site_key TEXT NOT NULL DEFAULT '',name TEXT NOT NULL,value TEXT NOT NULL,encrypted_value BLOB DEFAULT '',path TEXT NOT NULL,expires_utc INTEGER NOT NULL,is_secure INTEGER NOT NULL,is_httponly INTEGER NOT NULL,last_access_utc INTEGER NOT NULL,has_expires INTEGER NOT NULL,is_persistent INTEGER NOT NULL,priority INTEGER NOT NULL,samesite INTEGER NOT NULL,source_scheme INTEGER NOT NULL,source_port INTEGER NOT NULL,last_update_utc INTEGER NOT NULL,source_type INTEGER NOT NULL DEFAULT 0,has_cross_site_ancestor INTEGER NOT NULL DEFAULT 0,PRIMARY KEY (host_key,top_frame_site_key,name,path,source_scheme,source_port));
    CREATE TABLE meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY,value LONGVARCHAR);
    INSERT INTO meta VALUES('version','24');
    INSERT INTO meta VALUES('last_compatible_version','24');
  `);
  const now = Math.round((Date.now() / 1000 + 11644473600) * 1e6);
  const exp = Math.round((Date.now() / 1000 + 86400 + 11644473600) * 1e6);
  db.prepare(
    "INSERT INTO cookies (creation_utc,host_key,name,value,path,expires_utc,is_secure,is_httponly,last_access_utc,has_expires,is_persistent,priority,samesite,source_scheme,source_port,last_update_utc) VALUES (?,?,?,?,?,?,1,0,?,1,1,1,-1,2,443,?)",
  ).run(now, host, name, value, "/", exp, now, now);
  db.close();
}

let userId, cookie;
try {
  const email = `boundary-${Date.now()}@example.com`;
  const pw = "boundary-6b41-not-a-real-account";
  const created = await svc("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password: pw, email_confirm: true }),
  });
  if (!created.ok) throw new Error(`create: ${created.status} ${await created.text()}`);
  userId = (await created.json()).id;
  await svc("/rest/v1/memberships?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, status: "active", started_at: new Date(0).toISOString() }),
  });
  const session = await (
    await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw }),
    })
  ).json();
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  cookie = `${cookieName(URL_)}=${value}`;

  console.log("\n  LAYER 1 — is a boundary mounted on the root children slot?");
  {
    const res = await fetch(`${TARGET}/dashboard`, {
      headers: { cookie, "cache-control": "no-cache" },
      redirect: "manual",
    });
    const html = await res.text();
    // The payload arrives JSON-escaped inside a <script>, so every quote is a
    // backslash-quote. Unescape first rather than writing a regex that has to
    // match both forms — the first version of this matched neither and reported
    // "no children slot found", which reads exactly like a real failure.
    const flat = html.replace(/\\"/g, '"');
    const slot = flat.match(/"parallelRouterKey":"children","error":"([^"]*)/);
    const value_ = slot?.[1] ?? "(no children slot found)";
    check(
      value_ !== "$undefined" && value_ !== "(no children slot found)",
      "the root children slot carries an error boundary",
      `"error":"${value_}"`,
    );
    check(
      /"errorScripts":\[\[/.test(flat),
      "and its client chunk is sent, so it can render after hydration",
    );
  }

  console.log("\n  LAYER 2 — does a real browser render it?");
  if (!CHROME) {
    check(false, "headless Chrome not found — install it or this layer is blind");
  } else {
    const profile = mkdtempSync(join(tmpdir(), "boundary-"));
    try {
      plantCookie(profile, new URL(TARGET).hostname, cookieName(URL_), cookie.split("=").slice(1).join("="));
      const { stdout } = await run(
        CHROME,
        [
          "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
          "--no-default-browser-check", `--user-data-dir=${profile}`,
          "--virtual-time-budget=20000", "--dump-dom", `${TARGET}/dashboard`,
        ],
        { timeout: 90_000, maxBuffer: 32 * 1024 * 1024 },
      ).catch((e) => ({ stdout: e.stdout ?? "" }));
      const text = stdout
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      check(text.length > 200, "the page rendered in a browser", `${text.length} chars of text`);
      if (OUTAGE) {
        check(
          text.includes("You\u2019re still signed in"),
          "and with the backend black-holed it shows the unavailable screen",
          text.slice(0, 90),
        );
        check(
          text.includes("Something this page depends on"),
          "with copy that names no subsystem",
        );
      } else {
        console.log("        (healthy backend: pass --outage-url to assert the screen itself)");
      }
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  }
} catch (err) {
  check(false, "the check itself failed", err.message);
} finally {
  if (userId) {
    await svc(`/rest/v1/memberships?user_id=eq.${userId}`, { method: "DELETE" });
    const del = await svc(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    console.log(`\n  cleanup: ${del.ok ? "throwaway account deleted" : `LEFT BEHIND ${userId}`}`);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
