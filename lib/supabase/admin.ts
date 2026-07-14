import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * The service-role client. BYPASSES RLS ENTIRELY.
 *
 * `import "server-only"` makes importing this from a Client Component a BUILD
 * ERROR, not a runtime surprise. That import is the whole point of this file
 * existing separately — do not remove it.
 *
 * Rules for every caller, without exception (CLAUDE.md §13):
 *   1. Derive the user from the session yourself. Never trust a client-supplied
 *      user_id. RLS is not going to catch you here — that is the entire premise.
 *   2. Re-check authorization explicitly (is_admin, can_access_tool).
 *   3. If you only need to read the current user's own rows, you do not need
 *      this. Use lib/supabase/server.ts and let RLS do its job.
 *
 * Note what this client CANNOT do, by design: it cannot decrypt a member's API
 * key. ENCRYPTION_KEY does not exist in this environment. See CLAUDE.md §13.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
