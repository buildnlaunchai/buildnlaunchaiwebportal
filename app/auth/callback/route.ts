import { NextResponse, type NextRequest } from "next/server";

import { claimReferral } from "@/lib/referral";
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

  // Referral attribution: if this sign-in carried a referral cookie, claim it
  // now (once — the RPC only acts while referred_by is null). Best-effort.
  const ref = request.cookies.get("blai_ref")?.value;
  if (ref) {
    try {
      await claimReferral(ref);
    } catch {
      /* never block sign-in on referral attribution */
    }
  }

  // x-forwarded-host is what Vercel sets; behind its proxy, `origin` is the
  // internal host and redirecting to it would break the flow in production.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  const res = NextResponse.redirect(`${base}${next}`);
  if (ref) res.cookies.delete("blai_ref"); // claimed (or not applicable) — clear it
  return res;
}
