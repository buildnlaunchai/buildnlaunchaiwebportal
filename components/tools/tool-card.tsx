import { Lock } from "lucide-react";
import Link from "next/link";

import { chipStateFor, KeyChip } from "@/components/tools/key-chip";
import { ProviderChip } from "@/components/tools/provider-chip";
import { StatusPill } from "@/components/tools/status-pill";
import { ToolIcon } from "@/components/tools/tool-icon";
import { Button } from "@/components/ui/button";
import type { KeyStatus } from "@/lib/keys";
import type { ToolCardData } from "@/lib/tools";

/**
 * The most-seen component in the product (DESIGN.md §9). §9 is emphatic: the
 * locked card is the exact same card at FULL opacity, name and tagline fully
 * legible. Not blurred, not greyed. Desire needs an object.
 *
 * Two variants:
 *  - "public" (default): what a visitor sees — locked / coming-soon / preview.
 *  - "unlocked": the member dashboard card for a tool they can actually run.
 *    The runner itself is Phase 6; this card just links to it.
 */
export function ToolCard({
  tool,
  variant = "public",
  keyStatuses,
}: {
  tool: ToolCardData;
  variant?: "public" | "unlocked";
  /** provider → key status, for the three-state chip on unlocked cards. */
  keyStatuses?: Record<string, KeyStatus>;
}) {
  const isComingSoon = tool.status === "coming_soon";
  const isPublicPreview = tool.access_type === "public_preview";
  const isUnlocked = variant === "unlocked";

  // The whole card links to the runner when unlocked, to the public page when not.
  const cardHref = isUnlocked
    ? `/dashboard/tools/${tool.slug}`
    : `/tools/${tool.slug}`;

  // The CTA. Unlocked → Run. Otherwise: a public_preview tool routes a visitor
  // through sign-in straight to the runner (the 30-second funnel, §10), a
  // members tool routes them to apply, coming-soon collects intent.
  const cta = isUnlocked
    ? { label: "Run", href: `/dashboard/tools/${tool.slug}`, variant: "primary" as const }
    : isComingSoon
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

        {/* Top-right marker. When unlocked there's no gate to signal. §9. */}
        {isUnlocked ? null : isComingSoon ? (
          <StatusPill label="coming soon" tone="warn" dot={false} />
        ) : !isPublicPreview ? (
          <Lock aria-hidden className="size-4 text-text-faint" strokeWidth={1.5} />
        ) : null}
      </div>

      <div className="mt-4 flex-1">
        <h3 className="text-h3">
          {/* Stretched link: the whole card is clickable, but the CTA button
              below keeps its own destination above the overlay. No nested <a>. */}
          <Link
            href={cardHref}
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
        {/* On an unlocked (member) card we know their key state, so show the
            three-state chip per provider. Elsewhere, the neutral "needs" chip. */}
        {isUnlocked && keyStatuses && tool.required_providers.length > 0 ? (
          tool.required_providers.map((p) => (
            <KeyChip key={p} provider={p} state={chipStateFor(keyStatuses[p])} />
          ))
        ) : !isComingSoon ? (
          <ProviderChip providers={tool.required_providers} />
        ) : null}
        {!isUnlocked && !isPublicPreview && !isComingSoon && (
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
