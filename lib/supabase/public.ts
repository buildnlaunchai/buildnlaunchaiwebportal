import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * A cookieless anon client for PUBLIC data — the catalog, tool pages, the
 * shipping log. Reads as the `anon` role, so RLS returns exactly the public
 * rows, and nothing more.
 *
 * Why separate from lib/supabase/server.ts: that one reads cookies to attach
 * the session, which (a) makes the page dynamic and (b) can't run inside
 * generateStaticParams, which has no request. Public tool data is identical for
 * every visitor, so it needs no session — and using this client lets the
 * marketing pages be statically generated and cached.
 *
 * Do NOT use this for anything that depends on who is asking. Per-user reads go
 * through lib/supabase/server.ts so RLS sees the session.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
