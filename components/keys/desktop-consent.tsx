"use client";

import { KeyRound, Monitor, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel, SectionHeader } from "@/components/ui/panel";
import {
  grantDesktopKeyConsent,
  revokeDesktopKeyConsent,
} from "@/actions/desktop";
import { formatShipDate } from "@/lib/format";
import { PROVIDER_BY_VALUE } from "@/lib/providers";
import type { DesktopConsentRow } from "@/lib/desktop";

function ConsentRow({ row }: { row: DesktopConsentRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const meta = PROVIDER_BY_VALUE[row.provider];

  const act = (grant: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = grant
        ? await grantDesktopKeyConsent(row.provider)
        : await revokeDesktopKeyConsent(row.provider);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex items-start gap-4 border-b border-line px-5 py-4 last:border-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-text-muted [border-top-color:var(--line-strong)]">
        <KeyRound aria-hidden className="size-[18px]" strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-strong text-text">
            {meta?.name ?? row.provider}
          </span>
          {row.granted ? (
            <StatusPill label="allowed" tone="live" dot={false} />
          ) : (
            <StatusPill label="not allowed" tone="faint" dot={false} />
          )}
          {!row.hasKey && (
            <StatusPill label="no key saved" tone="warn" dot={false} />
          )}
        </div>

        {/* The whole point of this screen: what actually happened, in plain
            dates. §12 — say what happened, then what to do. */}
        <p className="mt-1 text-small text-text-muted">
          {!row.hasKey ? (
            <>
              You haven&apos;t saved a {meta?.name ?? row.provider} key yet.{" "}
              <Link
                href={`/dashboard/keys?provider=${row.provider}`}
                className="text-text underline underline-offset-2"
              >
                Add one
              </Link>{" "}
              and the app can use it once you allow it here.
            </>
          ) : row.lastReadAt ? (
            <>
              Last read {formatShipDate(row.lastReadAt)} · {row.readCount}{" "}
              {row.readCount === 1 ? "time" : "times"} in total
            </>
          ) : row.granted ? (
            <>Allowed {row.grantedAt ? formatShipDate(row.grantedAt) : ""} · never read yet</>
          ) : row.revokedAt ? (
            <>Revoked {formatShipDate(row.revokedAt)}</>
          ) : (
            <>The app can&apos;t read this key until you allow it.</>
          )}
        </p>

        {error && (
          <p className="mt-2 text-small text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <Button
        variant={row.granted ? "ghost" : "secondary"}
        size="sm"
        pending={pending}
        onClick={() => act(!row.granted)}
      >
        {row.granted ? "Revoke" : "Allow"}
      </Button>
    </div>
  );
}

export function DesktopConsent({
  toolName,
  rows,
}: {
  toolName: string;
  rows: DesktopConsentRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* The honest version of what allowing this does. It says "leaves this
          server", because it does — and a member deciding whether to allow it
          deserves the real sentence, not a softened one. */}
      <Callout tone="warn" icon={ShieldCheck}>
        Allowing {toolName} sends that key to the app on your computer, where it
        calls the provider directly on your account. That is the one case where a
        stored key leaves this server. Every read is listed below, and you can
        revoke at any time.
      </Callout>

      <Panel flush>
        <div className="border-b border-line px-5 py-4">
          <SectionHeader
            icon={Monitor}
            title={toolName}
            description="A desktop app. It signs in with this account and runs on your own keys."
          />
        </div>
        {rows.map((row) => (
          <ConsentRow key={row.provider} row={row} />
        ))}
      </Panel>
    </div>
  );
}
