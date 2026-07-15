"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { grantTool, revokeTool } from "@/actions/admin-users";
import { StatusPill } from "@/components/tools/status-pill";
import type { ToolAccessCell } from "@/lib/admin-users";
import { cn } from "@/lib/utils";

/**
 * The per-user tool access matrix (§8, "the important one"). Each row shows two
 * distinct things, kept separate on purpose:
 *
 *   - the TOGGLE = the explicit per-user grant (lever 2). Adding it inserts a
 *     user_tool_access row; the user can then open that tool no matter its
 *     access_type.
 *   - the PILL = the engine's verdict for this user (can_access_tool). It goes
 *     green the moment they can open the tool by ANY path — an explicit grant,
 *     OR their membership on a `members` tool (lever 1), OR public preview.
 *
 * So flipping a tool to access_type='members' (elsewhere) turns the pill green
 * for every member here without a single toggle, and ticking the toggle grants
 * exactly one tool to exactly this user. Both levers, visible side by side.
 */
function accessLabel(cell: ToolAccessCell, isAdmin: boolean) {
  if (!cell.canAccess) return { label: "no access", tone: "faint" as const };
  if (isAdmin) return { label: "admin", tone: "accent" as const };
  if (cell.hasGrant) return { label: "granted", tone: "live" as const };
  if (cell.access_type === "public_preview")
    return { label: "preview", tone: "live" as const };
  if (cell.access_type === "members")
    return { label: "member", tone: "live" as const };
  if (cell.access_type === "plan") return { label: "plan", tone: "live" as const };
  return { label: "access", tone: "live" as const };
}

function ToggleRow({
  userId,
  cell,
  isAdmin,
}: {
  userId: string;
  cell: ToolAccessCell;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();

  const toggle = () => {
    setError(false);
    startTransition(async () => {
      const res = cell.hasGrant
        ? await revokeTool(userId, cell.id)
        : await grantTool(userId, cell.id);
      if ("error" in res) setError(true);
      else router.refresh();
    });
  };

  const access = accessLabel(cell, isAdmin);

  return (
    <div className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-0">
      {/* The explicit-grant switch */}
      <button
        type="button"
        role="switch"
        aria-checked={cell.hasGrant}
        aria-label={`${cell.hasGrant ? "Revoke" : "Grant"} ${cell.name}`}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-pill transition-colors duration-micro ease-default disabled:opacity-50",
          cell.hasGrant ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-pill bg-canvas transition-transform duration-micro ease-default",
            cell.hasGrant ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-body text-text">{cell.name}</span>
          {cell.status !== "published" && (
            <span className="text-mono-chip rounded-pill bg-elevated px-2 py-0.5 text-text-faint">
              {cell.status}
            </span>
          )}
        </div>
        <p className="text-mono text-text-faint">
          {cell.slug} · {cell.access_type}
        </p>
      </div>

      {error && <span className="text-small text-danger">failed</span>}
      <StatusPill label={access.label} tone={access.tone} dot={false} />
    </div>
  );
}

export function AccessMatrix({
  userId,
  tools,
  isAdmin,
  suspended,
}: {
  userId: string;
  tools: ToolAccessCell[];
  isAdmin: boolean;
  suspended: boolean;
}) {
  return (
    <div>
      {suspended && (
        <div className="mb-3 rounded-sm border border-danger bg-danger-quiet px-3 py-2 text-small text-danger">
          This account is suspended, so the engine denies every tool regardless
          of grants below. Unsuspend to restore access.
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-line">
        {tools.map((cell) => (
          <ToggleRow key={cell.id} userId={userId} cell={cell} isAdmin={isAdmin} />
        ))}
      </div>
      <p className="mt-3 text-small text-text-muted">
        The switch is a per-user grant. The pill is what the access engine
        actually allows — it&apos;s green whenever this user can open the tool,
        whether through a grant, their membership, or an open preview.
      </p>
    </div>
  );
}
