import { Check } from "lucide-react";
import Link from "next/link";

import type { KeyStatus } from "@/lib/keys";
import { cn } from "@/lib/utils";

/**
 * The three-state key chip (DESIGN.md §9). Three states, not two, because a key
 * we've never verified might be a typo, and the member deserves to know that
 * before a run fails on a 401.
 *
 *   verified   → --live, "openai ✓". Static; nothing to do.
 *   unverified → neutral, "openai", no tick, no color (--live means *proven*).
 *                A link to the vault to verify it.
 *   missing    → --warn, "needs: openai". A link to the vault, pre-filtered.
 *                (An 'invalid' key is treated as missing — the run is blocked.)
 */
export type ChipState = "verified" | "unverified" | "missing";

export function chipStateFor(status: KeyStatus | undefined): ChipState {
  if (status === "valid") return "verified";
  if (status === "unverified") return "unverified";
  return "missing"; // no key, or invalid
}

export function KeyChip({
  provider,
  state,
}: {
  provider: string;
  state: ChipState;
}) {
  const base =
    "text-mono-chip inline-flex items-center gap-1 rounded-pill px-2 py-1 transition-colors duration-micro ease-default";

  if (state === "verified") {
    return (
      <span className={cn(base, "bg-live-quiet text-live")}>
        {provider}
        <Check aria-hidden className="size-3" strokeWidth={2} />
      </span>
    );
  }

  if (state === "unverified") {
    return (
      <Link
        href={`/dashboard/keys?provider=${provider}`}
        className={cn(base, "border border-line bg-surface text-text-muted hover:border-line-strong hover:text-text")}
        title="Not verified yet — check it in the vault"
      >
        {provider}
      </Link>
    );
  }

  // missing / invalid
  return (
    <Link
      href={`/dashboard/keys?provider=${provider}`}
      className={cn(base, "bg-warn-quiet text-warn hover:bg-warn/20")}
      title="Connect this key to run the tool"
    >
      needs: {provider}
    </Link>
  );
}
