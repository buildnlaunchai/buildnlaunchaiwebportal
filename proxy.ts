import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * ─── THE THREE PATHS THAT NEED A SESSION AT THE EDGE, AND NOTHING ELSE ───
     *
     * This used to be a negative matcher — everything except static assets —
     * which meant `updateSession` ran on the landing page, the tool catalog,
     * the pricing page and every legal page. `updateSession` begins with
     * `supabase.auth.getUser()`, and that is a NETWORK CALL to the auth server.
     *
     * On 2026-08-28 that auth server stopped answering for about seven hours
     * (a Supabase incident, major, still open at the time of writing). Because
     * of this matcher, the marketing site went down with it: `/` returned 504
     * for anyone carrying a session cookie, on a page that neither needs nor
     * reads a session. A dependency the public site had no reason to have.
     *
     * So the matcher is now positive, and it is short because it turned out to
     * need to be. NOT ONE marketing page makes a server-side auth call — all
     * eleven were checked — and the signed-in header menu is a client
     * component that resolves in the browser, where a slow auth server costs a
     * spinner rather than the whole response.
     *
     *   /dashboard/*  /admin/*   the signed-out -> /login?next= redirect
     *   /login                   the signed-in -> ?next bounce
     *
     * `/auth/callback` is deliberately absent: it performs its own code
     * exchange with `exchangeCodeForSession`, so middleware's `getUser()` would
     * be a second, redundant round trip in front of the one that matters — and
     * during an outage, a hang in front of the only thing that could fix it.
     *
     * STILL NOT A SECURITY BOUNDARY, and narrowing it does not make it one. If
     * you ever catch yourself reasoning "that path is safe because middleware
     * doesn't run on it", you have made a mistake — go and read lib/access.ts,
     * which is what actually guards a page. Every route removed here already
     * had no server-side auth call to lose.
     *
     * WHAT THIS GIVES UP: the session cookie is no longer refreshed while
     * someone reads marketing pages. Two things cover it — the browser client
     * refreshes on its own, and the next /dashboard request refreshes
     * server-side. The cost is at worst one extra refresh, never a logout.
     */
    "/dashboard/:path*",
    "/admin/:path*",
    "/login",
  ],
};
