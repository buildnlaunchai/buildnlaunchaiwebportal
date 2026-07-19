import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <Skeleton className="h-3 w-72" />
      <PanelSkeleton lines={3} />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Panel key={i} className="flex gap-4">
            <Skeleton className="h-14 w-12 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
