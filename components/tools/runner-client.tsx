"use client";

import { KeyRound, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { startRun } from "@/actions/runs";
import { StatusPill } from "@/components/tools/status-pill";
import { ToolForm } from "@/components/tools/tool-form";
import { ToolOutput } from "@/components/tools/tool-output";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { InputSchema, OutputSchema } from "@/lib/tool-schema";
import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type Run = Database["public"]["Tables"]["tool_runs"]["Row"];

const RUN_PILL = {
  queued: { label: "queued", tone: "faint" as const, pulse: false },
  running: { label: "running", tone: "accent" as const, pulse: true },
  success: { label: "done", tone: "live" as const, pulse: false },
  error: { label: "failed", tone: "danger" as const, pulse: false },
  timeout: { label: "timeout", tone: "danger" as const, pulse: false },
};

function shortRunId(id: string) {
  return `run_${id.replace(/-/g, "").slice(0, 8)}`;
}

/** A skeleton shaped like the tool's actual output (§8 step 3). */
function RunSkeleton({ schema }: { schema: OutputSchema }) {
  return (
    <div className="flex flex-col gap-6">
      {schema.blocks.map((b, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="run-skeleton h-2 w-24 rounded-sm bg-elevated" />
          {b.type === "table" ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 4 }).map((_, r) => (
                <div key={r} className="run-skeleton h-6 rounded-sm bg-elevated" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {[90, 100, 70].map((w, r) => (
                <div key={r} className="run-skeleton h-3 rounded-sm bg-elevated" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function RunnerClient({
  slug,
  inputSchema,
  outputSchema,
  initialRun,
  runnable = true,
}: {
  slug: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  initialRun: Run | null;
  /** false when a required key is missing — Run is disabled until it's added. */
  runnable?: boolean;
}) {
  const [run, setRun] = useState<Run | null>(initialRun);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // True only for a run we kicked off in this tab; a cold-loaded running row is
  // "resumed" and gets the "you can close this" line, not the full ceremony.
  const [startedThisSession, setStartedThisSession] = useState(false);

  const isRunning = run?.status === "running" || run?.status === "queued";

  // Subscribe to the run row over Realtime — the UI updates the instant the
  // background task writes the result. No polling (§9).
  useEffect(() => {
    if (!run || !isRunning) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`run-${run.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tool_runs", filter: `id=eq.${run.id}` },
        (payload) => setRun(payload.new as Run),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [run, isRunning]);

  const onRun = useCallback(
    (values: Record<string, unknown>) => {
      setFormError(null);
      startTransition(async () => {
        const res = await startRun(slug, values);
        if ("error" in res) {
          setFormError(res.error);
          return;
        }
        setStartedThisSession(true);
        // Optimistically show a running row; Realtime fills in the result.
        setRun({
          id: res.runId,
          status: "running",
          created_at: new Date().toISOString(),
        } as Run);
      });
    },
    [slug],
  );

  const runAgain = () => {
    setStartedThisSession(false);
    setRun(null);
  };

  return (
    // §8: two-panel split on desktop; stacks on mobile.
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_1fr]">
      {/* ---- Left: the form ---- */}
      <div>
        <ToolForm
          schema={inputSchema}
          pending={pending || isRunning}
          disabled={!runnable}
          onRun={onRun}
        />
        {formError && (
          <div className="mt-4 rounded-md border border-warn bg-warn-quiet px-4 py-3 text-small text-warn" role="alert">
            {formError}
            {/needs? your |key /i.test(formError) && (
              <Link href="/dashboard/keys" className="ml-1 underline">
                Open the key vault
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ---- Right: the output panel — the stage ---- */}
      <OutputPanel
        slug={slug}
        outputSchema={outputSchema}
        run={run}
        resumed={Boolean(run) && isRunning && !startedThisSession}
        onRunAgain={runAgain}
      />
    </div>
  );
}

function OutputPanel({
  slug,
  outputSchema,
  run,
  resumed,
  onRunAgain,
}: {
  slug: string;
  outputSchema: OutputSchema;
  run: Run | null;
  resumed: boolean;
  onRunAgain: () => void;
}) {
  const isRunning = run?.status === "running" || run?.status === "queued";
  const failed = run?.status === "error" || run?.status === "timeout";
  const isKeyError = failed && /key was rejected|marked invalid/i.test(run?.error_message ?? "");

  return (
    <div
      className={cn(
        "relative min-h-[320px] overflow-hidden rounded-md border bg-sunken",
        failed ? "border-danger" : "border-line",
      )}
    >
      {/* The 2px indeterminate progress line (§8 step 2) */}
      {isRunning && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="run-progress h-full w-1/3 bg-accent" />
        </div>
      )}

      {/* Status pill, top-right */}
      {run && (
        <div className="absolute right-3 top-3 z-10" aria-live="polite">
          <StatusPill {...RUN_PILL[run.status]} />
        </div>
      )}

      <div className="p-6">
        {/* --- Idle: the stage waiting for its actor (§8) --- */}
        {!run && (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <p className="text-mono text-text-faint">{slug}</p>
            <p className="mt-2 max-w-[36ch] text-small text-text-faint">
              Fill in the form and hit run. Your result appears here.
            </p>
          </div>
        )}

        {/* --- Running: skeleton shaped like the answer --- */}
        {isRunning && (
          <div className="pt-4">
            {resumed && (
              <p className="mb-4 text-small text-text-faint">
                Still running. You can close this — it&apos;ll keep going, and
                you&apos;ll find it in your run history.
              </p>
            )}
            <RunSkeleton schema={outputSchema} />
          </div>
        )}

        {/* --- Success --- */}
        {run?.status === "success" && run.output && (
          <div className="pt-4">
            <ToolOutput
              schema={outputSchema}
              data={run.output as Record<string, unknown>}
            />
            <Receipt run={run} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={onRunAgain}>
                <RotateCw aria-hidden className="size-4" strokeWidth={1.5} />
                Run again
              </Button>
              <CopyButton output={run.output} />
            </div>
          </div>
        )}

        {/* --- Failure (§8, §12 voice) --- */}
        {failed && (
          <div className="pt-4">
            <h3 className="text-h3 text-danger">
              {run?.status === "timeout"
                ? "The tool never came back"
                : isKeyError
                  ? "Your key was rejected"
                  : "The tool didn't finish"}
            </h3>
            <p className="mt-2 text-small text-text-muted">
              {run?.error_message ?? "Something went wrong."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {isKeyError && (
                <Link href={`/dashboard/keys`}>
                  <Button variant="primary" size="sm">
                    <KeyRound aria-hidden className="size-4" strokeWidth={1.5} />
                    Update your key
                  </Button>
                </Link>
              )}
              <Button variant="secondary" size="sm" onClick={onRunAgain}>
                Run again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The receipt: duration · run id · providers. Small, faint, factual (§8). */
function Receipt({ run }: { run: Run }) {
  const secs = run.duration_ms ? (run.duration_ms / 1000).toFixed(1) : null;
  const providers = (run.providers_used ?? []).join(", ");
  return (
    <p className="text-mono mt-6 text-text-faint">
      {[secs && `${secs}s`, shortRunId(run.id), providers].filter(Boolean).join(" · ")}
    </p>
  );
}

function CopyButton({ output }: { output: unknown }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(JSON.stringify(output, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
