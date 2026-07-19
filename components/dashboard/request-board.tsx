"use client";

import { ChevronUp, Lightbulb, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { submitFeatureRequest, toggleVote } from "@/actions/requests";
import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import type { RequestWithTool } from "@/lib/requests";
import { cn } from "@/lib/utils";

const STATUS = {
  open: { label: "open", tone: "faint" as const },
  planned: { label: "planned", tone: "warn" as const },
  building: { label: "building", tone: "accent" as const },
  shipped: { label: "shipped", tone: "live" as const },
  declined: { label: "declined", tone: "faint" as const },
};

type VoteState = { count: number; voted: boolean };

export function RequestBoard({
  requests,
  myVotes,
}: {
  requests: RequestWithTool[];
  myVotes: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Optimistic vote state keyed by request id.
  const [votes, setVotes] = useState<Record<string, VoteState>>(() =>
    Object.fromEntries(
      requests.map((r) => [r.id, { count: r.vote_count, voted: myVotes.includes(r.id) }]),
    ),
  );

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await submitFeatureRequest(title, body);
      if ("error" in res) setError(res.error);
      else {
        setTitle("");
        setBody("");
      }
    });
  };

  const vote = (id: string) => {
    // Optimistic flip.
    setVotes((v) => {
      const cur = v[id];
      return { ...v, [id]: { count: cur.count + (cur.voted ? -1 : 1), voted: !cur.voted } };
    });
    startTransition(async () => {
      const res = await toggleVote(id);
      if ("error" in res) {
        // Roll back on failure.
        setVotes((v) => {
          const cur = v[id];
          return { ...v, [id]: { count: cur.count + (cur.voted ? -1 : 1), voted: !cur.voted } };
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <Panel>
        <SectionHeader icon={Sparkles} title="Request a tool" />
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label required>What would you like me to build?</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A tool that…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Any detail?</Label>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What it should do, and why it'd help." />
          </div>
          {error && <p className="text-small text-danger">{error}</p>}
          <Button variant="primary" pending={pending} disabled={title.trim().length < 4} onClick={submit} className="self-start">
            Submit
          </Button>
        </div>
      </Panel>

      <section className="flex flex-col gap-3">
        {requests.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="No requests yet"
            description="Be the first — tell me what to build, and others can upvote it."
          />
        ) : (
          requests.map((r) => {
            const v = votes[r.id];
            const s = STATUS[r.status as keyof typeof STATUS] ?? STATUS.open;
            return (
              <Panel key={r.id} className="flex gap-4">
                <button
                  type="button"
                  onClick={() => vote(r.id)}
                  aria-pressed={v.voted}
                  className={cn(
                    "flex h-fit flex-col items-center gap-0.5 rounded-md border px-3 py-2 transition-colors duration-micro ease-default",
                    v.voted ? "border-accent bg-accent-quiet text-accent" : "border-line text-text-muted hover:border-line-strong hover:text-text",
                  )}
                >
                  <ChevronUp aria-hidden className="size-4" strokeWidth={2} />
                  <span className="tabular text-small font-medium">{v.count}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-strong text-text">{r.title}</span>
                    <StatusPill label={s.label} tone={s.tone} dot={false} />
                  </div>
                  {r.body && <p className="mt-1 text-small text-text-muted">{r.body}</p>}
                  {r.status === "shipped" && r.tools && (
                    <Link href={`/dashboard/tools/${r.tools.slug}`} className="mt-2 inline-block text-small text-accent hover:text-accent-hover">
                      Shipped as {r.tools.name} →
                    </Link>
                  )}
                </div>
              </Panel>
            );
          })
        )}
      </section>
    </div>
  );
}
