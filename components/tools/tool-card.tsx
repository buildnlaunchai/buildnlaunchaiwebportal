import { Lock } from "lucide-react";
import Link from "next/link";

import { ProviderChip } from "@/components/tools/provider-chip";
import { StatusPill } from "@/components/tools/status-pill";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import type { ToolCardData } from "@/lib/tools";

/**
 * The most-seen component in the product (DESIGN.md §9). Phase 2 renders its
 * PUBLIC states — locked and coming-soon — for a visitor who is not signed in.
 * The "unlocked" state (a member who can Run) needs the access engine and the
 * runner, so it lands in Phase 4/6. This file is built to grow into that, not
 * to be replaced.
 *
 * §9 is emphatic: the locked card is the exact same card at FULL opacity, name
 * and tagline fully legible. Not blurred, not greyed. Desire needs an object.
 */
export function ToolCard({ tool }: { tool: ToolCardData }) {
  const isComingSoon = tool.status === "coming_soon";
  const isPublicPreview = tool.access_type === "public_preview";

  // The CTA. A visitor is never signed in, so a public_preview tool routes them
  // through sign-in straight to the runner — the 30-second funnel (§10). A
  // members tool routes them to apply. Coming-soon collects intent.
  const cta = isComingSoon
    ? { label: "Notify me", href: "/apply", variant: "secondary" as const }
    : isPublicPreview
      ? {
          label: "Try it free",
          href: `/login?next=/dashboard/tools/${tool.slug}`,
          variant: "primary" as const,
        }
      : { label: "Apply for access", href: "/apply", variant: "secondary" as const };

  return (
    <article className="group relative flex flex-col rounded-md border border-line bg-surface p-5 transition-[border-color,transform] duration-micro ease-default hover:-translate-y-px hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-sm border border-line text-text-muted">
          <ToolIcon name={tool.icon} />
        </span>

        {/* Top-right marker: a lock for gated tools, a status pill for
            coming-soon. §9. */}
        {isComingSoon ? (
          <StatusPill label="coming soon" tone="warn" dot={false} />
        ) : !isPublicPreview ? (
          <Lock aria-hidden className="size-4 text-text-faint" strokeWidth={1.5} />
        ) : null}
      </div>

      <div className="mt-4 flex-1">
        <h3 className="text-h3">
          {/* Stretched link: the whole card is clickable to the detail page,
              but the CTA button below keeps its own destination and stays above
              the overlay. No nested <a>. */}
          <Link
            href={`/tools/${tool.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {tool.name}
          </Link>
        </h3>
        {/* §3: the slug is a machine value, so it is mono. */}
        <p className="text-mono mt-1 text-text-faint">{tool.slug}</p>
        <p className="mt-2 text-small text-text-muted">{tool.tagline}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tool.category && (
          <span className="text-mono-chip rounded-pill bg-elevated px-2 py-1 text-text-muted">
            {tool.category}
          </span>
        )}
        {!isComingSoon && <ProviderChip providers={tool.required_providers} />}
        {!isPublicPreview && !isComingSoon && (
          <span className="text-mono-chip rounded-pill bg-warn-quiet px-2 py-1 text-warn">
            members only
          </span>
        )}
      </div>

      <div className="relative z-10 mt-5">
        <Link href={cta.href} tabIndex={-1}>
          <Button variant={cta.variant} size="sm" className="w-full">
            {cta.label}
          </Button>
        </Link>
      </div>
    </article>
  );
}
