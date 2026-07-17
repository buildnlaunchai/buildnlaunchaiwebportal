import "server-only";

/**
 * The hub side of the embed token (CLAUDE.md §13, Phase 11).
 *
 * This module does NOT mint anything. It asks the embed-token Edge Function to,
 * forwarding the member's own access token so the function derives identity
 * cryptographically rather than taking Vercel's word for it. Vercel never holds
 * HUB_JWT_PRIVATE_KEY, so nothing here — and nothing that compromises here —
 * can forge a token.
 *
 * Same shape as lib/runner.ts: the work lives in a lib module, the page calls it
 * during render, and every check it depends on is re-run server-side.
 */
import { createClient } from "@/lib/supabase/server";
import type { AuthedUser } from "@/lib/access";

/**
 * The query param the token rides in on, exactly once, before the app swaps it
 * into an httpOnly cookie and redirects to a clean URL.
 *
 * This string is half of a contract with a separately deployed app — it must
 * match HUB_TOKEN_QUERY_PARAM in the app's lib/hub/transport.ts. There is no
 * shared package and no type check spanning the two repos, so changing it here
 * silently means the app never sees a token and every member gets locked state.
 * If it ever has to change: ship the app's side first, which accepts both.
 */
export const HUB_TOKEN_QUERY_PARAM = "hub_token";

export type EmbedToken = {
  token: string;
  /** ISO. The app enforces the token's own exp; this is for the UI to reason about. */
  expiresAt: string;
};

export type MintEmbedTokenResult = EmbedToken | { error: string };

/**
 * Mint an embed token for `user` to open the iframe tool `slug`.
 *
 * The caller must have already established that this user may open this tool —
 * the page does, via can_access_tool. This is not that check being trusted: the
 * Edge Function re-derives access from the engine itself and will refuse. The
 * page's check exists so a denied user sees a locked state instead of a broken
 * iframe, not because the function needs the help.
 */
export async function mintEmbedToken(
  user: AuthedUser,
  slug: string,
): Promise<MintEmbedTokenResult> {
  const supabase = await createClient();

  // getSession() here reads the cookie without revalidating it, which would be
  // wrong as an auth check — and is not one. It is how we obtain the raw access
  // token to forward. The session was already validated by requireUser() (which
  // calls getUser()), and the Edge Function validates this exact token against
  // the auth server before it mints anything. A forged cookie gets a 401 there,
  // not a token.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Your session expired. Sign in again to open this app." };
  }

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/embed-token`,
      {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tool_slug: slug }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (res.status === 403) {
      return { error: "You don't have access to this app." };
    }
    if (!res.ok) {
      // Deliberately vague to the user; the detail goes to the server log. A
      // token minting failure is our problem, not something they can act on.
      console.error(`embed-token: HTTP ${res.status} for ${slug}`);
      return { error: "Couldn't open this app. Try again." };
    }

    const body = (await res.json()) as { token?: string; expires_at?: string };
    if (!body.token || !body.expires_at) {
      console.error(`embed-token: malformed response for ${slug}`);
      return { error: "Couldn't open this app. Try again." };
    }

    return { token: body.token, expiresAt: body.expires_at };
  } catch {
    console.error(`embed-token: unreachable for ${slug}`);
    return { error: "Couldn't reach the token service. Try again." };
  }
}
