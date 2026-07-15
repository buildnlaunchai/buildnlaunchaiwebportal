import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Application received — Build & Launch AI",
  robots: { index: false },
};

/**
 * Confirmation after a submit. §12 voice: no exclamation marks, say what happens
 * next. Kept intentionally simple — the honest thing to promise is "I'll email
 * you", not an invented queue position.
 */
export default function ApplyThanksPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[640px] flex-col items-center justify-center px-5 text-center">
      <CheckCircle2 aria-hidden className="size-7 text-live" strokeWidth={1.5} />
      <h1 className="text-h1 mt-6">I&apos;ve got it</h1>
      <p className="prose-measure mt-3 text-body text-text-muted">
        Thanks for the detail — it genuinely helps me decide what to build next. I
        review applications personally, usually within a day, and you&apos;ll get
        an email the moment I do.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/dashboard">
          <Button variant="primary">Go to your dashboard</Button>
        </Link>
        <Link href="/tools">
          <Button variant="secondary">Browse the tools</Button>
        </Link>
      </div>
    </div>
  );
}
