const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "http://localhost:3000";
const REF = new global.URL(URL).host.split(".")[0];

const svc = (p, init = {}) => fetch(`${URL}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const token = async (email) => (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-not-real-661" }) }).then(r => r.json())).access_token;
const cookie = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
const hit = (path, c) => fetch(`${APP}${path}`, { headers: { cookie: c }, redirect: "manual" });
const vault = (tok, body) => fetch(`${URL}/functions/v1/key-vault`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const email = `keyspage-${Date.now()}@example.com`;
let uid;
try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-not-real-661", email_confirm: true, user_metadata: { full_name: "Keys Probe" } }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 600));
  const tok = await token(email);
  const sessionObj = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-not-real-661" }) }).then(r => r.json());
  const c = cookie(sessionObj);
  // Give them a membership so they see the members tool (youtube needs a key).
  await svc("/rest/v1/memberships", { method: "POST", body: JSON.stringify({ user_id: uid, status: "active", source: "gift", started_at: new Date().toISOString() }) });

  console.log("\n1. Keys page: empty state + honesty copy (verbatim):");
  const empty = await hit("/dashboard/keys", c);
  const emptyH = await empty.text();
  check(empty.status === 200, "/dashboard/keys renders", `HTTP ${empty.status}`);
  check(emptyH.includes("No keys connected"), "empty state present");
  check(emptyH.includes("encrypted before it") && emptyH.includes("show it back to you") && emptyH.includes("useless without a key I keep off the server"), "honesty copy verbatim — nothing stronger");
  check(emptyH.includes("Connect a key"), "add-key form present");
  check(emptyH.includes("platform.openai.com/api-keys"), "provider teaching link present");

  console.log("\n2. Deep-link ?provider=anthropic preselects the provider:");
  const pre = await hit("/dashboard/keys?provider=anthropic", c);
  const preH = await pre.text();
  check(preH.includes("console.anthropic.com"), "anthropic teaching shown when preselected");

  console.log("\n3. After saving a (bogus) key → keys page lists it as invalid:");
  await vault(tok, { action: "save", provider: "openai", label: "My key", plaintext: "sk-bogus-canary-END" });
  const withKey = await hit("/dashboard/keys", c);
  const wkH = await withKey.text();
  check(wkH.includes("••••") && wkH.includes("END"), "key_hint shown (last 4)");
  check(wkH.includes("invalid"), "status pill shows invalid for the bogus key");
  check(!wkH.includes("sk-bogus-canary"), "plaintext key never appears in the page HTML");

  console.log("\n4. Dashboard tool card key state:");
  const dash = await hit("/dashboard", c);
  // Strip React's <!-- --> text-node separators so "needs: {providers}" reads whole.
  const dH = (await dash.text()).replace(/<!--[^>]*-->/g, "");
  // youtube-lead-finder needs youtube_data + openai. openai is invalid→missing, youtube_data absent→missing.
  // The canonical ToolCard consolidates all missing providers into ONE amber footer chip
  // ("needs: youtube_data, openai") rather than a chip per provider — both are still named.
  check(dH.includes("YouTube lead finder"), "member sees the members tool");
  const needsText = (dH.match(/needs:\s*([^<]+)/) ?? [, ""])[1];
  check(needsText.includes("youtube_data") && needsText.includes("openai"), "both missing/invalid providers named in the amber 'needs:' chip");

  console.log("\n5. Verify a good status renders as verified: (simulate via DB set to 'valid')");
  await svc(`/rest/v1/user_api_keys?user_id=eq.${uid}&provider=eq.openai`, { method: "PATCH", body: JSON.stringify({ status: "valid" }) });
  const dash2 = await hit("/dashboard/keys", c);
  const d2 = await dash2.text();
  check(d2.includes("verified"), "keys page shows 'verified' pill for a valid key");

  console.log("\n6. Non-secret: the keys PAGE HTML never contains ciphertext/iv/auth_tag:");
  const leak = ["ciphertext", "auth_tag", '"iv"'].filter(s => wkH.includes(s) || d2.includes(s));
  check(leak.length === 0, "no ciphertext/iv/auth_tag in any keys page HTML", leak.join(","));
} finally {
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  console.log("\n  (probe user deleted)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
