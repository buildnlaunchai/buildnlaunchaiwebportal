import { LayoutGrid } from "lucide-react";
import Link from "next/link";

import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
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
// Hoisted: defining a component inside render recreates it every pass.
function EmptyFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-[400px] flex-col items-center text-center">
        <LayoutGrid aria-hidden className="size-6 text-text-faint" strokeWidth={1.5} />
        {children}
      </div>
    </div>
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
        <div>
          <p className="text-small text-text-muted">
            {active
              ? `${tools.length} ${tools.length === 1 ? "tool" : "tools"} unlocked.`
              : "Open to everyone — no key needed. Apply to unlock the rest."}
          </p>
        </div>
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
          <div className="rounded-md border border-line bg-surface p-5">
            <p className="text-small text-text-muted">
              Want the full catalog? {application?.status === "pending" ? (
                <>Your application is in review.</>
              ) : (
                <Link href="/apply" className="text-accent hover:text-accent-hover">
                  Apply for access →
                </Link>
              )}
            </p>
          </div>
        )}
      </div>
    );
  }

  // No accessible tools. Orient by application state (§12 voice).
  if (application?.status === "pending") {
    return (
      <EmptyFrame>
        <h2 className="text-h3 mt-5">You&apos;re in the queue</h2>
        <p className="mt-2 text-small text-text-muted">
          Applied {formatShipDate(application.created_at)}. I review these
          personally, usually within a day. You&apos;ll get an email the moment I
          do.
        </p>
        <Link href="/tools" className="mt-6">
          <Button variant="secondary">Browse the tools</Button>
        </Link>
      </EmptyFrame>
    );
  }

  if (application?.status === "approved" || isMembershipActive(membership)) {
    // Approved, but no tools resolved yet (e.g. no member-access tools exist).
    return (
      <EmptyFrame>
        <h2 className="text-h3 mt-5">You&apos;re in</h2>
        <p className="mt-2 text-small text-text-muted">
          Tools show up here as I open them to members. The first ones are on the
          way.
        </p>
        <Link href="/tools" className="mt-6">
          <Button variant="secondary">See what&apos;s coming</Button>
        </Link>
      </EmptyFrame>
    );
  }

  // Never applied (or waitlisted/rejected) and nothing accessible.
  return (
    <EmptyFrame>
      <h2 className="text-h3 mt-5">Nothing here yet</h2>
      <p className="mt-2 text-small text-text-muted">
        Tools unlock when your application is approved. It usually takes a day.
      </p>
      <Link href="/apply" className="mt-6">
        <Button variant="primary">Apply for access</Button>
      </Link>
    </EmptyFrame>
  );
}
