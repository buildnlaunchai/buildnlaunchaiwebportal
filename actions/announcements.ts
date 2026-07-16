"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { error: string } | { ok: true };

export async function createAnnouncement(input: {
  title: string;
  body?: string;
  variant?: string;
  publish?: boolean;
}): Promise<Result> {
  const admin = await requireAdmin();
  if (!input.title.trim()) return { error: "A title is required." };

  const svc = createAdminClient();
  const { error } = await svc.from("announcements").insert({
    title: input.title.trim(),
    body: input.body?.trim() || null,
    variant: ["info", "success", "warning"].includes(input.variant ?? "") ? input.variant : "info",
    is_published: Boolean(input.publish),
    published_at: input.publish ? new Date().toISOString() : null,
    created_by: admin.id,
  });
  if (error) return { error: "Couldn't save the announcement. Try again." };

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setAnnouncementPublished(id: string, publish: boolean): Promise<Result> {
  await requireAdmin();
  const svc = createAdminClient();
  const { error } = await svc
    .from("announcements")
    .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { error: "Couldn't update it. Try again." };

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  await requireAdmin();
  const svc = createAdminClient();
  const { error } = await svc.from("announcements").delete().eq("id", id);
  if (error) return { error: "Couldn't delete it. Try again." };

  revalidatePath("/admin/announcements");
  revalidatePath("/dashboard");
  return { ok: true };
}
