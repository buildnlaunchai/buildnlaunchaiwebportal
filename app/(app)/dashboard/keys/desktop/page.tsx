import { notFound } from "next/navigation";

import { DesktopConsent } from "@/components/keys/desktop-consent";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/access";
import { getDesktopVaultState } from "@/lib/desktop";

/**
 * Desktop app permissions (§8, §10).
 *
 * The consent gate in front of supabase/functions/desktop-keys — the only path
 * in the product that sends a plaintext key off our infrastructure. Reads only;
 * both mutations are Server Actions that re-derive the user from the session,
 * because desktop_key_consent has no client write policy.
 *
 * The desktop app deep-links here when it gets `consent_required`, so this page
 * has to make sense cold, to someone who arrived from another application and
 * has no idea what a consent row is.
 */
export default async function DesktopKeysPage() {
  await requireUser("/dashboard/keys/desktop");

  const { toolId, toolName, rows } = await getDesktopVaultState();

  // The seed row is missing or archived — there is no app to grant anything to,
  // and an empty permissions screen would be a puzzle rather than an answer.
  if (!toolId) notFound();

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Desktop app permissions"
        back={{ href: "/dashboard/keys", label: "Key vault" }}
        description="Which of your stored keys this app may read, and every time it has."
      />
      <div className="mt-6">
        <DesktopConsent toolName={toolName} rows={rows} />
      </div>
    </div>
  );
}
