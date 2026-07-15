"use server";

import { requireUser } from "@/lib/access";
import { startRunForUser, type StartRunResult } from "@/lib/runner";

/**
 * Start a run. Auth first (§13), then all the checks live in startRunForUser.
 * Returns a run_id in under a second; the run itself finishes in the background
 * and the client watches it over Realtime.
 */
export async function startRun(
  slug: string,
  input: unknown,
): Promise<StartRunResult> {
  const user = await requireUser(`/dashboard/tools/${slug}`);
  return startRunForUser(user, slug, input);
}
