import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";
import {
  AUTH_MIDDLEWARE_SLICE_MS,
  AUTH_SPENT_HEADER,
  timed,
} from "@/lib/timeout";

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
  // ─── THE RESPONSE IS BUILT ONCE, AT THE END ───────────────────────────────
  //
  // It used to be rebuilt inside setAll, which was fine while nothing after the
  // auth call needed to change the REQUEST. Now something does: the page has to
  // be told how much of the auth budget middleware spent, and a request header
  // is only forwarded by the NextResponse.next() that actually gets returned.
  // So the cookies Supabase wants to set are collected here and applied to the
  // one response constructed below.
  const cookiesToApply: { name: string; value: string; options?: object }[] = [];
  const started = Date.now();

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
          cookiesToApply.push(...cookiesToSet);
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
  // ONE BUDGET, NOT TWO DEADLINES. The page re-checks auth a moment later, and
  // when both had their own timeout they added up: the black-hole test measured
  // 6.0-6.7s for what this file described as a three-second failure. Middleware
  // takes a small slice — if auth is healthy it answers in ~270ms, and if it is
  // not, middleware fails open regardless, so waiting longer here buys nothing
  // and spends the page's share. What it spent is forwarded below.
  const auth = await timed(() => supabase.auth.getUser(), AUTH_MIDDLEWARE_SLICE_MS);
  const spent = Date.now() - started;
  const user = auth.ok ? auth.value.data.user : null;

  // Forwarded on the REQUEST, so it never reaches the browser and cannot be
  // supplied by one. A caller who forges it can only shorten their own deadline.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(AUTH_SPENT_HEADER, String(spent));

  const respond = () => {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } });
    for (const { name, value, options } of cookiesToApply) {
      res.cookies.set(name, value, options);
    }
    return res;
  };

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
    return respond();
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

  return respond();
}
