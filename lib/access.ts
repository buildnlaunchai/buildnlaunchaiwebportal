import "server-only";

import { cache } from "react";

import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { timed } from "@/lib/timeout";
import type { Profile } from "@/lib/types";

/**
 * Server-side auth. CLAUDE.md §13: every Server Action and every page re-derives
 * the user from the session. A `user_id` from the client is never trusted.
 *
 * Middleware is NOT authorization — it is a redirect, and it runs before the
 * page. These functions are what actually gate a page, and their equivalents
 * run again inside every mutation.
 */

export type AuthedUser = {
  id: string;
  email: string;
  profile: Profile;
};

/**
 * ─── UNKNOWN IS NOT SIGNED OUT ──────────────────────────────────────────────
 *
 * The digest carried by the error `getUser()` throws when the auth server does
 * not answer. It is NOT an error page for "you are logged out" — that case
 * returns null and redirects to /login, which is correct and always has been.
 *
 * This is the other case, and conflating the two is the bug this whole change
 * exists to prevent. On 2026-08-28 the auth server stopped responding for about
 * seven hours. Had `getUser()` returned null on a timeout, every signed-in
 * member would have been told they were logged out and sent to /login — a page
 * that needs the same dead server, so a dead end built out of a half-fix. And
 * `getMyKeys()` and `getKeyReleaseState()` would have rendered "no keys
 * connected" at people whose keys were perfectly safe.
 *
 * Throwing is what makes those impossible. Every caller that does `if (!user)
 * return []` keeps meaning "signed out", because a timeout never reaches it.
 *
 * Next strips server error messages in production and forwards only `digest`,
 * so the digest is what the error boundary matches on to say something specific
 * rather than "something broke".
 */
export const AUTH_UNAVAILABLE = "AUTH_UNAVAILABLE";

function authUnavailable(): Error {
  const err = new Error("auth server did not respond") as Error & { digest?: string };
  err.digest = AUTH_UNAVAILABLE;
  return err;
}

/**
 * How long to wait on the auth server before deciding it is not there.
 *
 * A healthy `auth.getUser()` answers in ~270ms; the profile read that follows is
 * ~200ms. 3s is roughly six times the healthy pair and twenty times faster than
 * the sixty-second gateway timeout it replaces. It is not tuned to be clever —
 * it is chosen to be obviously outside normal so that crossing it means
 * something is genuinely wrong.
 */
const AUTH_DEADLINE_MS = 3000;

/**
 * The signed-in user, or null when nobody is signed in. Never redirects.
 *
 * THROWS when the auth server does not answer inside AUTH_DEADLINE_MS, and that
 * is deliberate — see AUTH_UNAVAILABLE above. Returning null there would mean
 * every caller doing `if (!user) return []` quietly reports an outage as an
 * empty account.
 *
 * Wrapped in React.cache(): the layout AND the page both call requireUser()
 * (correct — §13 wants every layer to re-check, and middleware is not
 * authorization), and each call did a full auth.getUser() + profile fetch. Over
 * the function↔database link that is two extra round trips per navigation for a
 * fact that cannot change within one request. cache() memoizes the result for
 * the lifetime of a single server render, so the checks still all run but the
 * network work happens once. It does NOT persist across requests, so the JWT is
 * still revalidated on every page load — the security property is unchanged, the
 * duplication is not.
 */
export const getUser = cache(async (): Promise<AuthedUser | null> => {
  const result = await timed(async () => {
    const supabase = await createClient();

    // getUser(), not getSession(): getSession reads the cookie and trusts it,
    // getUser revalidates the JWT against the auth server. On the server, the
    // difference is the whole point.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Auth row exists but the profile trigger hasn't landed (or the row was
    // removed). Treat as not-signed-in rather than half-signed-in — a user with
    // no profile has no role, and guessing one is how you invent a
    // vulnerability.
    if (!profile) return null;

    return { id: user.id, email: user.email ?? profile.email, profile };
  }, AUTH_DEADLINE_MS);

  // The distinction this function exists to keep. `null` means we asked and the
  // answer was "nobody"; a throw means we could not ask. See AUTH_UNAVAILABLE.
  if (!result.ok) throw authUnavailable();
  return result.value;
});

/** Requires a signed-in, non-suspended user. Redirects to /login otherwise. */
export async function requireUser(nextPath?: string): Promise<AuthedUser> {
  const user = await getUser();

  if (!user) {
    const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${next}`);
  }

  if (user.profile.is_suspended) {
    redirect("/suspended");
  }

  return user;
}

/**
 * Requires an admin. Anyone else gets a 404 — not a 403.
 *
 * A 403 confirms the route exists and that they simply lack the rank. There is
 * no reason to tell a prober that /admin/users is real. Members should not be
 * able to map the admin surface by watching status codes.
 */
export async function requireAdmin(): Promise<AuthedUser> {
  const user = await getUser();

  if (!user || user.profile.is_suspended || user.profile.role !== "admin") {
    notFound();
  }

  return user;
}
