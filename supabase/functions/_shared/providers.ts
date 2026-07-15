// One cheap, read-only call per provider to check a key (CLAUDE.md §10). This
// runs in the Edge Function, with the member's decrypted key in memory for the
// length of the call and no longer.
//
// Verdict rules:
//   valid      — the provider accepted the key (2xx, or a 400 that means
//                "authenticated, bad request" rather than "bad key")
//   invalid    — the provider REJECTED the key (401 / 403)
//   unverified — we couldn't tell (network error, 5xx, or a provider we have no
//                cheap check for). Never penalize a key for our own uncertainty.

export type VerifyResult = "valid" | "invalid" | "unverified";

function classify(status: number, okBelow500 = false): VerifyResult {
  if (status === 401 || status === 403) return "invalid";
  if (status >= 200 && status < 300) return "valid";
  // 400 from an authenticated request means the key worked, the body didn't.
  if (okBelow500 && status >= 400 && status < 500) return "valid";
  return "unverified";
}

export async function verifyKey(
  provider: string,
  key: string,
): Promise<VerifyResult> {
  try {
    switch (provider) {
      case "openai": {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        return classify(r.status);
      }
      case "openrouter": {
        const r = await fetch("https://openrouter.ai/api/v1/key", {
          headers: { Authorization: `Bearer ${key}` },
        });
        return classify(r.status);
      }
      case "google_ai": {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        );
        return classify(r.status);
      }
      case "elevenlabs": {
        const r = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": key },
        });
        return classify(r.status);
      }
      case "perplexity": {
        // No free GET; a 1-token completion is the cheapest auth check.
        const r = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        return classify(r.status, true);
      }
      case "anthropic": {
        // 1-token message. A 401/403 = bad key; a 400 = authenticated but bad
        // params, which still proves the key works.
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
        });
        return classify(r.status, true);
      }
      default:
        // serper, apify, replicate, fal, youtube_data, custom — no uniform cheap
        // check wired yet. Store as unverified; a run will prove it.
        return "unverified";
    }
  } catch {
    return "unverified";
  }
}
