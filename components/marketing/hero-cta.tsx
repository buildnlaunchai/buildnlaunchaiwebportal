"use client";

import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

import { useSubscribe } from "@/components/billing/use-subscribe";

/**
 * The hero's primary CTA. Resolves the session in the browser (the landing page
 * stays static): a member who's already active gets "Visit dashboard"; everyone
 * else gets "Subscribe — $10/mo", which opens Paddle's overlay (or sends a
 * signed-out visitor to log in first). Custom-styled, so it drives the shared
 * useSubscribe hook directly rather than the SubscribeButton wrapper.
 */
export function HeroCta({ priceId }: { priceId: string | null }) {
  const { state, act } = useSubscribe(priceId);

  const primary =
    "inline-flex cursor-pointer items-center gap-2 rounded-[14px] bg-accent px-6 py-3.5 text-body-strong font-semibold text-accent-text shadow-[0_0_36px_-10px_rgba(200,242,79,0.7)] transition-colors duration-micro ease-default hover:bg-accent-hover";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void act()} className={primary}>
        <Zap aria-hidden className="size-[18px]" strokeWidth={2} fill="currentColor" />
        {state === "member" ? "Visit dashboard" : "Subscribe — $10/mo"}
      </button>
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 rounded-[14px] border border-line-strong bg-surface/50 px-6 py-3.5 text-body-strong text-text backdrop-blur transition-colors duration-micro ease-default hover:bg-elevated"
      >
        Browse the tools
        <ArrowRight aria-hidden className="size-4" strokeWidth={1.8} />
      </Link>
    </div>
  );
}
