import { PanelSkeleton } from "@/components/ui/skeletons";

/**
 * ─── A LOADING BOUNDARY IS ALSO A PREFETCH BUDGET ───────────────────────────
 *
 * The dashboard shell links to six routes, and Next prefetches them. Where a
 * route has no loading.tsx that prefetch renders the REAL page — every server
 * component, every query — so opening /dashboard quietly fired five more full
 * renders. The Vercel log caught it: five routes served within one second of a
 * login, then everything timed out.
 *
 * With a boundary here the prefetch stops at this skeleton and costs nothing.
 * Better than turning prefetch off, which would have fixed the load by making
 * every navigation slower.
 *
 * /dashboard/credits is the heaviest page in the app — 7 queries of its own on
 * top of the layout's five — so it is the one that most wanted this.
 */
export default function Loading() {
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <PanelSkeleton lines={3} />
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={4} />
      <PanelSkeleton lines={1} />
    </div>
  );
}
