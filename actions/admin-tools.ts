"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { toolPublishedEmail } from "@/lib/email";
import { notifyActiveMembers } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { toolDraftSchema, type ToolDraft } from "@/lib/validation/tool";
import { compileInputSchema } from "@/lib/schema";
import { parseInputSchema } from "@/lib/tool-schema";

/** "New tool published" fan-out (§11) — fires only on the transition to
    published, so re-saving a published tool never re-broadcasts. */
async function announceIfNewlyPublished(
  wasPublished: boolean,
  d: ToolDraft,
): Promise<void> {
  if (wasPublished || d.status !== "published") return;
  await notifyActiveMembers({
    title: `New tool: ${d.name}`,
    body: d.tagline,
    href: `/dashboard/tools/${d.slug}`,
    email: toolPublishedEmail(d.name, d.tagline, d.slug),
  });
}

type Result<T = object> = ({ error: string } | ({ ok: true } & T));

const COVER_BUCKET = "tool-covers";
const COVER_MAX_BYTES = 4 * 1024 * 1024; // 4 MB — a card thumbnail, not a hero.
const COVER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];

/**
 * Upload a tool cover thumbnail. Admin-only, and the file goes to the public
 * `tool-covers` bucket via the service-role client (the client can't write it).
 * A cover is not a secret, so routing the bytes through this action is fine —
 * the §10/§13 "no key transits Vercel" rule is about API keys, not images.
 * Returns the public URL; the editor stores it on `tools.cover_image_url`.
 */
export async function uploadToolCover(formData: FormData): Promise<Result<{ url: string }>> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No image selected." };
  if (!COVER_TYPES.includes(file.type)) return { error: "Use a PNG, JPG, WebP, AVIF, or GIF." };
  if (file.size > COVER_MAX_BYTES) return { error: "Image must be under 4 MB." };

  const admin = createAdminClient();
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await admin.storage
    .from(COVER_BUCKET)
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) return { error: "Upload failed. Try again." };

  const { data } = admin.storage.from(COVER_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}

/**
 * All tool config — including tool_secrets — is written here, with the SERVICE
 * ROLE, never the client Supabase instance (§6.6b). The client sends a draft;
 * the action splits it: public columns to `tools`, runtime config to
 * `tool_secrets`. The client never touches tool_secrets directly.
 */
function splitDraft(d: ToolDraft) {
  const toolRow = {
    slug: d.slug,
    name: d.name,
    tagline: d.tagline,
    description: d.description || null,
    category: d.category || null,
    icon: d.icon || null,
    cover_image_url: d.cover_image_url || null,
    video_url: d.video_url || null,
    status: d.status,
    access_type: d.access_type,
    runtime: d.runtime,
    timeout_seconds: d.timeout_seconds,
    rate_limit_per_day: d.rate_limit_per_day ?? null,
    required_providers: d.required_providers,
    input_schema: d.input_schema,
    output_schema: d.output_schema,
    // launched_at is stamped when a tool first goes to 'published'.
  };
  const secretRow = {
    function_name: d.function_name?.trim() || d.slug, // default the handler to the slug
    embed_url: d.embed_url || null,
    external_url: d.external_url || null,
  };
  return { toolRow, secretRow };
}

export async function createTool(raw: unknown): Promise<Result<{ id: string }>> {
  await requireAdmin();
  const parsed = toolDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };

  const admin = createAdminClient();
  const { toolRow, secretRow } = splitDraft(parsed.data);

  const { data: tool, error } = await admin
    .from("tools")
    .insert({
      ...toolRow,
      launched_at: toolRow.status === "published" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That slug is already taken." };
    return { error: "Couldn't create the tool. Try again." };
  }

  await admin.from("tool_secrets").insert({ tool_id: tool.id, ...secretRow });
  await admin.rpc("log_audit", {
    p_action: "tool.create",
    p_entity_type: "tool",
    p_entity_id: tool.id,
  });

  // A brand-new tool created straight as published is a launch → announce.
  await announceIfNewlyPublished(false, parsed.data);

  revalidatePath("/admin/tools");
  revalidatePath("/");
  return { ok: true, id: tool.id };
}

export async function updateTool(id: string, raw: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = toolDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };

  const admin = createAdminClient();
  const { toolRow, secretRow } = splitDraft(parsed.data);

  // Stamp launched_at the first time a tool becomes published.
  const { data: existing } = await admin
    .from("tools")
    .select("launched_at, status")
    .eq("id", id)
    .single();
  const launched_at =
    existing?.launched_at ??
    (toolRow.status === "published" ? new Date().toISOString() : null);

  const { error } = await admin
    .from("tools")
    .update({ ...toolRow, launched_at, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That slug is already taken." };
    return { error: "Couldn't save the tool. Try again." };
  }

  await admin
    .from("tool_secrets")
    .upsert({ tool_id: id, ...secretRow }, { onConflict: "tool_id" });
  await admin.rpc("log_audit", {
    p_action: "tool.update",
    p_entity_type: "tool",
    p_entity_id: id,
  });

  // Announce only when this save is the transition into published.
  await announceIfNewlyPublished(existing?.status === "published", parsed.data);

  revalidatePath("/admin/tools");
  revalidatePath(`/admin/tools/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function duplicateTool(id: string): Promise<Result<{ id: string }>> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: src } = await admin.from("tools").select("*").eq("id", id).single();
  if (!src) return { error: "Tool not found." };
  const { data: srcSecret } = await admin
    .from("tool_secrets")
    .select("function_name, embed_url, external_url")
    .eq("tool_id", id)
    .maybeSingle();

  // A copy is always a fresh draft with a unique slug.
  const copySlug = `${src.slug}-copy`;
  const { id: _id, created_at, updated_at, launched_at, ...rest } = src;
  void _id; void created_at; void updated_at; void launched_at;

  const { data: dup, error } = await admin
    .from("tools")
    .insert({ ...rest, slug: copySlug, name: `${src.name} (copy)`, status: "draft", launched_at: null })
    .select("id")
    .single();
  if (error) return { error: "Couldn't duplicate. A copy may already exist — rename it first." };

  await admin.from("tool_secrets").insert({
    tool_id: dup.id,
    function_name: srcSecret?.function_name ?? copySlug,
    embed_url: srcSecret?.embed_url ?? null,
    external_url: srcSecret?.external_url ?? null,
  });

  revalidatePath("/admin/tools");
  return { ok: true, id: dup.id };
}

export async function deleteTool(id: string): Promise<Result> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("tools").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the tool. Try again." };
  await admin.rpc("log_audit", { p_action: "tool.delete", p_entity_type: "tool", p_entity_id: id });
  revalidatePath("/admin/tools");
  revalidatePath("/");
  return { ok: true };
}

export async function reorderTools(orderedIds: string[]): Promise<Result> {
  await requireAdmin();
  const admin = createAdminClient();
  // sort_order follows the given order.
  await Promise.all(
    orderedIds.map((id, i) =>
      admin.from("tools").update({ sort_order: i * 10 }).eq("id", id),
    ),
  );
  revalidatePath("/admin/tools");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Test run — fires the tool through the REAL runner path, as the admin, with the
 * admin's own keys, and bypassing the published-status gate (the whole point is
 * to debug a tool before it's published). Returns a run_id; the editor watches
 * it over Realtime and shows the raw response.
 *
 * If the handler isn't deployed yet, run-tool fails the run with "isn't wired up
 * yet" — which is exactly the data-vs-behaviour boundary made visible.
 */
export async function testRunTool(
  toolId: string,
  rawInput: unknown,
): Promise<Result<{ runId: string }>> {
  const admin = await requireAdmin();
  const svc = createAdminClient();

  const { data: tool } = await svc
    .from("tools")
    .select("id, required_providers, input_schema, timeout_seconds")
    .eq("id", toolId)
    .maybeSingle();
  if (!tool) return { error: "Tool not found." };

  // The admin needs the tool's keys connected (same rule as a member).
  const { data: hasKeys } = await svc.rpc("has_required_keys", {
    p_tool_id: tool.id,
    uid: admin.id,
  });
  if (!hasKeys) {
    return {
      error: `Connect your ${(tool.required_providers ?? []).join(", ")} key in the vault to test this.`,
    };
  }

  const compiled = compileInputSchema(parseInputSchema(tool.input_schema));
  const parsed = compiled.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the test inputs." };

  const { data: run, error } = await svc
    .from("tool_runs")
    .insert({
      user_id: admin.id,
      tool_id: tool.id,
      status: "running",
      input: parsed.data as never,
      expires_at: new Date(Date.now() + tool.timeout_seconds * 1000).toISOString(),
      providers_used: tool.required_providers,
    })
    .select("id")
    .single();
  if (error || !run) return { error: "Couldn't start the test run." };

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/run-tool`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "X-Runner-Secret": process.env.RUNNER_SECRET!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ run_id: run.id }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (res.status !== 202) {
    await svc.from("tool_runs").update({ status: "error", error_message: "The runner didn't accept the test." }).eq("id", run.id);
    return { error: "The runner didn't accept the test run." };
  }

  return { ok: true, runId: run.id };
}
