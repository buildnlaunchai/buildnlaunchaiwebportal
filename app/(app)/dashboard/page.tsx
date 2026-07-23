import { LayoutGrid, Rocket } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SubscribeButton } from "@/components/billing/subscribe-button";
import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { requireUser } from "@/lib/access";
import { getSubscribePriceId } from "@/lib/billing";
import { getMyKeyStatusByProvider } from "@/lib/keys";
import { getMyAccessibleTools, getMyMembership, isMembershipActive } from "@/lib/member";

/**
 * The Apps section (§8). The empty state is one of the most important screens in
 * the product (DESIGN.md §12): a signed-in non-member has to be sold and
 * converted with no data at all. With the paid model it branches on membership,
 * not applications:
 *   - has accessible tools → the unlocked grid (a non-member still sees previews)
 *   - active member, nothing unlocked yet → gentle orientation
 *   - signed in, no membership → the Subscribe moment
 */

/** The dashboard empty state gets vertical presence — it's the whole funnel. */
function CenteredEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">{children}</div>
  );
}

/**
 * The Apps index streams behind an in-page Suspense so the grid skeleton shows
 * while the queries resolve. This boundary wraps ONLY this page's content — NOT a
 * route-level `loading.tsx`, which would put a Suspense over every nested
 * dashboard route and flush a 200 before a descendant's `notFound()` could set a
 * 404. The runner's access gate (§13) depends on that 404, so loading state here
 * lives in the page, not the segment.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<CardGridSkeleton />}>
      <Apps />
    </Suspense>
  );
}

async function Apps() {
  const user = await requireUser("/dashboard");

  const [tools, membership, keyStatuses, priceId] = await Promise.all([
    getMyAccessibleTools(),
    getMyMembership(),
    getMyKeyStatusByProvider(),
    getSubscribePriceId(),
  ]);

  // "Full access" for display = an active membership OR admin. Admins reach every
  // tool through the access engine with no membership row, so they must never see
  // the subscribe upsell or "Subscribe to unlock the rest."
  const hasFullAccess =
    isMembershipActive(membership) || user.profile.role === "admin";

  // Has tools → show them. This covers members AND non-members who can run the
  // public_preview tools (the funnel: run something before you ever pay).
  if (tools.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-small text-text-muted">
          {hasFullAccess
            ? `${tools.length} ${tools.length === 1 ? "tool" : "tools"} unlocked.`
            : "Open to everyone — no key needed. Subscribe to unlock the rest."}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard
              key={tool.slug}
              tool={tool}
              variant="unlocked"
              keyStatuses={keyStatuses}
            />
          ))}
        </div>
        {!hasFullAccess && (
          <Panel className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <p className="text-small text-text-muted">
              Want the full catalog? $10/month, cancel anytime — you bring your
              own keys.
            </p>
            <SubscribeButton
              priceId={priceId}
              variant="secondary"
              size="sm"
              className="shrink-0"
            />
          </Panel>
        )}
      </div>
    );
  }

  // No accessible tools yet. An active member (or admin) is just early.
  if (hasFullAccess) {
    return (
      <CenteredEmpty>
        <EmptyState
          icon={Rocket}
          title="You're in"
          description="Tools show up here as I open them to members. The first ones are on the way."
          action={
            <Link href="/tools">
              <Button variant="secondary">See what&apos;s coming</Button>
            </Link>
          }
        />
      </CenteredEmpty>
    );
  }

  // Signed in, no membership — the conversion moment.
  return (
    <CenteredEmpty>
      <EmptyState
        icon={LayoutGrid}
        title="Unlock the tools"
        description="Membership is $10/month. Bring your own API keys, run every tool in the catalog, and cancel anytime."
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SubscribeButton priceId={priceId} />
            <Link href="/tools">
              <Button variant="secondary">Browse the tools</Button>
            </Link>
          </div>
        }
      />
    </CenteredEmpty>
  );
}
