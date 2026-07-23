"use client";

import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

import { useIsActiveMember } from "@/components/billing/use-is-member";

/**
 * The hero's primary CTA. Resolves the session in the browser (the landing page
 * stays static): an active member gets "Visit dashboard" → the app; everyone else
 * gets "Subscribe — $10/mo" → the pricing page, where the checkout overlay lives.
 * Custom-styled, so it uses the lightweight member hook directly.
 */
export function HeroCta() {
  const isMember = useIsActiveMember();

  const primary =
    "inline-flex cursor-pointer items-center gap-2 rounded-[14px] bg-accent px-6 py-3.5 text-body-strong font-semibold text-accent-text shadow-[0_0_36px_-10px_rgba(200,242,79,0.7)] transition-colors duration-micro ease-default hover:bg-accent-hover";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href={isMember ? "/dashboard" : "/pricing"} className={primary}>
        <Zap aria-hidden className="size-[18px]" strokeWidth={2} fill="currentColor" />
        {isMember ? "Visit dashboard" : "Subscribe — $10/mo"}
      </Link>
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
