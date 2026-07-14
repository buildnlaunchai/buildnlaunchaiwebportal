import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where Google and the magic link both land. Exchanges the one-time code for a
 * session cookie, then forwards the user to wherever they were originally
 * headed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Same rule as the Server Action: root-relative paths only. Without this the
  // callback is an open redirect, and an open redirect on an auth endpoint is a
  // ready-made phishing link that genuinely comes from our domain.
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Expired or already-used link. Say so plainly on the login page rather
    // than dumping the provider's error at the user.
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  // x-forwarded-host is what Vercel sets; behind its proxy, `origin` is the
  // internal host and redirecting to it would break the flow in production.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  return NextResponse.redirect(`${base}${next}`);
}
