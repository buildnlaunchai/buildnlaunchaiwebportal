// The handler contract (CLAUDE.md §9.2). A handler is a pure-ish function: it
// gets validated input and the member's decrypted keys, and returns an object
// whose keys match the tool's output_schema block keys. It does not touch the
// database, does not know what a run is, and does not manage its own errors —
// run-tool/index.ts owns all of that, once, for every tool.
//
// SECURITY: never log ctx or ctx.secrets. Edge Function logs are retained;
// console.log(ctx) is a security incident, not a debugging convenience (§9.6).

export type RunContext = {
  input: Record<string, unknown>;
  secrets: Record<string, string>; // provider → plaintext key, in memory only
};

export type Handler = (ctx: RunContext) => Promise<Record<string, unknown>>;

/**
 * Thrown by a handler when a provider rejects the member's key (401/403). The
 * orchestrator catches this, marks that key invalid, and gives the member the
 * first-class "your key stopped working" path (§9.3 step h) rather than a
 * generic error.
 */
export class ProviderAuthError extends Error {
  provider: string;
  constructor(provider: string) {
    super(`${provider} rejected the key`);
    this.name = "ProviderAuthError";
    this.provider = provider;
  }
}

/** Small helper: throw ProviderAuthError on 401/403, otherwise return the res. */
export async function providerFetch(
  provider: string,
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 || res.status === 403) {
    throw new ProviderAuthError(provider);
  }
  return res;
}
