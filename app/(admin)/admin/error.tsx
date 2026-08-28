"use client";

import { TriangleAlert } from "lucide-react";

import { AuthUnavailable } from "@/components/ui/auth-unavailable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Next strips server error messages in production and forwards only the
  // digest, so this is the only thing that survives to tell the two failures
  // apart: "we could not reach the auth service" and "something else broke".
  // They need different words — see AuthUnavailable and lib/access.ts.
  if (error.digest === "AUTH_UNAVAILABLE") {
    return <AuthUnavailable onRetry={reset} />;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={TriangleAlert}
        title="Something broke on my side"
        description="This admin page hit an error I didn't plan for. Try again, and if it keeps happening the details are in the logs."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
