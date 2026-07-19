import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Composed loading states (DESIGN.md §9, §14): each is shaped like the content
 * it stands in for — a card grid loads as cards, a list as rows — never a
 * spinner. Used by the route `loading.tsx` files so a navigation shows the
 * shape of the answer before the data lands.
 */

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[224px] flex-col rounded-lg border border-line bg-surface p-5 [border-top-color:var(--line-strong)]"
        >
          <Skeleton className="size-[38px] rounded-md" />
          <Skeleton className="mt-4 h-4 w-1/2" />
          <Skeleton className="mt-2.5 h-3 w-1/3" />
          <Skeleton className="mt-3 h-3 w-full" />
          <div className="flex-1" />
          <div className="-mx-5 h-px bg-line" />
          <div className="flex items-center justify-between pt-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel flush>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0"
        >
          <Skeleton className="size-9 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-pill" />
        </div>
      ))}
    </Panel>
  );
}

export function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </Panel>
  );
}

/** The two-panel runner shape (§8): the form on the left, the output stage right. */
export function RunnerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_1fr]">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[38px] w-full rounded-sm" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-24 w-full rounded-sm" />
        <Skeleton className="h-11 w-full rounded-sm" />
      </div>
      <Skeleton className="min-h-[320px] w-full rounded-lg" />
    </div>
  );
}
