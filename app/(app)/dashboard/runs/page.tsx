import { History } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/tools/status-pill";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex max-w-[400px] flex-col items-center text-center">
          <History aria-hidden className="size-6 text-text-faint" strokeWidth={1.5} />
          <h2 className="text-h3 mt-5">No runs yet</h2>
          <p className="mt-2 text-small text-text-muted">
            Every tool you run is saved here — inputs, outputs, and the exact time
            it took.
          </p>
          <Link href="/dashboard" className="mt-6">
            <Button variant="primary">Pick a tool</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-line">
      {runs.map((run) => (
        <Link
          key={run.id}
          href={`/dashboard/runs/${run.id}`}
          className="flex items-center gap-4 border-b border-line px-5 py-4 transition-colors duration-micro ease-default last:border-0 hover:bg-elevated"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line text-text-muted">
            <ToolIcon name={run.tools?.icon ?? null} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-text">{run.tools?.name ?? "—"}</p>
            <p className="text-mono text-text-faint">
              {formatShipDate(run.created_at)}
              {run.duration_ms ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ""}
            </p>
          </div>
          <StatusPill {...PILL[run.status]} dot={false} />
        </Link>
      ))}
    </div>
  );
}
