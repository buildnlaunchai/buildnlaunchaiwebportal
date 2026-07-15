import "server-only";

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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_api_keys_public")
    .select("*")
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
