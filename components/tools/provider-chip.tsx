import { cn } from "@/lib/utils";
import type { ApiProvider } from "@/lib/tools";

/**
 * The "needs: openai" chip (DESIGN.md §9, §10 rule 2). On the public catalog
 * this is purely informational — it tells a visitor what a tool needs before
 * they click. It is neutral, NOT amber: amber (`--warn`) means "you, the
 * signed-in member, are missing a key you could add", which is a dashboard
 * state (Phase 5). Painting every public card amber would be color-as-noise,
 * which §2 forbids.
 */
export function ProviderChip({
  providers,
  className,
}: {
  providers: ApiProvider[];
  className?: string;
}) {
  const base =
    "text-mono-chip inline-flex items-center rounded-pill border border-line bg-surface px-2 py-1 text-text-muted";

  if (providers.length === 0) {
    // The funnel star: a tool a stranger can run with nothing connected (§10).
    return <span className={cn(base, className)}>runs free · no key</span>;
  }

  return (
    <span className={cn(base, className)}>needs: {providers.join(", ")}</span>
  );
}
