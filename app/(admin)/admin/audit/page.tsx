import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { requireAdmin } from "@/lib/access";
import { getAuditLogs } from "@/lib/admin-audit";
import { formatShipDate } from "@/lib/format";

/** Turn 'application.approve' into 'application \u00b7 approve' for a calmer read. */
function actionLabel(action: string) {
  return action.replace(/\./g, " \u00b7 ");
}

/**
 * What a stored value MEANS, for the actions where the raw value is not the
 * word a person would use.
 *
 * Only `credit.mode_override` needs it so far, and it needs it badly: a tri-state
 * whose values are `true`, `false` and `null`, where null is not "missing" but a
 * third real setting. "null \u2192 true" is technically the record and tells an
 * admin nothing; "follows the switch \u2192 always on" is the same fact in the
 * words the buttons use.
 *
 * Deliberately a small dictionary rather than a general rule. Booleans mean
 * different things in different actions, and a renderer that guessed would
 * eventually be confidently wrong about one.
 */
const VALUE_WORDS: Record<string, Record<string, string>> = {
  "credit.mode_override": {
    true: "always on",
    false: "always off",
    null: "follows the switch",
  },
};

function valueText(action: string, value: unknown): string {
  const words = VALUE_WORDS[action];
  const key = value === null || value === undefined ? "null" : String(value);
  if (words && key in words) return words[key];
  if (value === null || value === undefined) return "\u2014";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The metadata, as something readable \u2014 because without it the log cannot do
 * the one job it has.
 *
 * Four credit.mode_override rows in a row rendered as four identical lines:
 * same action, same actor, same target, no values. They were four different
 * changes and the page made them look like one press logged four times, which
 * is exactly the doubt an audit log exists to remove. The metadata was fetched
 * the whole time and thrown away at the last step.
 *
 * A `from`/`to` pair is pulled out and rendered as one change, because that is
 * the shape of the question \u2014 "what was it before" is half of every audit
 * question and reading it as two separate fields makes it the reader's job to
 * pair them up. Everything else renders as labelled values, whatever the action
 * chose to record, so a new action gets a readable row without touching this
 * file.
 */
function metadataParts(action: string, metadata: Record<string, unknown> | null) {
  if (!metadata) return [];
  const parts: { label: string | null; value: string }[] = [];
  const rest: Record<string, unknown> = { ...metadata };

  if ("from" in rest || "to" in rest) {
    parts.push({
      label: null,
      value: `${valueText(action, rest.from)} \u2192 ${valueText(action, rest.to)}`,
    });
    delete rest.from;
    delete rest.to;
  }

  for (const [key, value] of Object.entries(rest)) {
    if (value === null || value === undefined || value === "") continue;
    parts.push({ label: key.replace(/_/g, " "), value: valueText(action, value) });
  }
  return parts;
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
            const parts = metadataParts(log.action, log.metadata);
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
                  {parts.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-mono text-text-muted">
                      {parts.map((part) => (
                        <span key={part.label ?? "change"}>
                          {part.label && (
                            <span className="text-text-faint">{part.label} </span>
                          )}
                          {part.value}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="mt-0.5 text-mono text-text-faint tabular">
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
