import { History } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/tools/status-pill";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { requireUser } from "@/lib/access";
import { formatShipDate } from "@/lib/format";
import { getMyRuns } from "@/lib/runs";

const PILL = {
  queued: { label: "queued", tone: "faint" as const },
  running: { label: "running", tone: "accent" as const },
  success: { label: "done", tone: "live" as const },
  error: { label: "failed", tone: "danger" as const },
  timeout: { label: "timeout", tone: "danger" as const },
};

export default async function RunsPage() {
  await requireUser("/dashboard/runs");
  const runs = await getMyRuns();

  if (runs.length === 0) {
    return (
      <div className="flex min-h-[62vh] items-center justify-center">
        <EmptyState
          icon={History}
          title="No runs yet"
          description="Every tool you run is saved here — inputs, outputs, and the exact time it took."
          action={
            <Link href="/dashboard">
              <Button variant="primary">Pick a tool</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-small text-text-muted">
        {runs.length} {runs.length === 1 ? "run" : "runs"}. Files are kept for 30
        days; everything else is kept forever.
      </p>
      <Panel flush>
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/dashboard/runs/${run.id}`}
            className="flex items-center gap-4 border-b border-line px-5 py-4 transition-colors duration-micro ease-default last:border-0 hover:bg-elevated"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
              <ToolIcon name={run.tools?.icon ?? null} className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-strong text-text">
                {run.tools?.name ?? "—"}
              </p>
              <p className="text-mono text-text-faint tabular">
                {formatShipDate(run.created_at)}
                {run.duration_ms
                  ? ` · ${(run.duration_ms / 1000).toFixed(1)}s`
                  : ""}
              </p>
            </div>
            <StatusPill {...PILL[run.status]} dot={false} />
          </Link>
        ))}
      </Panel>
    </div>
  );
}
