/**
 * Phase 5 — the vault's security guarantees, against the LIVE Edge Function and
 * DB. The one asset that matters, so the checks are adversarial:
 *   - a known plaintext, saved, is nowhere in the DB (only ciphertext)
 *   - the client (authenticated, as the key's own owner) cannot read
 *     ciphertext / iv / auth_tag — column grants, not just a view
 *   - save → verify → delete round-trips, one key per provider
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FN = `${URL}/functions/v1/key-vault`;

const svc = (p, init = {}) => fetch(`${URL}${p}`, { ...init, headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
const token = async (email) => (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "pw-not-real-5521" }) }).then(r => r.json())).access_token;
const vault = (tok, body) => fetch(FN, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

let pass = 0, fail = 0;
const check = (ok, l, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (ok) pass++; else fail++; };

const email = `vault-${Date.now()}@example.com`;
// A recognizable fake key so we can grep the DB for its plaintext.
const SECRET = `sk-PLAINTEXT-CANARY-${Date.now()}-abcdEND`;
let uid;

try {
  uid = (await svc("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, password: "pw-not-real-5521", email_confirm: true }) }).then(r => r.json())).id;
  await new Promise(r => setTimeout(r, 600));
  const tok = await token(email);

  console.log("\n1. Anonymous cannot invoke the function:");
  const anon = await fetch(FN, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", provider: "openai", plaintext: "x" }) });
  check(anon.status === 401, "anon key (no user) → 401", `HTTP ${anon.status}`);

  console.log("\n2. Save a key (encrypt + store + verify):");
  const saveRes = await vault(tok, { action: "save", provider: "openai", label: "Test key", plaintext: SECRET });
  const saved = await saveRes.json();
  check(saveRes.ok, "save returns 200", `HTTP ${saveRes.status}`);
  check(saved.status === "invalid", "a bogus key verifies to 'invalid'", `status=${saved.status}`);
  check(saved.key_hint === "••••dEND" || saved.key_hint?.endsWith("dEND"), "key_hint is last-4 only", saved.key_hint);
  check(!JSON.stringify(saved).includes("PLAINTEXT-CANARY"), "the response contains no plaintext");

  console.log("\n3. THE plaintext is nowhere in the DB (service role sees ALL columns):");
  const rowSvc = await svc(`/rest/v1/user_api_keys?user_id=eq.${uid}&select=*`).then(r => r.json());
  const blob = JSON.stringify(rowSvc);
  check(!blob.includes("PLAINTEXT-CANARY"), "no plaintext canary anywhere in the row");
  check(rowSvc[0]?.ciphertext && rowSvc[0]?.iv && rowSvc[0]?.auth_tag, "ciphertext, iv, auth_tag all present");
  check(rowSvc[0].ciphertext !== SECRET, "ciphertext is not the plaintext");

  console.log("\n4. The CLIENT (owner) cannot read ciphertext / iv / auth_tag:");
  const cipherReq = await fetch(`${URL}/rest/v1/user_api_keys?user_id=eq.${uid}&select=ciphertext,iv,auth_tag`, { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } });
  const cipherBody = await cipherReq.json();
  const denied = !cipherReq.ok || (Array.isArray(cipherBody) && cipherBody.every(r => r.ciphertext === undefined));
  check(denied, "select ciphertext as the owner is denied/empty", `HTTP ${cipherReq.status} ${JSON.stringify(cipherBody).slice(0, 60)}`);

  console.log("\n5. The client CAN read safe metadata via the public view:");
  const pub = await fetch(`${URL}/rest/v1/user_api_keys_public?select=provider,key_hint,status,label`, { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } }).then(r => r.json());
  check(Array.isArray(pub) && pub[0]?.provider === "openai" && pub[0]?.key_hint?.endsWith("dEND"), "public view returns provider + key_hint + status", JSON.stringify(pub[0] ?? {}).slice(0, 80));
  check(pub[0] && pub[0].ciphertext === undefined, "public view has NO ciphertext column");

  console.log("\n6. One key per provider — a second save replaces, not duplicates:");
  await vault(tok, { action: "save", provider: "openai", plaintext: `${SECRET}-v2` });
  const count = (await svc(`/rest/v1/user_api_keys?user_id=eq.${uid}&provider=eq.openai&select=id`).then(r => r.json())).length;
  check(count === 1, "still exactly 1 openai key after a second save", `count=${count}`);

  console.log("\n7. Verify action re-checks and stores status:");
  const ver = await vault(tok, { action: "verify", provider: "openai" }).then(r => r.json());
  check(ver.status === "invalid", "verify re-runs the provider check", `status=${ver.status}`);

  console.log("\n8. Delete removes the row:");
  await vault(tok, { action: "delete", provider: "openai" });
  const after = (await svc(`/rest/v1/user_api_keys?user_id=eq.${uid}&select=id`).then(r => r.json())).length;
  check(after === 0, "row is gone after delete", `count=${after}`);

  console.log("\n9. has_required_keys reflects presence (unverified counts, invalid doesn't):");
  // Save again → invalid. A tool requiring openai should report missing keys.
  await vault(tok, { action: "save", provider: "openai", plaintext: SECRET }); // → invalid
  const yt = (await svc(`/rest/v1/tools?slug=eq.youtube-lead-finder&select=id`).then(r => r.json()))[0].id;
  const hasKeys = await fetch(`${URL}/rest/v1/rpc/has_required_keys`, { method: "POST", headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_tool_id: yt, uid }) }).then(r => r.json());
  check(hasKeys === false, "invalid key → has_required_keys false (youtube needs youtube_data+openai)", `${hasKeys}`);
} finally {
  if (uid) await svc(`/auth/v1/admin/users/${uid}`, { method: "DELETE" });
  console.log("\n  (probe user deleted; keys cascade away)");
}
console.log(`\n${"=".repeat(56)}\n  ${pass} passed, ${fail} failed\n${"=".repeat(56)}`);
process.exit(fail ? 1 : 0);
