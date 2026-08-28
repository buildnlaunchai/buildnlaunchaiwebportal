import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { fetchWithSignal } from "@/lib/timeout";

/**
 * The server client, acting AS THE SIGNED-IN USER. Anon key + their session, so
 * RLS still applies. This is the default for Server Components and for reads
 * inside Server Actions.
 *
 * If you find yourself wanting to bypass RLS here, you want lib/supabase/admin.
 * Reach for it deliberately, not by accident.
 */
export async function createClient(options?: { signal?: AbortSignal }) {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // A deadline is only real if it can cancel. Without this the request keeps
      // the serverless invocation alive after the code has given up on it — see
      // lib/timeout.ts, where a 2.5s timeout produced a 61-second response.
      ...(options?.signal
        ? { global: { fetch: fetchWithSignal(options.signal) } }
        : {}),
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
