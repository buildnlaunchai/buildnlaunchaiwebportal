import "server-only";

import { getUser } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

/**
 * The client's ONLY window onto stored keys — the public view, which carries no
 * ciphertext (CLAUDE.md §10). Writes never happen here: save/verify/delete go
 * through the key-vault Edge Function so the plaintext never transits Vercel.
 */
export type KeyMeta =
  Database["public"]["Views"]["user_api_keys_public"]["Row"];

export type KeyStatus = Database["public"]["Enums"]["key_status"];

export async function getMyKeys(): Promise<KeyMeta[]> {
  // FILTER BY OWNER EXPLICITLY. Do not go back to relying on RLS here.
  //
  // This query used to have no user_id filter, on the reasoning that a
  // select-own policy already scopes it. That reasoning is sound for a table
  // with ONE policy and wrong for this one: Postgres combines PERMISSIVE
  // policies with OR, and user_api_keys carried a second policy granting every
  // row to an admin. The predicate an admin got was therefore
  // `user_id = auth.uid() OR is_admin()` — every member's key metadata, listed
  // on a member-facing page, with Verify and Delete buttons beside rows the
  // caller did not own.
  //
  // The offending policy is gone (20260825140000), so this filter is belt AND
  // braces. It stays anyway: a query that states its own scope cannot be
  // re-broken by a policy someone adds later for a good reason.
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_api_keys_public")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** provider → status, for computing the three-state key chip on tool cards. */
export async function getMyKeyStatusByProvider(): Promise<
  Record<string, KeyStatus>
> {
  const keys = await getMyKeys();
  const map: Record<string, KeyStatus> = {};
  for (const k of keys) {
    if (k.provider && k.status) map[k.provider] = k.status;
  }
  return map;
}
