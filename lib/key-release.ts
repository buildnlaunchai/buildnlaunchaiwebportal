import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ApiProvider } from "@/lib/providers";

/**
 * The hub side of the key-release consent gate — the permission a member gives
 * an EXTERNAL CLIENT to read one of their stored provider keys.
 *
 * Reads only. Granting and revoking are Server Actions (actions/key-release.ts)
 * on the service-role client, because key_release_consent has no client write
 * policy — a browser that can write its own consent row is not a consent gate.
 *
 * Replaces lib/desktop.ts, which answered the same questions for exactly one
 * client. Nothing about the desktop app's behaviour changed here; it simply
 * stopped being the only entry in the list.
 */

/**
 * Which kind of software this is. It is not decoration: it decides which
 * disclosure a member reads before allowing a key release, and a desktop app and
 * a browser extension do not deserve the same one.
 */
export type ClientKind = "desktop" | "extension";

export type ExternalClientMeta = {
  slug: string;
  kind: ClientKind;
  /**
   * The providers this client may ever ask for.
   *
   * Contract with supabase/functions/_shared/clients/<slug>.ts. BOTH MUST AGREE,
   * and nothing enforces that at compile time — the Edge Functions are Deno and
   * cannot import from lib/, which is why the list exists twice at all. The
   * verify script asserts the two halves match; if you edit one, edit the other.
   *
   * The Deno half is the one that actually gates a release. This half only
   * decides which switches a member is shown, and which ones the Server Action
   * will accept.
   */
  providers: ApiProvider[];
};

/**
 * Every external client the product has. Two, today.
 *
 * A registry rather than a lookup on `tools`: which software may be handed a
 * decrypted key is a decision made in version control, not a row an admin can
 * edit. Adding an entry here is a deliberate act with a diff attached.
 */
export const EXTERNAL_CLIENTS: ExternalClientMeta[] = [
  {
    slug: "raw-footage-real-story",
    kind: "desktop",
    providers: ["openai", "elevenlabs"],
  },
  {
    slug: "upworkpilot",
    kind: "extension",
    providers: ["openai"],
  },
];

const CLIENT_SLUGS = EXTERNAL_CLIENTS.map((c) => c.slug);

export function externalClientBySlug(slug: string): ExternalClientMeta | null {
  return EXTERNAL_CLIENTS.find((c) => c.slug === slug) ?? null;
}

export type KeyReleaseRow = {
  provider: ApiProvider;
  /** Whether this client may currently read this provider's key. */
  granted: boolean;
  grantedAt: string | null;
  revokedAt: string | null;
  /** Whether the member actually HAS a key for this provider to release. */
  hasKey: boolean;
  /** Most recent release to this client, ISO, or null. */
  lastReadAt: string | null;
  readCount: number;
};

export type KeyReleaseClient = ExternalClientMeta & {
  toolId: string;
  /** From the `tools` row, so the screen calls it whatever the catalog calls it. */
  name: string;
  rows: KeyReleaseRow[];
};

/**
 * The clients this member can actually open, with their consent state.
 *
 * Only accessible clients are returned. A permissions panel for software you
 * cannot run is a puzzle, not a feature — and worse, it invites a member to
 * grant a release that would never be honoured.
 *
 * On the user's RLS client `can_access_tool` defaults uid to auth.uid(), which
 * is correct here — unlike the Edge Functions, where the service role makes it
 * NULL and the subject must be passed explicitly.
 *
 * All three consent reads are scoped by RLS (select-own), so there is no user_id
 * filter here to forget. They are fetched once for every client and grouped in
 * memory rather than per client, so adding a third client adds no round trips.
 */
export async function getKeyReleaseState(): Promise<KeyReleaseClient[]> {
  const supabase = await createClient();

  const { data: tools } = await supabase
    .from("tools")
    .select("id, name, slug")
    .in("slug", CLIENT_SLUGS);

  if (!tools || tools.length === 0) return [];

  const accessible = (
    await Promise.all(
      tools.map(async (t) => {
        const { data } = await supabase.rpc("can_access_tool", {
          p_tool_id: t.id,
        });
        return data === true ? t : null;
      }),
    )
  ).filter((t): t is NonNullable<typeof t> => t !== null);

  if (accessible.length === 0) return [];

  const toolIds = accessible.map((t) => t.id);

  const [{ data: consent }, { data: releases }, { data: keys }] = await Promise.all([
    supabase
      .from("key_release_consent")
      .select("tool_id, provider, granted_at, revoked_at")
      .in("tool_id", toolIds),
    supabase
      .from("key_release_log")
      .select("tool_id, provider, created_at")
      .in("tool_id", toolIds)
      .order("created_at", { ascending: false }),
    // The public view — no ciphertext, ever (§10).
    supabase.from("user_api_keys_public").select("provider"),
  ]);

  const heldProviders = new Set(
    (keys ?? []).map((k) => k.provider as ApiProvider),
  );

  // Preserve EXTERNAL_CLIENTS' order rather than the database's, so the screen
  // does not silently reorder itself when a tool row is edited.
  return EXTERNAL_CLIENTS.flatMap((meta) => {
    const tool = accessible.find((t) => t.slug === meta.slug);
    if (!tool) return [];

    const rows: KeyReleaseRow[] = meta.providers.map((provider) => {
      const c = (consent ?? []).find(
        (r) => r.tool_id === tool.id && r.provider === provider,
      );
      const reads = (releases ?? []).filter(
        (r) => r.tool_id === tool.id && r.provider === provider,
      );

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

    return [{ ...meta, toolId: tool.id, name: tool.name, rows }];
  });
}

/**
 * Whether to surface the permissions link in the key vault at all.
 *
 * Deliberately cheaper than getKeyReleaseState(): the vault needs a boolean for
 * one link, not three joins' worth of consent history.
 */
export async function canAccessAnyExternalClient(): Promise<boolean> {
  const supabase = await createClient();

  const { data: tools } = await supabase
    .from("tools")
    .select("id")
    .in("slug", CLIENT_SLUGS);
  if (!tools || tools.length === 0) return false;

  const verdicts = await Promise.all(
    tools.map(async (t) => {
      const { data } = await supabase.rpc("can_access_tool", { p_tool_id: t.id });
      return data === true;
    }),
  );
  return verdicts.some(Boolean);
}
