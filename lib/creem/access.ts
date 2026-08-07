import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The single access-grant / access-revoke entry point for Creem, and the exact
 * counterpart of what app/api/webhooks/paddle/route.ts does with
 * process_paddle_event.
 *
 * The important thing to understand about this file: it contains NO business
 * logic. Deciding whether an event grants or revokes, claiming the event id so a
 * retry can't double-process, and writing the membership all happen inside ONE
 * Postgres transaction in process_creem_event (see the migration). That is
 * deliberate and it is the whole idempotency story — a claim made in TypeScript
 * and a write made afterwards is exactly the race the Paddle RPC was written to
 * close. Everything here is shape-mapping: Creem's webhook entities in, four
 * scalars out.
 *
 * Consequently there is nothing here to keep in sync with the Paddle route
 * except the RPC name. Do not add rules to this file. If a new Creem event type
 * should grant or revoke, it belongs in the SQL, alongside the others.
 */

type Metadata = Record<string, string | number | null> | null | undefined;

/** Creem's entity fields are frequently `Entity | string` (expanded or just an id). */
type MaybeExpanded = string | { id?: string; metadata?: Metadata } | null | undefined;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pull our profiles.id out of a Creem entity's metadata.
 *
 * app/api/checkout/route.ts writes it as `referenceId`, derived server-side from
 * the Supabase session — never from the client. `userId` is accepted as a
 * fallback only because it is the other name Creem's own docs use for the same
 * idea, and a mismatch here costs a membership.
 *
 * A non-uuid is normalised to null rather than passed through: the RPC's
 * p_user_id is typed `uuid`, so a junk value would raise, become a 500, and put
 * Creem into a retry loop that can never succeed. Null instead lets the RPC
 * record the event and return 'no_user' — visible in the logs, and terminal.
 */
export function userIdFromMetadata(metadata: Metadata): string | null {
  const raw = metadata?.referenceId ?? metadata?.userId ?? metadata?.user_id;
  if (typeof raw !== "string" || !UUID_RE.test(raw)) return null;
  return raw;
}

/** Resolve an id from a field that may be an expanded entity or a bare id string. */
export function idOf(value: MaybeExpanded): string | null {
  if (typeof value === "string") return value || null;
  return value?.id ?? null;
}

/** Metadata from a field that may be an expanded entity or a bare id string. */
export function metadataOf(value: MaybeExpanded): Metadata {
  return typeof value === "string" ? null : value?.metadata;
}

export type CreemEventResult = "processed" | "deduped" | "no_user";

/**
 * Claim the event and apply its membership effect, atomically.
 *
 * Throws on an RPC error so the route can return a non-2xx and let Creem retry —
 * the claim rolls back with the transaction, so the retry re-runs cleanly.
 */
export async function processCreemEvent(params: {
  eventId: string;
  eventType: string;
  userId: string | null;
  subscriptionId: string | null;
}): Promise<CreemEventResult> {
  const admin = createAdminClient();

  // The p_user_id / p_subscription_id params are nullable in the SQL (uuid/text,
  // no default) — passing null is the intended path for an event that carries
  // neither — but Supabase codegen types params-without-a-default as required
  // strings, so the two nullable args are cast to bridge that quirk. Same cast,
  // same reason, as app/api/webhooks/paddle/route.ts.
  const { data, error } = await admin.rpc("process_creem_event", {
    p_event_id: params.eventId,
    p_event_type: params.eventType,
    p_user_id: params.userId as string,
    p_subscription_id: params.subscriptionId as string,
  });

  if (error) {
    throw new Error(`process_creem_event failed: ${error.message}`);
  }

  // Codegen types the RPC's return as plain `string` (Postgres `returns text`),
  // so the narrowing to the three values the function can actually return is
  // ours to assert. The union is defined above and the SQL is its only source.
  return (data as CreemEventResult) ?? "processed";
}
