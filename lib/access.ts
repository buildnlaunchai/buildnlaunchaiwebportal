import "server-only";

import { cache } from "react";

import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
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
 * The signed-in user, or null. Never throws, never redirects.
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
  // no profile has no role, and guessing one is how you invent a vulnerability.
  if (!profile) return null;

  return { id: user.id, email: user.email ?? profile.email, profile };
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
