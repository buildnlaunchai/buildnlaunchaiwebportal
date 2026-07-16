"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { error: string } | { ok: true; code: string };

/** A readable random code: BLAI-XXXX-XXXX (no ambiguous chars). */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = () =>
    Array.from({ length: 4 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");
  return `BLAI-${block()}-${block()}`;
}

export async function createAccessCode(input: {
  kind: "membership" | "tool_access";
  planId?: string | null;
  toolIds?: string[];
  durationDays?: number | null;
  maxUses: number;
  expiresAt?: string | null;
  note?: string;
}): Promise<Result> {
  const admin = await requireAdmin();
  const svc = createAdminClient();

  if (input.kind === "tool_access" && (!input.toolIds || input.toolIds.length === 0)) {
    return { error: "Pick at least one tool for a tool-access code." };
  }

  const code = generateCode();
  const { error } = await svc.from("access_codes").insert({
    code,
    kind: input.kind,
    plan_id: input.kind === "membership" ? input.planId ?? null : null,
    tool_ids: input.kind === "tool_access" ? input.toolIds ?? null : null,
    duration_days: input.durationDays ?? null,
    max_uses: Math.max(1, input.maxUses || 1),
    expires_at: input.expiresAt || null,
    note: input.note?.trim() || null,
    created_by: admin.id,
  });
  if (error) return { error: "Couldn't create the code. Try again." };

  await svc.rpc("log_audit", { p_action: "code.create", p_entity_type: "access_code" });
  revalidatePath("/admin/codes");
  return { ok: true, code };
}

export async function deleteAccessCode(id: string): Promise<{ error: string } | { ok: true }> {
  await requireAdmin();
  const svc = createAdminClient();
  const { error } = await svc.from("access_codes").delete().eq("id", id);
  if (error) return { error: "Couldn't delete the code." };
  revalidatePath("/admin/codes");
  return { ok: true };
}
