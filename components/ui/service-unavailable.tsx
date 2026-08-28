"use client";

import { CloudOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * What a signed-in member sees when something this page depends on is not
 * answering.
 *
 * ─── WHY ONE SCREEN AND NOT TWO ─────────────────────────────────────────────
 *
 * It was called AuthUnavailable and said "I can't reach the sign-in service".
 * Then the black-hole test ran the other failure — auth healthy, database dead —
 * and this screen appeared anyway, telling the member the sign-in service was
 * down when sign-in was fine.
 *
 * That is not a copy slip, it is a limit on what the code can know. getUser()
 * wraps the auth call AND the profile read in one deadline, so from the throw
 * site a database outage and an auth outage are the same event. Two screens
 * would need a distinction that is not reliably available, which means one of
 * them would sometimes be a confident lie.
 *
 * And the member does the same thing either way: wait, retry. There is nothing
 * for the extra precision to buy, and something for it to cost. So there is one
 * screen, and its words are true in both cases — it names no subsystem, because
 * naming one is exactly the part we cannot get right.
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
 * wonder about our uptime. It is also true in both failures: in one we cannot
 * verify the session, in the other the session is fine and the data is not —
 * and in neither has anything happened to the account.
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
export function ServiceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={CloudOff}
        // Real characters, not HTML entities. `title` and `description` are
        // string PROPS rendered as JSX children, so React escapes an entity
        // rather than decoding it — "&rsquo;" would reach the member as those
        // six characters. The credit top-up button shipped that exact bug on
        // 2026-08-28; entities only work as JSX text.
        title={"You\u2019re still signed in \u2014 I just can\u2019t load this page"}
        description={
          "Nothing on your side is wrong, and nothing has happened to your account, your keys or your credits. " +
          "Something this page depends on isn\u2019t responding right now. " +
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
