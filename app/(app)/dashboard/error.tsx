"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The dashboard error boundary (§12 voice): takes the blame, says what to do,
 * doesn't apologize or exclaim. `reset()` re-renders the segment.
 */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
