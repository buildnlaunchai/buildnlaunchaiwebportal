"use client";

import { CloudOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * What a signed-in member sees when the auth service is not answering.
 *
 * ─── WHY THIS IS NOT THE ORDINARY ERROR SCREEN ──────────────────────────────
 *
 * The generic boundary says "something broke on my side… try again". True, and
 * useless here, because it leaves the two questions a person actually has
 * unanswered: am I logged out, and is it worth trying again?
 *
 * Both have real answers in this case. They are NOT logged out — nothing
 * happened to their account, we simply could not reach the service that
 * confirms it. And retrying genuinely can work, because this is usually a
 * minutes-long provider blip rather than something broken here.
 *
 * ─── THE COPY, CLAUSE BY CLAUSE ─────────────────────────────────────────────
 *
 * "You're still signed in" comes first because it is the fear. Somebody who has
 * just seen their dashboard vanish is wondering about their account before they
 * wonder about our uptime.
 *
 * "Nothing on your side" — DESIGN.md §12 says errors take the blame and don't
 * apologise. This one goes further than blame: it says whose problem it isn't,
 * which is the only sentence that stops a member re-entering a password or
 * clearing cookies to fix an outage they cannot fix.
 *
 * "usually clears in a few minutes" is a real expectation, not reassurance —
 * and it is what makes the button worth pressing.
 *
 * No exclamation marks, no "Oops". Same voice as everything else.
 */
export function AuthUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={CloudOff}
        // Real characters, not HTML entities. `title` and `description` are
        // string PROPS rendered as JSX children, so React escapes an entity
        // rather than decoding it — "&rsquo;" would reach the member as those
        // six characters. The credit top-up button shipped that exact bug on
        // 2026-08-28; entities only work as JSX text.
        title={"You\u2019re still signed in \u2014 I just can\u2019t reach the sign-in service"}
        description={
          "Nothing on your side is wrong, and nothing has happened to your account or your keys. " +
          "The service that confirms who you are isn\u2019t responding right now. " +
          "It usually clears in a few minutes."
        }
        action={
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
