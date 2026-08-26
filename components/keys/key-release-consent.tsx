"use client";

import { KeyRound, Monitor, Puzzle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { grantKeyRelease, revokeKeyRelease } from "@/actions/key-release";
import { formatShipDate } from "@/lib/format";
import { PROVIDER_BY_VALUE } from "@/lib/providers";
import type { ClientKind, KeyReleaseClient, KeyReleaseRow } from "@/lib/key-release";

/**
 * Permissions for external clients — the software allowed to read a member's
 * stored provider keys (§10).
 *
 * THE DISCLOSURE IS KEYED BY `kind`, NOT BY SLUG, and that is the point of the
 * whole screen. A desktop app and a browser extension are not equally safe
 * places to put a key, and a member deciding between them deserves the real
 * difference rather than one sentence stretched to cover both. §10: an
 * over-promise is worse than no promise, to an audience that will work it out.
 */

function ConsentRow({
  slug,
  row,
  creditMode,
}: {
  slug: string;
  row: KeyReleaseRow;
  /**
   * This client is running on platform credit, so the keys endpoint withholds
   * every provider. Allowing is therefore disabled — the grant would be written
   * and never honoured. Revoking stays available, because a member who lapsed
   * into credit may still hold consent granted while their membership was live,
   * and this screen is their only way to withdraw it.
   */
  creditMode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const meta = PROVIDER_BY_VALUE[row.provider];

  const act = (grant: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = grant
        ? await grantKeyRelease(slug, row.provider)
        : await revokeKeyRelease(slug, row.provider);
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
          {creditMode ? (
            row.granted ? (
              <>
                Not in use — this app is running on your credit, so it isn&apos;t
                reading this key. You can revoke the permission anyway.
              </>
            ) : (
              <>
                This app is running on your credit right now, so it doesn&apos;t
                need this key.
              </>
            )
          ) : !row.hasKey ? (
            <>
              You haven&apos;t saved a {meta?.name ?? row.provider} key yet.{" "}
              <Link
                href={`/dashboard/keys?provider=${row.provider}`}
                className="text-text underline underline-offset-2"
              >
                Add one
              </Link>{" "}
              and this app can use it once you allow it here.
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
            <>This app can&apos;t read this key until you allow it.</>
          )}
        </p>

        {error && (
          <p className="mt-2 text-small text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* In credit mode an un-granted row has no action at all: "Allow" would be
          refused by the Server Action, and rendering a button whose only outcome
          is an error message is worse than rendering nothing. A granted row keeps
          its Revoke. */}
      {creditMode && !row.granted ? null : (
        <Button
          variant={row.granted ? "ghost" : "secondary"}
          size="sm"
          pending={pending}
          onClick={() => act(!row.granted)}
        >
          {row.granted ? "Revoke" : "Allow"}
        </Button>
      )}
    </div>
  );
}

const KIND_ICON: Record<ClientKind, typeof Monitor> = {
  desktop: Monitor,
  extension: Puzzle,
};

const KIND_SUBTITLE: Record<ClientKind, string> = {
  desktop: "A desktop app. It signs in with this account and runs on your own keys.",
  extension:
    "A Chrome extension. It signs in with this account and runs on your own keys.",
};

/**
 * The honest sentence about where a released key goes, per kind of software.
 *
 * Both open the same way — one line naming exactly what allowing does — because
 * that is the decision. What follows differs, and is allowed to differ at
 * length: the extension's disclosure is longer because there is genuinely more
 * that a member should know, and padding the desktop's to match would be filler
 * (§12) rather than balance.
 */
function Disclosure({ kind, name }: { kind: ClientKind; name: string }) {
  if (kind === "desktop") {
    return (
      <Callout tone="warn" icon={ShieldCheck}>
        Allowing {name} sends that key to the app on your computer, where it calls
        the provider directly on your account. It is one of two places in this
        product where a stored key leaves this server. Every read is listed below,
        and you can revoke at any time.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="warn" icon={ShieldCheck}>
        Allowing {name} sends that key to an extension running inside your
        browser, where it calls the provider directly on your account. It is one
        of two places in this product where a stored key leaves this server.
      </Callout>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-4 [border-top-color:var(--line-strong)]">
        <p className="text-body-strong text-text">
          What&apos;s different about an extension
        </p>
        <p className="text-small text-text-muted">
          A browser extension is a weaker place to keep a key than a desktop app.
          Three differences are worth reading once, before you decide.
        </p>

        <ul className="flex flex-col gap-3">
          <li className="text-small text-text-muted">
            <span className="text-text">It runs alongside the pages you visit.</span>{" "}
            Chrome keeps extension code and page code apart. That separation is
            Chrome&apos;s guarantee, not mine, and not something I can audit for
            you.
          </li>
          <li className="text-small text-text-muted">
            <span className="text-text">It updates itself silently.</span> A new
            version arrives through the Chrome Web Store without you agreeing to
            anything. That is why the list of keys {name} may ask for is enforced
            on this server rather than inside the extension — a new version can
            change the extension, it can&apos;t change that list.
          </li>
          <li className="text-small text-text-muted">
            <span className="text-text">Its code is readable.</span> An extension
            is JavaScript in a folder on your machine. Nothing about it resists
            inspection, by you or by anyone else who can reach your computer.
          </li>
        </ul>

        <p className="text-small text-text-muted">
          <span className="text-text">
            {name} holds the key in memory only, for as long as it&apos;s working,
            and never writes it to browser storage.
          </span>{" "}
          Close the browser and the key is gone. A copied profile folder contains
          no key.
        </p>

        <p className="text-small text-text-muted">
          That last one is a commitment in the extension&apos;s code, and this
          server can&apos;t enforce it — no server could. It&apos;s written here
          so that if it ever changes, it changes something you were told, rather
          than something nobody wrote down.
        </p>

        <p className="text-small text-text-muted">
          Every read is listed below, and you can revoke this at any time.
        </p>
      </div>
    </div>
  );
}

function ClientSection({ client }: { client: KeyReleaseClient }) {
  const Icon = KIND_ICON[client.kind];
  const creditMode = client.mode === "credit";

  return (
    // The slug is the anchor id: <client>-keys returns
    // /dashboard/keys/permissions#<slug> as its consent_url, so this element is
    // half of a contract with shipped software. scroll-mt clears the app shell's
    // top bar, so an anchored landing doesn't put the heading under it.
    <section id={client.slug} className="scroll-mt-24">
      <div className="flex flex-col gap-6">
        <Disclosure kind={client.kind} name={client.name} />

        <Panel flush>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader
              icon={Icon}
              title={client.name}
              description={
                creditMode
                  ? "Running on your credit. It doesn't read your keys in this mode."
                  : KIND_SUBTITLE[client.kind]
              }
            />
          </div>
          {client.rows.map((row) => (
            <ConsentRow
              key={row.provider}
              slug={client.slug}
              row={row}
              creditMode={creditMode}
            />
          ))}
        </Panel>
      </div>
    </section>
  );
}

export function KeyReleaseConsent({ clients }: { clients: KeyReleaseClient[] }) {
  return (
    <div className="flex flex-col gap-10">
      {clients.map((client) => (
        <ClientSection key={client.slug} client={client} />
      ))}
    </div>
  );
}
