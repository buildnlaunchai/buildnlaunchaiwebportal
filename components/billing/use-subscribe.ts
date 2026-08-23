"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * The one place the subscribe decision lives. Every "Subscribe — $10/mo" CTA in
 * the product shares this hook so the states are identical everywhere; each CTA
 * supplies only its own markup.
 *
 * State resolves in the browser (so marketing pages stay static):
 *   - guest      → not signed in. A membership must attach to a real account, so
 *                  we send them to log in first, then they land where they can
 *                  subscribe.
 *   - subscribe  → signed in, no active membership → go to Creem checkout.
 *   - member     → already active → don't let them double-subscribe; go to the app.
 *   - loading    → still resolving; a click is a no-op.
 *
 * WHAT THIS HOOK NO LONGER DOES, AND WHY THAT IS THE POINT
 * ------------------------------------------------------------------
 * The Paddle version loaded Paddle.js on first click, held the signed-in user in
 * a ref, and opened an overlay with `customData: { user_id }` — so the browser
 * was the thing that decided WHOSE membership a payment would activate.
 *
 * Creem checkout is a server-side redirect instead. /api/checkout derives the
 * user from the Supabase session and looks the product up in `plans`, so the
 * client sends neither. There is no SDK to lazy-load, no price id to thread
 * through props, and — the part that matters — no client-supplied identity
 * anywhere in the payment path (CLAUDE.md §13).
 */
export type SubscribeState = "loading" | "guest" | "subscribe" | "member";

export function useSubscribe(loginNext = "/dashboard") {
  const [state, setState] = useState<SubscribeState>("loading");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setState("guest");
        return;
      }
      // RLS scopes this to their own row.
      const { data: m } = await supabase
        .from("memberships")
        .select("status, expires_at")
        .maybeSingle();
      if (!active) return;
      const isActive =
        !!m &&
        (m.status === "active" || m.status === "trialing") &&
        (m.expires_at === null || new Date(m.expires_at) > new Date());
      setState(isActive ? "member" : "subscribe");
    })();
    return () => {
      active = false;
    };
  }, []);

  /** What the CTA calls on click. Routes by state. */
  const act = useCallback(() => {
    if (state === "guest") {
      router.push(`/login?next=${encodeURIComponent(loginNext)}`);
      return;
    }
    if (state === "member") {
      router.push("/dashboard");
      return;
    }
    if (state !== "subscribe") return;

    // A FULL-PAGE navigation, deliberately — not router.push(). /api/checkout is
    // a Route Handler that answers 307 to Creem's hosted page; the App Router
    // client cannot navigate to a Route Handler (it expects an RSC payload and
    // the redirect to a third-party origin would not be followed). Assigning
    // location is what actually leaves the app.
    window.location.href = "/api/checkout";
  }, [state, loginNext, router]);

  return { state, act };
}
