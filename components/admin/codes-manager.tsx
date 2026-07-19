"use client";

import { Check, CheckCircle2, Copy, KeyRound, ListChecks, Ticket, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createAccessCode, deleteAccessCode } from "@/actions/admin-codes";
import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { AccessCodeView } from "@/lib/admin-codes";
import { formatShipDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

export function CodesManager({
  initial,
  plans,
  tools,
}: {
  initial: AccessCodeView[];
  plans: Option[];
  tools: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"membership" | "tool_access">("membership");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [maxUses, setMaxUses] = useState(1);
  const [durationDays, setDurationDays] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justMade, setJustMade] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const create = () => {
    setError(null);
    setJustMade(null);
    startTransition(async () => {
      const res = await createAccessCode({
        kind,
        planId: kind === "membership" ? planId || null : null,
        toolIds: kind === "tool_access" ? toolIds : [],
        durationDays: durationDays ? Number(durationDays) : null,
        maxUses,
        note,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setJustMade(res.code);
      setNote("");
      setToolIds([]);
      router.refresh();
    });
  };

  const copy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const remove = (id: string) =>
    startTransition(async () => {
      await deleteAccessCode(id);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-8">
      <Panel>
        <SectionHeader icon={Ticket} title="Generate a code" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Kind</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="membership">Membership</option>
              <option value="tool_access">Tool access</option>
            </Select>
          </div>

          {kind === "membership" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Plan</Label>
              <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Tools this code unlocks</Label>
              <div className="flex flex-wrap gap-2">
                {tools.map((t) => {
                  const on = toolIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setToolIds(on ? toolIds.filter((x) => x !== t.id) : [...toolIds, t.id])}
                      className={cn(
                        "rounded-pill border px-3 py-1.5 text-small transition-colors duration-micro ease-default",
                        on ? "border-accent bg-accent-quiet text-accent" : "border-line bg-surface text-text-muted hover:border-line-strong hover:text-text",
                      )}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Max uses</Label>
            <Input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Grant duration (days)</Label>
            <Input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="blank = permanent" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Note (who&apos;s it for)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For @creator on IG" />
          </div>
        </div>

        {error && <p className="mt-3 text-small text-danger">{error}</p>}
        {justMade && (
          <Callout
            tone="success"
            icon={CheckCircle2}
            className="mt-4"
            action={
              <Button variant="ghost" size="sm" onClick={() => copy(justMade, "new")}>
                {copiedId === "new" ? "Copied" : "Copy"}
              </Button>
            }
          >
            <span className="text-mono text-text">{justMade}</span>
          </Callout>
        )}

        <Button variant="primary" className="mt-4" pending={pending} onClick={create}>
          Generate code
        </Button>
      </Panel>

      <section>
        <SectionHeader icon={ListChecks} title="Codes" />
        <div className="mt-4">
          {initial.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No codes yet"
              description="Generate one above to hand out membership or tool access."
            />
          ) : (
            <Panel flush>
              {initial.map((c) => {
                const spent = c.used_count >= c.max_uses;
                const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
                return (
                  <div key={c.id} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-mono text-text">{c.code}</span>
                        <StatusPill
                          label={expired ? "expired" : spent ? "used up" : "active"}
                          tone={expired || spent ? "faint" : "live"}
                          dot={false}
                        />
                      </div>
                      <p className="text-small text-text-muted">
                        {c.kind === "membership" ? `Membership · ${c.planName ?? "default"}` : `Tools · ${c.toolNames.join(", ")}`}
                        {" · "}{c.used_count}/{c.max_uses} used
                        {c.duration_days ? ` · ${c.duration_days}d` : " · permanent"}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                      <p className="text-mono text-text-faint">{formatShipDate(c.created_at)}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="size-8 px-0" onClick={() => copy(c.code, c.id)} aria-label="Copy code">
                      {copiedId === c.id ? <Check aria-hidden className="size-4 text-live" strokeWidth={1.5} /> : <Copy aria-hidden className="size-4" strokeWidth={1.5} />}
                    </Button>
                    <Button variant="ghost" size="sm" className="size-8 px-0 hover:text-danger" pending={pending} onClick={() => remove(c.id)} aria-label="Delete code">
                      <Trash2 aria-hidden className="size-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                );
              })}
            </Panel>
          )}
        </div>
      </section>
    </div>
  );
}
