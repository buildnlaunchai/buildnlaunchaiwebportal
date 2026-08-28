"use client";

import { TriangleAlert } from "lucide-react";

import { ServiceUnavailable } from "@/components/ui/service-unavailable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * ─── TWO BOUNDARIES, AND THEY CATCH DIFFERENT THINGS ────────────────────────
 *
 * This one is INSIDE the dashboard layout, so an error in a page renders here
 * with the shell — sidebar, nav, the member's name — still around it. That is
 * the right frame for "this page broke": nothing about their session did.
 *
 * It cannot catch the layout itself. A boundary is rendered BY the layout it
 * sits under, so once that layout throws there is nothing left to render it
 * into — which is exactly the auth-outage case, where dashboard/layout.tsx
 * calls requireUser() before anything else. app/error.tsx catches that one, at
 * the cost of replacing the shell too.
 *
 * The black-hole test spent four rounds establishing which boundary catches
 * what; both exist because both jobs are real. See app/error.tsx.
 */
/**
 * The dashboard error boundary (§12 voice): takes the blame, says what to do,
 * doesn't apologize or exclaim. `reset()` re-renders the segment.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Next strips server error messages in production and forwards only the
  // digest, so this is the only thing that survives to tell the two failures
  // apart: "we could not reach something we depend on" and "something else
  // broke". They need different words — see ServiceUnavailable and lib/access.ts.
  if (error.digest === "BACKEND_UNAVAILABLE") {
    return <ServiceUnavailable onRetry={reset} />;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={TriangleAlert}
        title="Something broke on my side"
        description="This page hit an error I didn't plan for — nothing you did caused it. Try again, and if it keeps happening it's on me to fix."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
