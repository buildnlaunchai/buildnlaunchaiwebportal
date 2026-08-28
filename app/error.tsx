"use client";

import { TriangleAlert } from "lucide-react";

import { ServiceUnavailable } from "@/components/ui/service-unavailable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The boundary that actually catches, placed where the payload said to put it.
 *
 * ─── THREE WRONG GUESSES BEFORE THIS ONE ────────────────────────────────────
 *
 * The black-hole test kept returning a bare 500 where ServiceUnavailable should
 * have been, and each fix was reasoned from Next's documented semantics rather
 * than from what the response actually contained:
 *
 *   1. error.tsx inside dashboard/ — cannot catch its own layout. Moved up.
 *   2. error.tsx at (app)/ — still nothing.
 *   3. a pass-through layout at (app)/ to make the group a real segment — still
 *      nothing.
 *
 * Then the RSC payload, which had been saying it all along:
 *
 *     "children","error":"$undefined","errorStyles":"$undefined"
 *
 * That is the ROOT layout's children slot, and it is where the throw lands. A
 * route group is erased from the segment tree, so an error.tsx beside a group's
 * layout never becomes the boundary for that slot. app/error.tsx does, because
 * the slot belongs to app/layout.tsx.
 *
 * The same payload also settled a question worth recording: the digest DOES
 * survive Next's production error stripping —
 *
 *     8:E{"digest":"BACKEND_UNAVAILABLE"}
 *
 * so branching on it is sound, and it was only ever the mounting that was wrong.
 *
 * ─── WHY IT IS SAFE TO PUT THIS AT THE ROOT ─────────────────────────────────
 *
 * It now covers marketing routes too, which previously had no boundary at all —
 * they would have shown Next's default 500 page. That is an improvement, not a
 * side effect to apologise for. The generic branch takes the same words the
 * dashboard boundary used, so nothing about the ordinary case changes.
 */
export default function RootError({
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
