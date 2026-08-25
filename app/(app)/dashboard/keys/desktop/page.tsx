import { redirect } from "next/navigation";

/**
 * The old desktop-only permissions route. It now redirects to the generalised
 * page, anchored at the desktop app's own section.
 *
 * ⚠️  THIS ROUTE MUST KEEP RESOLVING. FOREVER, OR UNTIL NO INSTALL IN THE FIELD
 *     STILL POINTS AT IT.
 *
 * supabase/functions/desktop-keys returns this path as `consent_url` on every
 * withheld key slot, and a shipped desktop binary renders whatever URL it is
 * given. Installs already out there cannot be updated retroactively, so deleting
 * this file would turn "grant permission" into a 404 for exactly the members who
 * most need to reach the page — the ones whose key release is currently blocked.
 *
 * A 307 rather than a permanent redirect: 308 is cached by browsers
 * indefinitely, and this route has already moved once.
 */
export default async function DesktopKeysRedirect() {
  redirect("/dashboard/keys/permissions#raw-footage-real-story");
}
