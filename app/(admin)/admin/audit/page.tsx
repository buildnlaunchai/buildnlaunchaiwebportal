import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { requireAdmin } from "@/lib/access";
import { getAuditLogs } from "@/lib/admin-audit";
import { formatShipDate } from "@/lib/format";

/** Turn 'application.approve' into 'application · approve' for a calmer read. */
function actionLabel(action: string) {
  return action.replace(/\./g, " · ");
}

export default async function AuditPage() {
  await requireAdmin();
  const logs = await getAuditLogs();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-small text-text-muted prose-measure">
        Every admin action, newest first — approvals, grants, revocations, tool
        changes. The record of what happened, and who did it.
      </p>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No activity yet"
          description="Admin actions are logged here the moment you start reviewing applications and granting access."
        />
      ) : (
        <Panel flush>
          {logs.map((log) => {
            const actor = log.actor?.full_name ?? log.actor?.email ?? "system";
            const target = log.target?.full_name ?? log.target?.email ?? null;
            return (
              <div
                key={log.id}
                className="flex items-start gap-4 border-b border-line px-5 py-4 last:border-0"
              >
                <span className="text-mono-chip mt-0.5 shrink-0 rounded-pill bg-elevated px-2.5 py-1 text-text-muted">
                  {actionLabel(log.action)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-small text-text">
                    <span className="text-text-muted">by</span> {actor}
                    {target && (
                      <>
                        {" "}
                        <span className="text-text-muted">→</span> {target}
                      </>
                    )}
                  </p>
                  <p className="text-mono text-text-faint tabular">
                    {log.entity_type ? `${log.entity_type} · ` : ""}
                    {formatShipDate(log.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </Panel>
      )}
    </div>
  );
}
