"use client";

import { TriangleAlert } from "lucide-react";

import { ServiceUnavailable } from "@/components/ui/service-unavailable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * ─── WHY THIS SITS AT THE ROUTE GROUP AND NOT ON THE SEGMENT ────────────────
 *
 * It used to live at (app)/dashboard/ — one level down — and the black-hole
 * test showed it never ran. An error.tsx catches errors thrown by its segment's
 * PAGE and its CHILDREN. It does not catch its own layout, because the layout
 * is what renders the boundary: by the time the layout throws there is nothing
 * left to render the fallback into.
 *
 * And the layout is exactly what throws here. dashboard/layout.tsx calls
 * requireUser() before anything else, so with the auth server unreachable every
 * dashboard route returned a bare 500 in ~6s — no screen, no retry, none of the
 * copy below. Moving the boundary up one segment is what makes it reachable.
 *
 * Verified, not reasoned: MODE A of the black-hole test is what caught it, and
 * is what has to stay green.
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
