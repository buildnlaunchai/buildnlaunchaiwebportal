"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * After a top-up, Creem returns the buyer to /dashboard/credits?topup=1 — but the
 * credit is added ASYNCHRONOUSLY by the webhook, seconds after the redirect.
 *
 * Without this, the page renders the balance the buyer had BEFORE paying. That is
 * the single worst screen this feature could produce: someone has just paid and
 * is looking at proof that nothing happened. The membership flow has the same
 * hazard and the same answer — see MembershipActivationWatcher, which this
 * follows deliberately rather than inventing a second pattern.
 *
 * It watches the buyer's own balance for ANY increase, rather than for a
 * specific figure, because the page does not know which package was bought and
 * should not be told: the amount is the webhook's business and the buyer's, not
 * a number to thread through a query string where it could be edited.
 */
export function CreditArrivalWatcher({ balanceBefore }: { balanceBefore: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const justPaid = params.get("topup") === "1";
  const [done, setDone] = useState(false);
  const waiting = justPaid && !done;

  useEffect(() => {
    if (!justPaid) return;
    let live = true;
    const supabase = createClient();
    let tries = 0;

    const finish = () => {
      if (!live) return;
      live = false;
      setDone(true);
      router.replace("/dashboard/credits");
      router.refresh();
    };

    const tick = async () => {
      if (!live) return;
      tries += 1;
      // RLS scopes this to the caller's own row; there is no filter to get wrong.
      const { data } = await supabase
        .from("credit_balances")
        .select("balance")
        .maybeSingle();

      // Give up after ~40s and refresh anyway. A delayed webhook is not an
      // error, and the page is correct either way once it re-renders — the
      // spinner is about not showing a stale number, not about the outcome.
      if ((data?.balance ?? 0) > balanceBefore || tries >= 20) {
        finish();
        return;
      }
      window.setTimeout(tick, 2000);
    };
    void tick();

    return () => {
      live = false;
    };
  }, [justPaid, router, balanceBefore]);

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
