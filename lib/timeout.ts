/**
 * Bounding a call that might never answer.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-08-28 Supabase's auth server stopped responding for about seven
 * hours. Nothing in this codebase had a deadline on it, so every request that
 * touched auth waited until Vercel's gateway gave up and returned 504 — a
 * sixty-second hang in front of a user, for a failure that was knowable in
 * under a second.
 *
 * A timeout does not make a dependency reliable. What it buys is the ability to
 * SAY SOMETHING: a page that knows in 2.5s that it cannot reach auth can render
 * an honest error, and an honest error a person can act on beats a spinner that
 * ends in a gateway timeout.
 *
 * ─── WHAT IT RETURNS, AND WHY IT IS NOT JUST A FALLBACK VALUE ───────────────
 *
 * A plain `withTimeout(work, ms, fallback)` collapses "it said no" into "it
 * didn't answer", and for auth those are opposite facts: `null` from getUser
 * means SIGNED OUT, while a timeout means WE DO NOT KNOW. Treating the second
 * as the first logs every signed-in member out during an outage and redirects
 * them to a login page that also cannot work. So the result is discriminated,
 * and each caller decides what its own not-knowing means.
 */

export type Timed<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error"; error?: unknown };

/**
 * Run `work`, giving up after `ms`.
 *
 * NOTE ON WHAT A TIMEOUT DOES NOT DO: losing the race does not cancel the
 * underlying request — there is no signal threaded through the Supabase client
 * to cancel. The hung call keeps running in the background until the runtime
 * tears the invocation down. That is acceptable because the RESPONSE is no
 * longer waiting on it, which is the whole point; but it is why this is a
 * deadline for the user, not a resource limit for the server.
 */
export async function timed<T>(work: () => Promise<T>, ms: number): Promise<Timed<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<Timed<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), ms);
  });

  // The .then/.catch here rather than a try/await: the losing promise must
  // still have a handler attached, or a rejection that arrives after the race
  // is over becomes an unhandled rejection and can take the process with it.
  const attempt = work().then(
    (value): Timed<T> => ({ ok: true, value }),
    (error): Timed<T> => ({ ok: false, reason: "error", error }),
  );

  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
