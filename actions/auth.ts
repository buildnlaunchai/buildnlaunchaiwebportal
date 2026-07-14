"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/* CLAUDE.md §15: every Server Action file starts with "use server", and every
   action starts with an auth check. These three are the exception that proves
   it — they are how you *become* authed. Everything else in actions/ checks. */

export type AuthResult = { error: string } | { sent: true };

/**
 * The site origin, from the request rather than a hardcoded env var, so that
 * Vercel preview deployments redirect back to *themselves* instead of to
 * production. NEXT_PUBLIC_SITE_URL is the fallback for contexts with no request.
 */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Only ever redirect to a path on this site. Never to an attacker's URL. */
function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  // Must be a root-relative path. "//evil.com" and "https://evil.com" are both
  // rejected — an open redirect on the login flow is a phishing gift.
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function signInWithGoogle(next?: string): Promise<AuthResult> {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
    },
  });

  if (error || !data.url) {
    return { error: "Google sign-in is unavailable right now. Try a magic link." };
  }

  redirect(data.url);
}

const emailSchema = z.email("That doesn't look like an email address.");

export async function sendMagicLink(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const next = safeNext(formData.get("next")?.toString());
  const supabase = await createClient();
  const origin = await getOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // Deliberately vague. A precise error here ("no such user") would turn the
    // login form into an account-enumeration oracle.
    return { error: "Couldn't send the link. Check the address and try again." };
  }

  return { sent: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
