import "server-only";

import { referralAutoGrantEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Attribute the signed-in user to a referrer (once, only while referred_by is
 * null) and, if the referrer crossed the threshold, auto-grant them a
 * membership — all inside claim_referral, which writes only to memberships. This
 * runs from the auth callback right after sign-in, with the referral cookie.
 */
export async function claimReferral(code: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("claim_referral", { p_code: code });
  const res = data as
    | { claimed: boolean; referrer?: string; granted?: boolean }
    | null;
  if (!res?.claimed) return;

  // If the referrer just earned a membership, tell them (§11). Notification +
  // email are best-effort; the grant already happened in the RPC.
  if (res.granted && res.referrer) {
    const svc = createAdminClient();
    const { data: referrer } = await svc
      .from("profiles")
      .select("email")
      .eq("id", res.referrer)
      .maybeSingle();
    if (referrer?.email) {
      await notifyUser({
        userId: res.referrer,
        title: "Your referrals earned you a membership",
        body: "Enough people you referred joined — your membership is active.",
        href: "/dashboard",
        email: { to: referrer.email, ...referralAutoGrantEmail() },
      });
    }
  }
}
