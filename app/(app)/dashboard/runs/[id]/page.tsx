import { notFound } from "next/navigation";

import { RunnerClient } from "@/components/tools/runner-client";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/access";
import { formatShipDate } from "@/lib/format";
import { getMyRun } from "@/lib/runs";
import { parseInputSchema, parseOutputSchema } from "@/lib/tool-schema";
import { createClient } from "@/lib/supabase/server";

/**
 * A single past run. Reuses the runner's output panel so a finished run looks
 * exactly as it did live — and a still-running one (opened cold) resumes and
 * keeps updating over Realtime (§8, the resumed-run state).
 */
export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const run = await getMyRun(id);
  if (!run || !run.tools) notFound();

  // The runner needs the tool's input schema too, for the (disabled) form beside
  // the output. Load it; the tool row is small.
  const supabase = await createClient();
  const { data: tool } = await supabase
    .from("tools")
    .select("input_schema, output_schema, required_providers, status")
    .eq("slug", run.tools.slug)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        back={{ href: "/dashboard/runs", label: "Run history" }}
        title={run.tools.name}
        description={formatShipDate(run.created_at)}
      />

      <RunnerClient
        slug={run.tools.slug}
        inputSchema={parseInputSchema(tool?.input_schema)}
        outputSchema={parseOutputSchema(run.tools.output_schema)}
        initialRun={run}
        runnable={false}
      />
    </div>
  );
}
