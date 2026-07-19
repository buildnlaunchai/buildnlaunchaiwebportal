import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The member-side 404. Reached both when something genuinely doesn't exist and
 * when access is denied (the access engine 404s rather than confirming a tool
 * exists, §13) — so the copy stays neutral and never hints at either.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={Compass}
        title="Not here"
        description="This page doesn't exist, or it's moved. Let's get you back to your apps."
        action={
          <Link href="/dashboard">
            <Button variant="secondary">Back to your apps</Button>
          </Link>
        }
      />
    </div>
  );
}
