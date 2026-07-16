"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-theme";

/** The member's shareable referral link + a copy button. */
export function ReferralLink({ code }: { code: string }) {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);

  // Build from the current origin so the link works from wherever they are.
  const url = hydrated ? `${window.location.origin}/r/${code}` : `…/r/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is still visible to copy by hand */
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-sunken px-3 py-2 text-mono text-text-muted">
        {url}
      </code>
      <Button variant="secondary" size="sm" onClick={copy} disabled={!hydrated}>
        {copied ? (
          <Check aria-hidden className="size-4 text-live" strokeWidth={1.5} />
        ) : (
          <Copy aria-hidden className="size-4" strokeWidth={1.5} />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
