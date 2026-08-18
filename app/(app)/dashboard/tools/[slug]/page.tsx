import { Download, KeyRound, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AiAttribution } from "@/components/tools/ai-attribution";
import { Markdown } from "@/components/tools/markdown";
import { RunnerClient } from "@/components/tools/runner-client";
import { ToolEmbed } from "@/components/tools/tool-embed";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { BackLink } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
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
  const [{ slug }, { run: runId }] = await Promise.all([params, searchParams]);

  const supabase = await createClient();
  // Auth and the tool lookup are independent — the tool is keyed by slug, not by
  // the caller — so resolve them together instead of paying two round-trips.
  const [user, { data: tool }] = await Promise.all([
    requireUser(),
    supabase
      .from("tools")
      .select(
        "id, slug, name, icon, status, runtime, required_providers, input_schema, output_schema, tagline, description",
      )
      .eq("slug", slug)
      .maybeSingle(),
  ]);
  if (!tool) notFound();

  // The access engine — server-side, always (§13). A member without access gets
  // a 404, same as a member hitting an admin route: no reason to confirm it exists.
  const { data: canAccess } = await supabase.rpc("can_access_tool", {
    p_tool_id: tool.id,
  });
  if (!canAccess) notFound();

  const inMaintenance = tool.status === "maintenance";
  const isEmbed = tool.runtime === "iframe";
  // external_link: nothing executes here. No form, no run row, no key check —
  // the hub's whole job for this runtime is the access check above, then handing
  // over the link. Rendering the edge_function runner for it was the bug: it
  // offered a Run button that could never run and demanded keys this page has no
  // use for, because `runtime` was only ever branched on for `iframe`.
  const isExternal = tool.runtime === "external_link";

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
    // The secret lookup and the token mint don't depend on each other — one reads
    // the DB, the other calls the embed-token function — so run them together and
    // wait once. In the rare misconfigured case (no embed_url) we minted a token
    // we won't use; that's cheaper than a serial round-trip on every open.
    const admin = createAdminClient();
    const [{ data: secret }, minted] = await Promise.all([
      admin.from("tool_secrets").select("embed_url").eq("tool_id", tool.id).maybeSingle(),
      mintEmbedToken(user, tool.slug),
    ]);

    if (!secret?.embed_url) {
      // A published iframe tool with no embed_url is my mistake, not theirs.
      embedError = "This app isn't wired up yet. I'm on it.";
    } else if ("error" in minted) {
      embedError = minted.error;
    } else {
      embed = { url: secret.embed_url, token: minted.token };
    }
  }

  // ---- the external_link branch ------------------------------------------
  //
  // Same shape as the iframe branch, one runtime over: read the URL from
  // tool_secrets (deny-all to every client role, so service role), and hand it
  // over. A tool in maintenance resolves nothing — the same rule as an embed
  // minting no token and startRun refusing to run.
  let externalUrl: string | null = null;
  let externalError: string | null = null;
  if (isExternal && !inMaintenance) {
    const admin = createAdminClient();
    const { data: secret } = await admin
      .from("tool_secrets")
      .select("external_url")
      .eq("tool_id", tool.id)
      .maybeSingle();

    if (!secret?.external_url) {
      // A published external tool with no URL is my mistake, not theirs.
      externalError = "This app isn't wired up yet. I'm on it.";
    } else {
      externalUrl = secret.external_url;
    }
  }

  // The key check gates the RUN button, so it is only meaningful for the
  // runtime that has one. An embed brings its own keys; an external app spends
  // them on the member's own machine, under the consent gate at
  // /dashboard/keys — neither is something this page can or should block.
  const { data: hasKeys } =
    isEmbed || isExternal
      ? { data: true }
      : await supabase.rpc("has_required_keys", { p_tool_id: tool.id });

  // Resume: ?run=<id> loads a prior run (their own). If it's still running the
  // client re-subscribes; if terminal, it renders instantly with no ceremony.
  const initialRun = isEmbed || isExternal || !runId ? null : await getMyRun(runId);

  // An embedded app gets FOCUS MODE: the whole viewport, nothing of the shell
  // behind it (so there is nothing to scroll back to), one slim bar home. The
  // shelled layout below still handles maintenance / embed errors, where there
  // is no app to hand the screen to.
  if (isEmbed && embed) {
    return (
      <ToolEmbed
        embedUrl={embed.url}
        token={embed.token}
        name={tool.name}
        slug={tool.slug}
        icon={tool.icon}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <BackLink href="/dashboard" label="Apps" />
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
            <ToolIcon name={tool.icon} className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-h1">{tool.name}</h1>
            <p className="text-mono text-text-faint">{tool.slug}</p>
          </div>
        </div>

        {/* Same third-party AI attribution as the public tool page. A member who
            only ever sees the runner still gets told what is behind the tool. */}
        <AiAttribution
          slug={tool.slug}
          providers={tool.required_providers ?? []}
          className="text-mono-chip mt-4 text-text-faint"
        />
      </div>

      {inMaintenance && (
        <Callout tone="warn" icon={Wrench}>
          This tool is being rebuilt right now. It&apos;ll be back — you&apos;ll get
          a notification.
        </Callout>
      )}

      {!hasKeys && !inMaintenance && (
        <Callout
          tone="warn"
          icon={KeyRound}
          action={
            <Link href={`/dashboard/keys?provider=${(tool.required_providers ?? [])[0] ?? ""}`}>
              <Button variant="secondary" size="sm">
                <KeyRound aria-hidden className="size-4" strokeWidth={1.5} />
                Connect it
              </Button>
            </Link>
          }
        >
          This tool needs your {(tool.required_providers ?? []).join(", ")} key.
        </Callout>
      )}

      {(embedError || externalError) && (
        <Callout tone="warn" icon={Wrench}>
          {embedError ?? externalError}
        </Callout>
      )}

      {/* external_link: the hand-off, not a runner. Description, one primary
          action out, and — only as information — where the keys it uses live. */}
      {isExternal && externalUrl && (
        <Panel className="flex flex-col gap-5">
          {tool.description ? (
            <Markdown source={tool.description} />
          ) : (
            <p className="text-body text-text-muted">{tool.tagline}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary">
                <Download aria-hidden className="size-4" strokeWidth={1.5} />
                Download
              </Button>
            </a>
            <span className="text-mono-chip text-text-faint">
              opens in a new tab
            </span>
          </div>

          {(tool.required_providers ?? []).length > 0 && (
            <p className="text-small text-text-muted">
              It runs on your own {(tool.required_providers ?? []).join(", ")}{" "}
              key — nothing runs on my bill. Manage what it may read in your{" "}
              <Link
                href="/dashboard/keys"
                className="text-accent hover:text-accent-hover"
              >
                key vault
              </Link>
              .
            </p>
          )}
        </Panel>
      )}

      {!isEmbed && !isExternal && (
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
