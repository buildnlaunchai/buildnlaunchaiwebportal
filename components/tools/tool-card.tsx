import { ArrowRight, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { chipStateFor, type ChipState } from "@/components/tools/key-chip";
import { NotifyMeButton } from "@/components/tools/notify-me-button";
import { ToolIcon } from "@/components/tools/tool-icon";
import type { KeyStatus } from "@/lib/keys";
import type { ToolCardData } from "@/lib/tools";
import { cn } from "@/lib/utils";

/**
 * The canonical tool card (DESIGN.md §9). ONE component, reused everywhere a tool
 * is listed — dashboard, /tools, search, future listings. Only the data and the
 * available action change with permission and state; the visual system —
 * hierarchy, icon tile, footer, borders, hover — is constant across every state.
 *
 * §9 is still emphatic: a locked card is the SAME card at full opacity, name and
 * tagline fully legible. Not blurred, not greyed. Desire needs an object.
 *
 * Calm tier (§ two intensities): navy surface, a light-catching top edge, an
 * icon tile that warms to cobalt on hover, and a hairline footer that carries
 * key-state and a single quiet lit action. No glass, no glow — the accent lives
 * on interaction, so a grid of these reads calm at rest.
 */
export function ToolCard({
  tool,
  variant = "public",
  keyStatuses,
  running = false,
}: {
  tool: ToolCardData;
  variant?: "public" | "unlocked";
  /** provider → key status, for the three-state key summary on unlocked cards. */
  keyStatuses?: Record<string, KeyStatus>;
  /** The member has a run in flight for this tool (dashboard may set this). */
  running?: boolean;
}) {
  const isComingSoon = tool.status === "coming_soon";
  const isMaintenance = tool.status === "maintenance";
  const isPublicPreview = tool.access_type === "public_preview";
  const isUnlocked = variant === "unlocked";
  const isIframe = tool.runtime === "iframe";
  const isLocked = !isUnlocked && !isPublicPreview && !isComingSoon;

  const cardHref = isUnlocked
    ? `/dashboard/tools/${tool.slug}`
    : `/tools/${tool.slug}`;

  // ---- the state badge (top-right). One slot, priority-ordered. ----
  const badge = running
    ? { label: "running", tone: "accent" as const, dot: true, pulse: true }
    : isComingSoon
      ? { label: "soon", tone: "warn" as const, dot: true }
      : isMaintenance
        ? { label: "maintenance", tone: "warn" as const, dot: true }
        : isIframe
          ? { label: "app", tone: "neutral" as const }
          : tool.category
            ? { label: tool.category, tone: "neutral" as const }
            : null;

  // ---- the footer meta (left). A single dot + label, consistent everywhere. ----
  const meta = footerMeta({
    tool,
    isUnlocked,
    isLocked,
    isComingSoon,
    isMaintenance,
    keyStatuses,
  });

  // ---- the footer action (right). One quiet lit affordance. ----
  const action: { label: string; href?: string } | null = running
    ? { label: "View run", href: cardHref }
    : isMaintenance
      ? { label: "In maintenance" } // disabled, no href
      : isComingSoon
        ? null // the NotifyMeButton renders here instead
        : isUnlocked
          ? { label: isIframe ? "Open" : "Run", href: cardHref }
          : isPublicPreview
            ? { label: "Try it free", href: `/login?next=/dashboard/tools/${tool.slug}` }
            : { label: "View", href: `/tools/${tool.slug}` };

  return (
    <article className="group relative flex min-h-[224px] flex-col overflow-hidden rounded-[14px] border border-line bg-surface p-5 transition-[border-color,transform,box-shadow] duration-micro ease-default [border-top-color:var(--line-strong)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_20px_44px_-26px_rgba(60,140,50,0.55)]">
      {tool.cover_image_url ? (
        // cover thumbnail — full-bleed 16:9 banner, badge overlaid, no icon tile
        <div className="relative -mx-5 -mt-5 mb-4 aspect-[16/9] overflow-hidden border-b border-line bg-elevated">
          <Image
            src={tool.cover_image_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover"
          />
          {badge && (
            <div className="pointer-events-none absolute right-3 top-3">
              <Badge {...badge} />
            </div>
          )}
        </div>
      ) : (
        // no cover — the original icon tile + badge header
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex size-[38px] items-center justify-center rounded-[10px] border transition-colors duration-micro ease-default",
              "border-line bg-elevated text-text-muted",
              "group-hover:border-[color:rgba(200,242,79,0.4)] group-hover:bg-accent-quiet group-hover:text-accent",
            )}
          >
            <ToolIcon name={tool.icon} className="size-[19px]" />
          </span>
          {badge && <Badge {...badge} />}
        </div>
      )}

      {/* name / slug / tagline */}
      <h3 className={cn("text-h3", !tool.cover_image_url && "mt-4")}>
        {/* Stretched link: the whole card is the target. The interactive footer
            action (NotifyMe) sits above the overlay with z-10. No nested <a>. */}
        <Link
          href={cardHref}
          className="after:absolute after:inset-0 after:content-['']"
        >
          {tool.name}
        </Link>
      </h3>
      <p className="text-mono mt-1 text-text-faint">{tool.slug}</p>
      <p className="mt-2 text-small text-text-muted">{tool.tagline}</p>

      <div className="min-h-[14px] flex-1" />

      {/* footer: hairline, then meta + action */}
      <div className="-mx-5 h-px bg-line" />
      <div className="flex items-center justify-between gap-3 pt-3.5">
        {meta}
        <div className="relative z-10 shrink-0">
          {isComingSoon ? (
            <NotifyMeButton toolId={tool.id} compact />
          ) : action?.href ? (
            <Link
              href={action.href}
              tabIndex={-1}
              className="inline-flex items-center gap-1.5 text-body-strong text-text-muted transition-colors duration-micro ease-default group-hover:text-accent"
            >
              {action.label}
              <ArrowRight
                aria-hidden
                className="size-[15px] transition-transform duration-micro ease-default group-hover:translate-x-0.5"
                strokeWidth={1.8}
              />
            </Link>
          ) : (
            // maintenance — disabled, no navigation
            <span className="text-body-strong text-text-faint">{action?.label}</span>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---- the state badge: neutral or a semantic tone, one consistent shape ---- */
function Badge({
  label,
  tone,
  dot = false,
  pulse = false,
}: {
  label: string;
  tone: "neutral" | "warn" | "accent";
  dot?: boolean;
  pulse?: boolean;
}) {
  const tones = {
    neutral: "border border-line bg-elevated text-text-muted",
    warn: "bg-warn-quiet text-warn",
    accent: "bg-accent-quiet text-accent",
  };
  const dots = { neutral: "bg-text-faint", warn: "bg-warn", accent: "bg-accent" };
  return (
    <span
      className={cn(
        "text-mono-chip inline-flex items-center gap-1.5 rounded-pill px-2 py-1",
        tones[tone],
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-pill", dots[tone], pulse && "run-dot")}
        />
      )}
      {label}
    </span>
  );
}

/* ---- the footer meta: one dot + label, computed for every state ---- */
function footerMeta({
  tool,
  isUnlocked,
  isLocked,
  isComingSoon,
  isMaintenance,
  keyStatuses,
}: {
  tool: ToolCardData;
  isUnlocked: boolean;
  isLocked: boolean;
  isComingSoon: boolean;
  isMaintenance: boolean;
  keyStatuses?: Record<string, KeyStatus>;
}) {
  const wrap = (node: React.ReactNode) => (
    <span className="text-mono-chip inline-flex min-w-0 items-center gap-2 text-text-muted">
      {node}
    </span>
  );
  const dot = (cls: string) => (
    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", cls)} />
  );

  if (isMaintenance) {
    return wrap(
      <>
        {dot("bg-text-faint")}
        <span className="truncate text-text-faint">offline</span>
      </>,
    );
  }
  if (isLocked) {
    return wrap(
      <>
        <Lock aria-hidden className="size-3.5 shrink-0 text-text-faint" strokeWidth={1.8} />
        <span className="truncate">members only</span>
      </>,
    );
  }

  const providers = tool.required_providers;
  if (providers.length === 0) {
    return wrap(
      <>
        {dot("bg-live")}
        <span className="truncate">runs free</span>
      </>,
    );
  }
  if (isComingSoon) {
    return wrap(
      <>
        {dot("bg-text-faint")}
        <span className="truncate">needs: {providers.join(", ")}</span>
      </>,
    );
  }

  // has providers, and it's runnable (unlocked or preview)
  if (isUnlocked && keyStatuses) {
    const states: ChipState[] = providers.map((p) => chipStateFor(keyStatuses[p]));
    const missing = states.some((s) => s === "missing");
    if (missing) {
      return wrap(
        <>
          {dot("bg-warn")}
          <span className="truncate text-warn">needs: {providers.join(", ")}</span>
        </>,
      );
    }
    return wrap(
      <>
        {dot("bg-live")}
        <span className="truncate">keys ready</span>
      </>,
    );
  }

  // public / preview view — informational, neutral (not amber: §10 rule 2)
  return wrap(
    <>
      {dot("bg-text-faint")}
      <span className="truncate">needs: {providers.join(", ")}</span>
    </>,
  );
}
