import { LayoutGrid } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The empty Apps state. DESIGN.md §12 calls this one of the most important
 * screens in the app — it has to sell, orient and convert with no data at all —
 * so the copy here is the real copy, not a placeholder.
 *
 * Phase 4 makes it conditional: no application → this; pending → the queue
 * card; approved → the tool grid.
 */
export default function DashboardPage() {
  return (
    // §9 Empty state: centered block, max 400px. A small icon, an h3, one line
    // of small/muted, and one primary button. Not a shrug.
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-[400px] flex-col items-center text-center">
        <LayoutGrid
          aria-hidden
          className="size-6 text-text-faint"
          strokeWidth={1.5}
        />
        <h2 className="text-h3 mt-5">Nothing here yet</h2>
        <p className="mt-2 text-small text-text-muted">
          Tools unlock when your application is approved. It usually takes a day.
        </p>
        <Link href="/apply" className="mt-6">
          <Button variant="primary">Check your application</Button>
        </Link>
      </div>
    </div>
  );
}
