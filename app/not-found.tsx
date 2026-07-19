import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The global 404 — reached outside the app shell, so it stands on its own like
 * the suspended screen. Neutral copy: some of these are access denials the
 * access engine 404s on purpose (§13), and the page must not hint which.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-line bg-surface text-text-faint [border-top-color:var(--line-strong)]">
        <Compass aria-hidden className="size-6" strokeWidth={1.5} />
      </span>
      <h1 className="text-h1 mt-5">Page not found</h1>
      <p className="mt-2 max-w-[420px] text-small text-text-muted">
        This page doesn&apos;t exist, or it&apos;s moved.
      </p>
      <Link href="/" className="mt-6">
        <Button variant="secondary">Back to home</Button>
      </Link>
    </main>
  );
}
