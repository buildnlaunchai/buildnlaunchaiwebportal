"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setRequestStatus } from "@/actions/requests";
import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { RequestWithTool } from "@/lib/requests";

type Row = RequestWithTool & { requesterEmail: string | null };
type Option = { id: string; name: string };

const STATUSES = ["open", "planned", "building", "shipped", "declined"] as const;

const TONE = {
  open: "faint",
  planned: "warn",
  building: "accent",
  shipped: "live",
  declined: "faint",
} as const;

export function RequestsManager({
  initial,
  tools,
}: {
  initial: Row[];
  tools: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Per-row draft of the tool to link when shipping.
  const [linkTool, setLinkTool] = useState<Record<string, string>>({});

  const apply = (id: string, status: (typeof STATUSES)[number]) => {
    setError(null);
    const shippedToolId = status === "shipped" ? linkTool[id] : undefined;
    if (status === "shipped" && !shippedToolId) {
      setError("Pick the tool that shipped this request first.");
      return;
    }
    startTransition(async () => {
      const res = await setRequestStatus(id, status, shippedToolId);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-small text-danger">{error}</p>}
      {initial.length === 0 ? (
        <p className="text-small text-text-faint">No requests yet.</p>
      ) : (
        initial.map((r) => (
          <div key={r.id} className="rounded-md border border-line bg-surface p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-fit flex-col items-center rounded-sm border border-line px-3 py-2">
                <span className="tabular text-body-strong text-text">{r.vote_count}</span>
                <span className="text-mono-chip text-text-faint">votes</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-strong text-text">{r.title}</span>
                  <StatusPill label={r.status} tone={TONE[r.status as keyof typeof TONE] ?? "faint"} dot={false} />
                </div>
                {r.body && <p className="mt-1 text-small text-text-muted">{r.body}</p>}
                <p className="text-mono mt-1 text-text-faint">{r.requesterEmail ?? "—"}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {STATUSES.filter((s) => s !== "shipped").map((s) => (
                <Button
                  key={s}
                  variant={r.status === s ? "primary" : "secondary"}
                  size="sm"
                  pending={pending}
                  onClick={() => apply(r.id, s)}
                >
                  {s}
                </Button>
              ))}

              {/* Ship: pick the tool, then mark shipped → notifies requester + upvoters */}
              <div className="ml-auto flex items-center gap-2">
                <Select
                  value={linkTool[r.id] ?? r.shipped_tool_id ?? ""}
                  onChange={(e) => setLinkTool((m) => ({ ...m, [r.id]: e.target.value }))}
                  className="w-44"
                >
                  <option value="">Link a tool…</option>
                  {tools.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
                <Button variant="primary" size="sm" pending={pending} onClick={() => apply(r.id, "shipped")}>
                  Mark shipped
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
