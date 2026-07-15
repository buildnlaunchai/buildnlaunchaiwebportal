import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RunnerClient } from "@/components/tools/runner-client";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/access";
import { getMyRun } from "@/lib/runs";
import { createClient } from "@/lib/supabase/server";
import { parseInputSchema, parseOutputSchema } from "@/lib/tool-schema";

/**
 * The tool runner (§8, §9). The signature moment. Access is re-checked here on
 * the server; the run itself is async — startRun hands off and the RunnerClient
 * watches the row over Realtime.
 */
export default async function RunnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const { run: runId } = await searchParams;

  const supabase = await createClient();
  const { data: tool } = await supabase
    .from("tools")
    .select("id, slug, name, icon, status, required_providers, input_schema, output_schema")
    .eq("slug", slug)
    .maybeSingle();
  if (!tool) notFound();

  // The access engine — server-side, always (§13). A member without access gets
  // a 404, same as a member hitting an admin route: no reason to confirm it exists.
  const { data: canAccess } = await supabase.rpc("can_access_tool", {
    p_tool_id: tool.id,
  });
  if (!canAccess) notFound();

  const { data: hasKeys } = await supabase.rpc("has_required_keys", {
    p_tool_id: tool.id,
  });

  // Resume: ?run=<id> loads a prior run (their own). If it's still running the
  // client re-subscribes; if terminal, it renders instantly with no ceremony.
  const initialRun = runId ? await getMyRun(runId) : null;

  const inMaintenance = tool.status === "maintenance";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
        >
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
          Apps
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md border border-line text-text-muted">
            <ToolIcon name={tool.icon} className="size-5" />
          </span>
          <div>
            <h1 className="text-h1">{tool.name}</h1>
            <p className="text-mono text-text-faint">{tool.slug}</p>
          </div>
        </div>
      </div>

      {inMaintenance && (
        <div className="rounded-md border border-warn bg-warn-quiet px-4 py-3 text-small text-warn">
          This tool is being rebuilt right now. It&apos;ll be back — you&apos;ll get
          a notification.
        </div>
      )}

      {!hasKeys && !inMaintenance && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn bg-warn-quiet px-4 py-3">
          <span className="text-small text-warn">
            This tool needs your {(tool.required_providers ?? []).join(", ")} key.
          </span>
          <Link href={`/dashboard/keys?provider=${(tool.required_providers ?? [])[0] ?? ""}`}>
            <Button variant="secondary" size="sm">
              <KeyRound aria-hidden className="size-4" strokeWidth={1.5} />
              Connect it
            </Button>
          </Link>
        </div>
      )}

      <RunnerClient
        slug={tool.slug}
        inputSchema={parseInputSchema(tool.input_schema)}
        outputSchema={parseOutputSchema(tool.output_schema)}
        initialRun={initialRun}
        runnable={Boolean(hasKeys) && !inMaintenance}
      />
    </div>
  );
}
