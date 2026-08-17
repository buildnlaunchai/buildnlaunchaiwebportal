import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ApiProvider } from "@/lib/providers";

/**
 * The hub side of the desktop app's key-consent gate.
 *
 * Reads only. Granting and revoking are Server Actions (actions/desktop.ts) on
 * the service-role client, because desktop_key_consent has no client write
 * policy — a client that can write its own consent row is not a consent gate.
 */

/** Contract with supabase/functions/_shared/desktop.ts. Both must agree. */
export const DESKTOP_TOOL_SLUG = "raw-footage-real-story";
export const DESKTOP_PROVIDERS: ApiProvider[] = ["openai", "elevenlabs"];

export type DesktopConsentRow = {
  provider: ApiProvider;
  /** Whether the desktop app may currently read this provider's key. */
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  /** Whether the member actually HAS a key for this provider to release. */
  hasKey: boolean;
  /** Most recent release to the desktop app, ISO, or null. */
  lastReadAt: string | null;
  readCount: number;
};

export type DesktopVaultState = {
  toolId: string | null;
  toolName: string;
  rows: DesktopConsentRow[];
};

/**
 * Whether to surface the desktop-permissions link in the key vault.
 *
 * The access engine decides, not a membership lookup — same answer the desktop
 * app's own licence check gets, so the vault never advertises permissions for
 * an app the member cannot run. On the user's RLS client `can_access_tool`
 * defaults uid to auth.uid(), which is correct here (unlike the Edge Function,
 * where the service role would make it NULL).
 */
export async function canAccessDesktopApp(): Promise<boolean> {
  const supabase = await createClient();

  const { data: tool } = await supabase
    .from("tools")
    .select("id")
    .eq("slug", DESKTOP_TOOL_SLUG)
    .maybeSingle();
  if (!tool) return false;

  const { data } = await supabase.rpc("can_access_tool", { p_tool_id: tool.id });
  return data === true;
}

/**
 * Everything /dashboard/keys/desktop needs, in one pass.
 *
 * RLS does the scoping on all three reads — consent, access log, and keys are
 * each select-own — so there is no user_id filter here to forget. The tool row
 * is public.
 */
export async function getDesktopVaultState(): Promise<DesktopVaultState> {
  const supabase = await createClient();

  const { data: tool } = await supabase
    .from("tools")
    .select("id, name")
    .eq("slug", DESKTOP_TOOL_SLUG)
    .maybeSingle();

  if (!tool) {
    return { toolId: null, toolName: "Raw Footage, Real Story", rows: [] };
  }

  const [{ data: consent }, { data: access }, { data: keys }] = await Promise.all([
    supabase
      .from("desktop_key_consent")
      .select("provider, granted_at, revoked_at")
      .eq("tool_id", tool.id),
    supabase
      .from("desktop_key_access")
      .select("provider, created_at")
      .eq("tool_id", tool.id)
      .order("created_at", { ascending: false }),
    // The public view — no ciphertext, ever (§10).
    supabase.from("user_api_keys_public").select("provider"),
  ]);

  const consentBy = new Map(
    (consent ?? []).map((c) => [c.provider as ApiProvider, c]),
  );
  const heldProviders = new Set(
    (keys ?? []).map((k) => k.provider as ApiProvider),
  );

  const rows: DesktopConsentRow[] = DESKTOP_PROVIDERS.map((provider) => {
    const c = consentBy.get(provider);
    const reads = (access ?? []).filter((a) => a.provider === provider);

    return {
      provider,
      granted: Boolean(c) && c!.revoked_at === null,
      grantedAt: (c?.granted_at as string | null) ?? null,
      revokedAt: (c?.revoked_at as string | null) ?? null,
      hasKey: heldProviders.has(provider),
      // Ordered desc above, so the first row is the most recent.
      lastReadAt: (reads[0]?.created_at as string | undefined) ?? null,
      readCount: reads.length,
    };
  });

  return { toolId: tool.id, toolName: tool.name, rows };
}
