import { Monitor } from "lucide-react";
import Link from "next/link";

import { KeyVault } from "@/components/keys/key-vault";
import { requireUser } from "@/lib/access";
import { canAccessDesktopApp } from "@/lib/desktop";
import { getMyKeys } from "@/lib/keys";
import { PROVIDER_BY_VALUE } from "@/lib/providers";

/**
 * The key vault (§8, §10). The page reads key METADATA only (the public view,
 * no ciphertext). Every mutation happens in the browser against the key-vault
 * Edge Function, so a plaintext key never passes through this server.
 */
export default async function KeysPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  await requireUser("/dashboard/keys");

  const [keys, { provider }, hasDesktopApp] = await Promise.all([
    getMyKeys(),
    searchParams,
    canAccessDesktopApp(),
  ]);

  // Deep-link target from a tool card's "needs: openai" chip.
  const preselect =
    provider && PROVIDER_BY_VALUE[provider] ? provider : undefined;

  return (
    <div className="max-w-[720px]">
      <p className="text-small text-text-muted">
        Connect the provider keys your tools need. Add one, verify it, and it&apos;s
        ready — you can replace or remove it any time.
      </p>
      <div className="mt-6">
        <KeyVault keys={keys} preselect={preselect} />
      </div>

      {/* Only for members who actually have the desktop app: a permissions link
          for software you can't run is a puzzle, not a feature. */}
      {hasDesktopApp && (
        <Link
          href="/dashboard/keys/desktop"
          className="mt-6 flex items-center gap-3 rounded-lg border border-line bg-surface px-5 py-4 transition-colors duration-micro ease-default hover:bg-elevated [border-top-color:var(--line-strong)]"
        >
          <Monitor
            aria-hidden
            className="size-[18px] shrink-0 text-text-muted"
            strokeWidth={1.5}
          />
          <span className="min-w-0">
            <span className="block text-body-strong text-text">
              Desktop app permissions
            </span>
            <span className="block text-small text-text-muted">
              Choose which keys the desktop app may read, and see every time it
              has.
            </span>
          </span>
        </Link>
      )}
    </div>
  );
}
