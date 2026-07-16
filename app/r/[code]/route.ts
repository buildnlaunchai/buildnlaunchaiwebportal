import { NextResponse, type NextRequest } from "next/server";

/**
 * A referral link: /r/CODE. Stores the code in a cookie and sends the visitor to
 * the landing page. The attribution itself happens after they sign in (the auth
 * callback reads this cookie and calls claim_referral). We never attribute here,
 * because there's no user yet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const clean = code.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toUpperCase();

  const res = NextResponse.redirect(new URL("/", request.url));
  if (clean) {
    res.cookies.set("blai_ref", clean, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
  return res;
}
