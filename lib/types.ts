import type { Database } from "@/lib/database.types";

/**
 * Row types come from the database, never from a hand-written interface
 * (CLAUDE.md §15). Regenerate after every migration:
 *
 *   pnpm db:types
 *
 * If you find yourself typing `type Profile = { id: string; ... }`, stop — the
 * schema has already told you the answer and a second copy of it will drift.
 */

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Database["public"]["Enums"]["user_role"];
