import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";

/**
 * Refreshes the auth cookie and applies route guards.
 *
 * READ THIS BEFORE TRUSTING IT: middleware is NOT authorization (CLAUDE.md
 * §13). It is a redirect, and it is the FIRST of three checks, not the only
 * one. The page re-checks, and every Server Action re-checks. If middleware
 * were the only gate, a single misconfigured `matcher` would open the admin
 * dashboard to the world — and a matcher is one line of config that no test
 * ever looks at.
 *
 * So: this exists to give people the right redirect, not to keep anyone out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not remove: this refreshes the session cookie. Without it, a user is
  // silently logged out when their access token expires.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;

  const isAuthed = Boolean(user);
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");
  const isLogin = pathname === "/login";

  // Signed out, reaching for the app → send them to sign in, and remember
  // where they were going so they land there afterwards rather than on a
  // generic dashboard.
  if (!isAuthed && (isDashboard || isAdmin)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in and hitting /login → nothing to do here. Honour ?next
  // so the OAuth round-trip lands where they started.
  if (isAuthed && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = searchParams.get("next") ?? "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // NOTE: /admin is NOT role-checked here, on purpose. Doing so would mean a
  // database round-trip on every single admin request, and it would still not
  // be authorization — requireAdmin() in the page is what actually decides, and
  // it 404s. Middleware only answers "are you signed in at all".

  return response;
}
