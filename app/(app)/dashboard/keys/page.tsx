import { KeyVault } from "@/components/keys/key-vault";
import { requireUser } from "@/lib/access";
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

  const [keys, { provider }] = await Promise.all([getMyKeys(), searchParams]);

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
    </div>
  );
}
