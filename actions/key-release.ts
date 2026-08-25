"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/access";
import { externalClientBySlug } from "@/lib/key-release";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ApiProvider } from "@/lib/providers";

/**
 * Consent for an external client to read a member's stored provider key.
 *
 * This is the gate in front of the only two paths in the product that send a
 * plaintext key outside our infrastructure (supabase/functions/desktop-keys and
 * supabase/functions/upworkpilot-keys). So it holds to the §13 rules exactly:
 *
 *   - The user is re-derived from the session. `userId` is never a parameter,
 *     because a consent action that accepts a subject is a consent action an
 *     attacker can use to consent on someone else's behalf.
 *   - The write uses the service-role client, because key_release_consent has
 *     no client write policy — deliberately. A member granting consent through
 *     this action is a decision; a browser writing its own consent row is not.
 *   - The audit entry is written on the USER's client, not the service-role
 *     one, so log_audit()'s auth.uid() resolves to the person who acted. On the
 *     service-role client it would be NULL and the trail would be anonymous.
 *
 * Replaces actions/desktop.ts. The one behavioural change is the access check on
 * grant — see below.
 */

type ActionResult = { error: string } | { ok: true };

/**
 * Resolve (client, provider) or explain why not.
 *
 * The provider allow-list is an allow-list, not validation theatre: without it
 * these actions would happily consent to releasing ANY provider key — including
 * ones the client was never meant to see — to whatever calls its keys endpoint
 * next. It is checked against THAT CLIENT's list, so allowing the desktop app to
 * read ElevenLabs never implies the extension may.
 */
async function resolve(
  slug: string,
  rawProvider: string,
): Promise<{ error: string } | { toolId: string; provider: ApiProvider }> {
  const client = externalClientBySlug(slug);
  if (!client) return { error: "That app isn't available right now." };

  // find(), not includes(): this both checks membership AND narrows the caller's
  // untrusted string to ApiProvider, so the value written to the enum column is
  // one the registry vouched for rather than one a cast waved through.
  const provider = client.providers.find((p) => p === rawProvider);
  if (!provider) {
    return { error: "That provider isn't used by this app." };
  }

  const supabase = await createClient();
  const { data: tool } = await supabase
    .from("tools")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!tool) return { error: "That app isn't available right now." };

  return { toolId: tool.id, provider };
}

export async function grantKeyRelease(
  slug: string,
  provider: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const r = await resolve(slug, provider);
  if ("error" in r) return r;

  // Granting requires that the member can actually open this client. Consent
  // for software you cannot run is a row that can never be honoured, and it
  // would make the permissions screen claim a release is possible when the keys
  // endpoint would refuse it anyway.
  //
  // On the user's own RLS client, can_access_tool defaults uid to auth.uid(),
  // which is the subject we want here.
  const supabase = await createClient();
  const { data: canAccess } = await supabase.rpc("can_access_tool", {
    p_tool_id: r.toolId,
  });
  if (canAccess !== true) {
    return { error: "You don't have access to that app." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("key_release_consent").upsert(
    {
      user_id: user.id,
      tool_id: r.toolId,
      provider: r.provider,
      granted_at: new Date().toISOString(),
      // Re-granting after a revoke clears the revocation rather than leaving a
      // row that is simultaneously granted and revoked.
      revoked_at: null,
    },
    { onConflict: "user_id,tool_id,provider" },
  );
  if (error) return { error: "Couldn't save that. Try again." };

  await supabase.rpc("log_audit", {
    p_action: "key_release.consent.grant",
    p_entity_type: "tool",
    p_entity_id: r.toolId,
    p_target_user: user.id,
    p_metadata: { client: slug, provider: r.provider },
  });

  revalidatePath("/dashboard/keys/permissions");
  return { ok: true };
}

export async function revokeKeyRelease(
  slug: string,
  provider: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const r = await resolve(slug, provider);
  if ("error" in r) return r;

  // NO ACCESS CHECK HERE, and that asymmetry is deliberate.
  //
  // Revocation is the safety action. A member whose membership lapsed, or who
  // was suspended, would fail can_access_tool — and locking them out of
  // withdrawing a permission they already granted, over their own API key, is
  // exactly backwards. Taking a permission away is always allowed; only giving
  // one requires standing.
  const admin = createAdminClient();
  // Stamped, not deleted. "You allowed this on the 3rd and revoked it on the
  // 9th" is a fact the member should be able to see later, and a deleted row
  // cannot tell them that.
  const { error } = await admin
    .from("key_release_consent")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("tool_id", r.toolId)
    .eq("provider", r.provider);
  if (error) return { error: "Couldn't revoke that. Try again." };

  const supabase = await createClient();
  await supabase.rpc("log_audit", {
    p_action: "key_release.consent.revoke",
    p_entity_type: "tool",
    p_entity_id: r.toolId,
    p_target_user: user.id,
    p_metadata: { client: slug, provider: r.provider },
  });

  revalidatePath("/dashboard/keys/permissions");
  return { ok: true };
}
