"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access";
import { DESKTOP_PROVIDERS, DESKTOP_TOOL_SLUG } from "@/lib/desktop";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ApiProvider } from "@/lib/providers";

/**
 * Consent for the desktop app to read a member's stored provider key.
 *
 * This is the gate in front of the only path in the product that sends a
 * plaintext key outside our infrastructure (supabase/functions/desktop-keys).
 * So it holds to the §13 rules exactly:
 *
 *   - The user is re-derived from the session. `userId` is never a parameter,
 *     because a consent action that accepts a subject is a consent action an
 *     attacker can use to consent on someone else's behalf.
 *   - The write uses the service-role client, because desktop_key_consent has
 *     no client write policy — deliberately. A member granting consent through
 *     this action is a decision; a browser writing its own consent row is not.
 *   - The audit entry is written on the USER's client, not the service-role
 *     one, so log_audit()'s auth.uid() resolves to the person who acted. On the
 *     service-role client it would be NULL and the trail would be anonymous.
 */

type ActionResult = { error: string } | { ok: true };

function isDesktopProvider(p: string): p is ApiProvider {
  return (DESKTOP_PROVIDERS as string[]).includes(p);
}

async function resolveToolId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tools")
    .select("id")
    .eq("slug", DESKTOP_TOOL_SLUG)
    .maybeSingle();
  return data?.id ?? null;
}

export async function grantDesktopKeyConsent(
  provider: string,
): Promise<ActionResult> {
  const user = await requireUser();

  // An allow-list, not validation theatre: without it this action would happily
  // consent to releasing ANY provider key — including ones the desktop app was
  // never meant to see — to whatever calls desktop-keys next.
  if (!isDesktopProvider(provider)) {
    return { error: "That provider isn't used by this app." };
  }

  const toolId = await resolveToolId();
  if (!toolId) return { error: "That app isn't available right now." };

  const admin = createAdminClient();
  const { error } = await admin.from("desktop_key_consent").upsert(
    {
      user_id: user.id,
      tool_id: toolId,
      provider,
      granted_at: new Date().toISOString(),
      // Re-granting after a revoke clears the revocation rather than leaving a
      // row that is simultaneously granted and revoked.
      revoked_at: null,
    },
    { onConflict: "user_id,tool_id,provider" },
  );
  if (error) return { error: "Couldn't save that. Try again." };

  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_action: "desktop.consent.grant",
    p_entity_type: "tool",
    p_entity_id: toolId,
    p_target_user: user.id,
    p_metadata: { provider },
  });

  revalidatePath("/dashboard/keys/desktop");
  return { ok: true };
}

export async function revokeDesktopKeyConsent(
  provider: string,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!isDesktopProvider(provider)) {
    return { error: "That provider isn't used by this app." };
  }

  const toolId = await resolveToolId();
  if (!toolId) return { error: "That app isn't available right now." };

  // Stamped, not deleted. "You allowed this on the 3rd and revoked it on the
  // 9th" is a fact the member should be able to see later, and a deleted row
  // cannot tell them that.
  const admin = createAdminClient();
  const { error } = await admin
    .from("desktop_key_consent")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("tool_id", toolId)
    .eq("provider", provider);
  if (error) return { error: "Couldn't revoke that. Try again." };

  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_action: "desktop.consent.revoke",
    p_entity_type: "tool",
    p_entity_id: toolId,
    p_target_user: user.id,
    p_metadata: { provider },
  });

  revalidatePath("/dashboard/keys/desktop");
  return { ok: true };
}
