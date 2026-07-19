import { Clock, LayoutGrid, Rocket } from "lucide-react";
import Link from "next/link";

import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { requireUser } from "@/lib/access";
import { getMyLatestApplication } from "@/lib/applications";
import { getMyKeyStatusByProvider } from "@/lib/keys";
import { getMyAccessibleTools, getMyMembership, isMembershipActive } from "@/lib/member";
import { formatShipDate } from "@/lib/format";

/**
 * The Apps section (§8). The empty state is one of the most important screens in
 * the product (DESIGN.md §12): a new signup has to be sold, oriented, and
 * converted with no data at all. So this branches on where the user actually is:
 *   - has accessible tools → the unlocked grid
 *   - applied, still pending → the queue state
 *   - approved but nothing accessible yet → gentle orientation
 *   - never applied → the apply CTA
 */

/** The dashboard empty state gets vertical presence — it's the whole funnel. */
function CenteredEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">{children}</div>
  );
}

export default async function DashboardPage() {
  await requireUser("/dashboard");

  const [tools, membership, application, keyStatuses] = await Promise.all([
    getMyAccessibleTools(),
    getMyMembership(),
    getMyLatestApplication(),
    getMyKeyStatusByProvider(),
  ]);

  // Has tools → show them. This covers members AND applicants who can run the
  // public_preview tools (the funnel: run something before you ever apply).
  if (tools.length > 0) {
    const active = isMembershipActive(membership);
    return (
      <div className="flex flex-col gap-6">
        <p className="text-small text-text-muted">
          {active
            ? `${tools.length} ${tools.length === 1 ? "tool" : "tools"} unlocked.`
            : "Open to everyone — no key needed. Apply to unlock the rest."}
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
        {!active && (
          <Panel className="flex items-center justify-between gap-4">
            <p className="text-small text-text-muted">
              Want the full catalog?{" "}
              {application?.status === "pending"
                ? "Your application is in review."
                : "Access is free while I build in public."}
            </p>
            {application?.status !== "pending" && (
              <Link href="/apply" className="shrink-0">
                <Button variant="secondary" size="sm">
                  Apply for access
                </Button>
              </Link>
            )}
          </Panel>
        )}
      </div>
    );
  }

  // No accessible tools. Orient by application state (§12 voice).
  if (application?.status === "pending") {
    return (
      <CenteredEmpty>
        <EmptyState
          icon={Clock}
          title="You're in the queue"
          description={`Applied ${formatShipDate(
            application.created_at,
          )}. I review these personally, usually within a day. You'll get an email the moment I do.`}
          action={
            <Link href="/tools">
              <Button variant="secondary">Browse the tools</Button>
            </Link>
          }
        />
      </CenteredEmpty>
    );
  }

  if (application?.status === "approved" || isMembershipActive(membership)) {
    // Approved, but no tools resolved yet (e.g. no member-access tools exist).
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

  // Never applied (or waitlisted/rejected) and nothing accessible.
  return (
    <CenteredEmpty>
      <EmptyState
        icon={LayoutGrid}
        title="Nothing here yet"
        description="Tools unlock when your application is approved. It usually takes a day."
        action={
          <Link href="/apply">
            <Button variant="primary">Apply for access</Button>
          </Link>
        }
      />
    </CenteredEmpty>
  );
}
