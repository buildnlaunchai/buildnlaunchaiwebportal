import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser client. Anon key only, RLS applies to everything it touches.
 *
 * This is the client that a member's own browser drives, so assume an attacker
 * can call anything it can call. That is exactly why the schema does not rely
 * on "we select the right columns" for safety — see CLAUDE.md §7.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
