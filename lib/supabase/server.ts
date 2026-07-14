import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The server client, acting AS THE SIGNED-IN USER. Anon key + their session, so
 * RLS still applies. This is the default for Server Components and for reads
 * inside Server Actions.
 *
 * If you find yourself wanting to bypass RLS here, you want lib/supabase/admin.
 * Reach for it deliberately, not by accident.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to swallow —
            // and it is the documented pattern, not a shrug.
          }
        },
      },
    },
  );
}
