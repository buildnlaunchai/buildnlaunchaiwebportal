"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * The one place the subscribe decision lives. Every "Subscribe — $10/mo" CTA in
 * the product shares this hook so the states — and the Paddle wiring — are
 * identical everywhere; each CTA supplies only its own markup.
 *
 * State resolves in the browser (so marketing pages stay static):
 *   - guest      → not signed in. A membership must attach to a real account, so
 *                  we send them to log in first (the same auth-before-join rule
 *                  the old apply flow had), then they land where they can subscribe.
 *   - subscribe  → signed in, no active membership → open Paddle's overlay.
 *   - member     → already active → don't let them double-subscribe; go to the app.
 *   - loading    → still resolving; a click is a no-op.
 *
 * Paddle.js is loaded LAZILY on first click, not on mount — so a visitor who
 * never subscribes never pays for Paddle's script, and N buttons on a page don't
 * each initialise the SDK.
 */
export type SubscribeState = "loading" | "guest" | "subscribe" | "member";

const PADDLE_ENV =
  (process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production" | undefined) ??
  "sandbox";

export function useSubscribe(priceId: string | null, loginNext = "/dashboard") {
  const [state, setState] = useState<SubscribeState>("loading");
  const userRef = useRef<{ id: string; email: string } | null>(null);
  const paddleRef = useRef<Paddle | undefined>(undefined);
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
      userRef.current = { id: user.id, email: user.email ?? "" };
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

  const ensurePaddle = useCallback(async (): Promise<Paddle | undefined> => {
    if (paddleRef.current) return paddleRef.current;
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return undefined;
    const paddle = await initializePaddle({ environment: PADDLE_ENV, token });
    paddleRef.current = paddle;
    return paddle;
  }, []);

  /** What the CTA calls on click. Routes or opens checkout by state. */
  const act = useCallback(async () => {
    if (state === "guest") {
      router.push(`/login?next=${encodeURIComponent(loginNext)}`);
      return;
    }
    if (state === "member") {
      router.push("/dashboard");
      return;
    }
    if (state !== "subscribe" || !priceId) return;

    const user = userRef.current;
    const paddle = await ensurePaddle();
    if (!user || !paddle) return;

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      // The webhook (Phase 4) reads user_id to attach the membership to the right
      // profile — Paddle's events don't otherwise know our profiles.id.
      customData: { user_id: user.id },
      customer: user.email ? { email: user.email } : undefined,
      settings: {
        displayMode: "overlay",
        theme: "dark",
        successUrl: `${window.location.origin}/dashboard`,
      },
    });
  }, [state, priceId, loginNext, router, ensurePaddle]);

  return { state, act };
}
