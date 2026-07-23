"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Resolves — in the browser, so marketing pages stay static — whether the
 * current visitor is an ACTIVE member (paid, trialing, or an admin). Lets a CTA
 * that would otherwise say "Subscribe" show "Visit dashboard" to someone who has
 * already paid (Bug 2: an active member must never see a Subscribe CTA).
 *
 * Lightweight on purpose: unlike useSubscribe it never loads Paddle.js, so it's
 * cheap to drop on every marketing CTA.
 */
export function useIsActiveMember(): boolean {
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    let live = true;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !live) return;

      const [{ data: profile }, { data: m }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("memberships").select("status, expires_at").maybeSingle(),
      ]);
      if (!live) return;

      const activeMembership =
        !!m &&
        (m.status === "active" || m.status === "trialing") &&
        (m.expires_at === null || new Date(m.expires_at) > new Date());

      // setState after awaits (not synchronously in the effect body) — compiler-safe.
      if (activeMembership || profile?.role === "admin") setIsMember(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  return isMember;
}
