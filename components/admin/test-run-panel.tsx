"use client";

import { useEffect, useState, useTransition } from "react";

import { testRunTool } from "@/actions/admin-tools";
import { StatusPill } from "@/components/tools/status-pill";
import { ToolForm } from "@/components/tools/tool-form";
import { createClient } from "@/lib/supabase/client";
import type { InputSchema } from "@/lib/tool-schema";
import type { Database } from "@/lib/database.types";

type Run = Database["public"]["Tables"]["tool_runs"]["Row"];

const PILL = {
  queued: { label: "queued", tone: "faint" as const },
  running: { label: "running", tone: "accent" as const, pulse: true },
  success: { label: "done", tone: "live" as const },
  error: { label: "failed", tone: "danger" as const },
  timeout: { label: "timeout", tone: "danger" as const },
};

/**
 * Test run — fires the tool with the ADMIN's own keys and shows the RAW
 * response, so a tool can be debugged before any member touches it (§8). Runs
 * through the real runner path (bypassing the published gate), so if the handler
 * isn't deployed yet, the failure says so — the data-vs-behaviour boundary, made
 * visible.
 */
export function TestRunPanel({
  toolId,
  inputSchema,
}: {
  toolId: string;
  inputSchema: InputSchema;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isRunning = run?.status === "running" || run?.status === "queued";

  useEffect(() => {
    if (!run || !isRunning) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`test-${run.id}`)
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

  const onRun = (values: Record<string, unknown>) => {
    setError(null);
    setRun(null);
    startTransition(async () => {
      const res = await testRunTool(toolId, values);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setRun({ id: res.runId, status: "running", created_at: new Date().toISOString() } as Run);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <ToolForm schema={inputSchema} pending={pending || isRunning} onRun={onRun} />
        {error && (
          <p className="mt-3 text-small text-warn" role="alert">{error}</p>
        )}
      </div>

      <div className="rounded-md border border-line bg-sunken p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-eyebrow text-text-faint">Raw response</span>
          {run && <StatusPill {...PILL[run.status]} />}
        </div>

        {!run && !pending && (
          <p className="text-small text-text-faint">
            Run with sample inputs to see exactly what the handler returns.
          </p>
        )}

        {isRunning && (
          <p className="text-small text-text-muted">Running with your admin keys…</p>
        )}

        {run?.status === "success" && (
          <pre className="max-h-[420px] overflow-auto text-mono text-text">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        )}

        {(run?.status === "error" || run?.status === "timeout") && (
          <div>
            <p className="text-small text-danger">{run.error_message}</p>
            <p className="mt-2 text-small text-text-faint">
              If it says the tool isn&apos;t wired up, deploy its handler:{" "}
              <span className="text-mono">supabase functions deploy run-tool</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
