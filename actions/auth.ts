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
 * The site origin this request actually arrived on.
 *
 * Header-first, on purpose: a Vercel preview deployment must send people back to
 * *itself*, not to production, or every preview's login is broken. On Vercel the
 * proxy always sets x-forwarded-host (the real public host) and x-forwarded-proto,
 * so this is `https://buildnlaunchai.com` in prod and `https://<hash>.vercel.app`
 * on a preview. Trusting that header is safe here even though headers are
 * spoofable: Supabase validates the resulting redirectTo against its allowlist,
 * so a forged host that isn't a domain we own is simply rejected.
 *
 * Whatever this returns must be in the Supabase redirect allowlist (dashboard →
 * Authentication → URL Configuration). If it is NOT, Supabase silently discards
 * our redirectTo and falls back to the Site URL — which is how a login ends up at
 * `localhost:3000/?code=...` with the `next` param gone.
 */
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");

  if (host) {
    // Default to https for any real host; only localhost is plain http.
    const proto =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }

  // No request host. A Server Action normally always has one, so this is the
  // "should never happen" path — and it is exactly where a silent localhost
  // fallback would do real damage, because this origin gets baked into a
  // magic-link email that outlives the request. So: use the configured site
  // URL, and in production refuse rather than emit a localhost link nobody can
  // follow. Fail loud beats fail wrong.
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "getOrigin: no request host and NEXT_PUBLIC_SITE_URL is unset. Refusing " +
        "to build an auth redirect that would point at localhost.",
    );
  }

  return "http://localhost:3000";
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
