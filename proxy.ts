import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and images. The session cookie has to be
     * refreshed on real page requests, and only those.
     *
     * This matcher is a performance optimisation, NOT a security boundary. If
     * you ever catch yourself reasoning "that path is safe because middleware
     * doesn't run on it", you have made a mistake — go and read lib/access.ts,
     * which is what actually guards a page.
     *
     * api/webhooks is excluded because a webhook carries no session cookie (so
     * the refresh is wasted) and authenticates itself by HMAC signature, not by
     * anything middleware could check. Its guard is in the route, not here.
     */
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
