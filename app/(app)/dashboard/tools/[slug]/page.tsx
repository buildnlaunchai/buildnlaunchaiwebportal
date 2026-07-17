import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RunnerClient } from "@/components/tools/runner-client";
import { ToolEmbed } from "@/components/tools/tool-embed";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/access";
import { mintEmbedToken } from "@/lib/embed";
import { getMyRun } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const user = await requireUser();
  const { slug } = await params;
  const { run: runId } = await searchParams;

  const supabase = await createClient();
  const { data: tool } = await supabase
    .from("tools")
    .select("id, slug, name, icon, status, runtime, required_providers, input_schema, output_schema")
    .eq("slug", slug)
    .maybeSingle();
  if (!tool) notFound();

  // The access engine — server-side, always (§13). A member without access gets
  // a 404, same as a member hitting an admin route: no reason to confirm it exists.
  const { data: canAccess } = await supabase.rpc("can_access_tool", {
    p_tool_id: tool.id,
  });
  if (!canAccess) notFound();

  const inMaintenance = tool.status === "maintenance";
  const isEmbed = tool.runtime === "iframe";

  // ---- the iframe branch -------------------------------------------------
  //
  // An embedded app IS the interface, so none of the edge_function machinery
  // applies: no key check (the app brings its own or needs none), no compiled
  // form, no run row, no realtime. What the hub still owns is access — checked
  // above, and checked AGAIN inside embed-token, which re-derives it from the
  // engine rather than believing this page.
  //
  // The token is minted only if we are actually going to embed. A tool in
  // maintenance mints nothing: the same rule as startRun refusing to run, one
  // runtime over.
  let embed: { url: string; token: string } | null = null;
  let embedError: string | null = null;
  if (isEmbed && !inMaintenance) {
    // tool_secrets is deny-all to every client role, so this needs the service
    // role — and it never reaches the browser as anything but an iframe src.
    const admin = createAdminClient();
    const { data: secret } = await admin
      .from("tool_secrets")
      .select("embed_url")
      .eq("tool_id", tool.id)
      .maybeSingle();

    if (!secret?.embed_url) {
      // A published iframe tool with no embed_url is my mistake, not theirs.
      embedError = "This app isn't wired up yet. I'm on it.";
    } else {
      const minted = await mintEmbedToken(user, tool.slug);
      embedError = "error" in minted ? minted.error : null;
      if (!("error" in minted)) embed = { url: secret.embed_url, token: minted.token };
    }
  }

  const { data: hasKeys } = isEmbed
    ? { data: true }
    : await supabase.rpc("has_required_keys", { p_tool_id: tool.id });

  // Resume: ?run=<id> loads a prior run (their own). If it's still running the
  // client re-subscribes; if terminal, it renders instantly with no ceremony.
  const initialRun = isEmbed || !runId ? null : await getMyRun(runId);

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

      {embedError && (
        <div className="rounded-md border border-warn bg-warn-quiet px-4 py-3 text-small text-warn">
          {embedError}
        </div>
      )}

      {isEmbed
        ? embed && (
            <ToolEmbed embedUrl={embed.url} token={embed.token} name={tool.name} />
          )
        : (
          <RunnerClient
            slug={tool.slug}
            inputSchema={parseInputSchema(tool.input_schema)}
            outputSchema={parseOutputSchema(tool.output_schema)}
            initialRun={initialRun}
            runnable={Boolean(hasKeys) && !inMaintenance}
          />
        )}
    </div>
  );
}
