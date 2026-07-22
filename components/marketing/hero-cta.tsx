"use client";

import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * The hero's primary CTA. Resolves the session in the browser (the landing page
 * stays static): a signed-in user — who already has a dashboard / access to the
 * library — gets "Visit dashboard" instead of "Apply for access".
 */
export function HeroCta() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active && data.user) setLoggedIn(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const primary =
    "inline-flex items-center gap-2 rounded-[14px] bg-accent px-6 py-3.5 text-body-strong font-semibold text-accent-text shadow-[0_0_36px_-10px_rgba(200,242,79,0.7)] transition-colors duration-micro ease-default hover:bg-accent-hover";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {loggedIn ? (
        <Link href="/dashboard" className={primary}>
          <Zap aria-hidden className="size-[18px]" strokeWidth={2} fill="currentColor" />
          Visit dashboard
        </Link>
      ) : (
        <Link href="/apply" className={primary}>
          <Zap aria-hidden className="size-[18px]" strokeWidth={2} fill="currentColor" />
          Apply for access
        </Link>
      )}
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
