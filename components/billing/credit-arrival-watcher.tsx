"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * After a top-up, Creem returns the buyer to /dashboard/credits?topup=1 — but the
 * credit is added ASYNCHRONOUSLY by the webhook, and the page must not show the
 * balance from before they paid.
 *
 * ─── WHY THIS NO LONGER WATCHES THE BALANCE ─────────────────────────────────
 *
 * The first version compared the live balance against the balance the server
 * rendered with, and waited for it to go up. On the first real purchase it never
 * did — because the webhook won the race. The ledger row was written at
 * 06:59:03.510 and the redirect landed after it, so the server already rendered
 * 50,000, `balanceBefore` was 50,000, and "is the balance above 50,000?" was
 * false forever. The banner sat there for the full 40-second timeout underneath
 * a balance that was already correct.
 *
 * That is not a tuning problem. "Higher than when this page rendered" cannot
 * answer "did my purchase land", because the page may have rendered after it
 * landed — and the faster the webhook, the more often it breaks. Reliably wrong
 * for the fastest, healthiest case.
 *
 * So the question changed to one with an answer: HAS A TOP-UP BEEN RECORDED
 * SINCE THIS CHECKOUT STARTED? The checkout stamps its own start time into the
 * success URL (`&t=`), and the ledger — which is append-only and carries a row
 * per purchase — is asked whether anything landed after it. Both orderings work,
 * and a second purchase minutes after the first is still its own event rather
 * than being mistaken for the first one.
 *
 * `landed` comes from the server, which has the ledger in hand already: when the
 * webhook won, the banner never renders at all rather than flashing for a tick.
 */
export function CreditArrivalWatcher({
  landed,
  since,
}: {
  /** The server already saw a top-up newer than `since`. Nothing to wait for. */
  landed: boolean;
  /** Epoch ms the checkout started, from the success URL. Null if absent. */
  since: number | null;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const justPaid = params.get("topup") === "1";
  const [done, setDone] = useState(false);
  const waiting = justPaid && !landed && !done;

  useEffect(() => {
    if (!justPaid) return;
    let live = true;
    const router_ = router;

    const finish = () => {
      if (!live) return;
      live = false;
      setDone(true);
      router_.replace("/dashboard/credits");
      router_.refresh();
    };

    // Already there when the page rendered: strip the flag and stop. No poll,
    // no banner, no 40-second wait under a correct balance.
    if (landed) {
      finish();
      return () => {
        live = false;
      };
    }

    const supabase = createClient();
    let tries = 0;
    const cutoff = new Date(since ?? Date.now() - 10 * 60 * 1000).toISOString();

    const tick = async () => {
      if (!live) return;
      tries += 1;
      // RLS scopes this to the caller's own rows; there is no filter to get wrong.
      const { data } = await supabase
        .from("credit_ledger")
        .select("id")
        .eq("kind", "topup")
        .gt("created_at", cutoff)
        .limit(1);

      // Give up after ~40s and refresh anyway. A delayed webhook is not an
      // error, and the page is correct either way once it re-renders — the
      // spinner is about not showing a stale number, not about the outcome.
      if ((data?.length ?? 0) > 0 || tries >= 20) {
        finish();
        return;
      }
      window.setTimeout(tick, 2000);
    };
    void tick();

    return () => {
      live = false;
    };
  }, [justPaid, router, landed, since]);

  if (!waiting) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[color:rgba(200,242,79,0.3)] bg-accent-quiet px-4 py-3 text-small text-text">
      <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-accent" />
      <span>
        <span className="font-medium">Adding your credits…</span> this takes a few
        seconds — your balance will update on its own.
      </span>
    </div>
  );
}
