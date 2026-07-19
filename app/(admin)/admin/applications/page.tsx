import { Inbox } from "lucide-react";
import Link from "next/link";

import { ApplicationRow } from "@/components/admin/application-row";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdmin } from "@/lib/access";
import {
  getApplicationCounts,
  getApplicationsForAdmin,
  type ApplicationStatus,
} from "@/lib/applications";
import { cn } from "@/lib/utils";

const TABS: { value: ApplicationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "rejected", label: "Rejected" },
];

function isStatus(v: string | undefined): v is ApplicationStatus {
  return v === "pending" || v === "approved" || v === "waitlisted" || v === "rejected";
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // The first of the admin gates in this section (§13). The layout guards too;
  // the page re-checks because a layout guard is not a page guard.
  await requireAdmin();

  const { status } = await searchParams;
  // Default view is the pending queue — the thing that actually needs action.
  const active: ApplicationStatus = isStatus(status) ? status : "pending";

  const [applications, counts] = await Promise.all([
    getApplicationsForAdmin(active),
    getApplicationCounts(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filter tabs (§9 tag filters as pills) */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const on = tab.value === active;
          return (
            <Link
              key={tab.value}
              href={`/admin/applications?status=${tab.value}`}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-small transition-colors duration-micro ease-default",
                on
                  ? "border-accent bg-accent-quiet text-accent"
                  : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-text",
              )}
            >
              {tab.label}
              <span className="tabular text-mono-chip text-text-faint">
                {counts[tab.value]}
              </span>
            </Link>
          );
        })}
      </div>

      {applications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={active === "pending" ? "Nothing to review" : `No ${active} applications`}
          description={
            active === "pending"
              ? "New applications land here the moment they're submitted."
              : "Applications you mark will show up under their status."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {applications.map((a) => (
            <ApplicationRow key={a.id} application={a} />
          ))}
        </div>
      )}
    </div>
  );
}
