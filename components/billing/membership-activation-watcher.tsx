"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * After a Paddle checkout, Paddle returns the buyer to /dashboard?checkout=1 —
 * but the membership is activated ASYNCHRONOUSLY by the webhook, which can land a
 * few seconds after the redirect. Without this, the dashboard renders the
 * pre-payment ("Applicant") state and never updates until a manual reload — the
 * exact bug a paying customer must never see.
 *
 * This watches the buyer's own membership row; the moment it goes active it
 * strips the flag and router.refresh()es, re-running the server components (the
 * sidebar badge in the layout + the page) with the new membership.
 *
 * Poll, not Realtime: `memberships` isn't in the Realtime publication (only
 * tool_runs / notifications are), and adding it needs a migration. A short poll
 * on this one narrow, opt-in path is simpler and needs no schema change.
 */
export function MembershipActivationWatcher() {
  const params = useSearchParams();
  const router = useRouter();
  const justCheckedOut = params.get("checkout") === "1";
  // Derived, not set in the effect: the banner shows while we're on the
  // ?checkout=1 URL and haven't finished resolving the membership yet.
  const [done, setDone] = useState(false);
  const waiting = justCheckedOut && !done;

  useEffect(() => {
    if (!justCheckedOut) return;
    let live = true;
    const supabase = createClient();
    let tries = 0;

    const finish = () => {
      if (!live) return;
      live = false;
      setDone(true); // inside a callback, not the effect body — compiler-safe
      router.replace("/dashboard"); // drop ?checkout=1
      router.refresh(); // re-fetch server components with the fresh membership
    };

    const tick = async () => {
      if (!live) return;
      tries += 1;
      const { data } = await supabase
        .from("memberships")
        .select("status, expires_at")
        .maybeSingle();
      const active =
        !!data &&
        (data.status === "active" || data.status === "trialing") &&
        (data.expires_at === null || new Date(data.expires_at) > new Date());

      // Stop when active, or give up after ~40s and refresh anyway (the webhook
      // may be delayed; the normal state is still correct on the refreshed load).
      if (active || tries >= 20) {
        finish();
        return;
      }
      window.setTimeout(tick, 2000);
    };
    void tick();

    return () => {
      live = false;
    };
  }, [justCheckedOut, router]);

  if (!waiting) return null;

  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-[color:rgba(200,242,79,0.3)] bg-accent-quiet px-4 py-3 text-small text-text">
      <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-accent" />
      <span>
        <span className="font-medium">Activating your membership…</span> this
        takes a few seconds — your tools will appear automatically.
      </span>
    </div>
  );
}
