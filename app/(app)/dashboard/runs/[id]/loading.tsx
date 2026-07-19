import { Skeleton } from "@/components/ui/skeleton";
import { RunnerSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <RunnerSkeleton />
    </div>
  );
}
