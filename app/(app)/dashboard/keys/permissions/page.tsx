import { notFound } from "next/navigation";

import { KeyReleaseConsent } from "@/components/keys/key-release-consent";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/access";
import { getKeyReleaseState } from "@/lib/key-release";

/**
 * App permissions (§8, §10).
 *
 * The consent gate in front of supabase/functions/<client>-keys — the only paths
 * in the product that send a plaintext key off our infrastructure. Reads only;
 * both mutations are Server Actions that re-derive the user from the session,
 * because key_release_consent has no client write policy.
 *
 * ONE PAGE FOR EVERY EXTERNAL CLIENT, not one page each. The vault already
 * linked to a single desktop page behind a conditional; with two clients that
 * becomes two conditional links, and with three it becomes a menu. A member
 * thinks "what can read my keys", which is one question with a list for an
 * answer.
 *
 * Both clients deep-link here when they get `consent_required`, so this page has
 * to make sense cold, to someone who arrived from other software and has no idea
 * what a consent row is. Each section's id is the client's slug — that anchor is
 * half of a contract with shipped software (see key-release-consent.tsx).
 */
export default async function KeyPermissionsPage() {
  await requireUser("/dashboard/keys/permissions");

  const clients = await getKeyReleaseState();

  // No client this member can run — there is nothing to grant anything to, and
  // an empty permissions screen would be a puzzle rather than an answer.
  if (clients.length === 0) notFound();

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="App permissions"
        back={{ href: "/dashboard/keys", label: "Key vault" }}
        description="Which of your stored keys each app may read, and every time it has."
      />
      <div className="mt-6">
        <KeyReleaseConsent clients={clients} />
      </div>
    </div>
  );
}
