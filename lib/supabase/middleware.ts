import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";
import { timed } from "@/lib/timeout";

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
  //
  // ─── AND DO NOT LET IT HANG ───────────────────────────────────────────────
  //
  // This is a network call to the auth server, and on 2026-08-28 that server
  // stopped answering for about seven hours. Unbounded, it held every request
  // open until Vercel's gateway gave up at sixty seconds and returned 504.
  //
  // 2.5s is roughly nine times the healthy p50 (~270ms). Losing the race does
  // not cancel the call — nothing here can — but the RESPONSE stops waiting on
  // it, which is the point.
  const auth = await timed(() => supabase.auth.getUser(), 2500);
  const user = auth.ok ? auth.value.data.user : null;

  const { pathname, searchParams } = request.nextUrl;

  // ─── WHEN WE DO NOT KNOW, GET OUT OF THE WAY ──────────────────────────────
  //
  // A timeout is not "signed out". Redirecting on it would send every signed-in
  // member to /login — which needs the same server that just failed to answer,
  // so it cannot work either.
  //
  // Continuing is safe here and nowhere else, and the reason is the one written
  // at the top of this file and in proxy.ts: MIDDLEWARE IS NOT AUTHORIZATION.
  // It is a redirect. The page still calls requireUser(), which shares this
  // request's deadline through React.cache and throws AUTH_UNAVAILABLE — so the
  // person gets an honest "we cannot reach the sign-in service" screen in about
  // three seconds instead of a minute of nothing. Nothing is exposed by
  // skipping a redirect, because the redirect was never what protected it.
  if (!auth.ok) {
    return response;
  }

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
