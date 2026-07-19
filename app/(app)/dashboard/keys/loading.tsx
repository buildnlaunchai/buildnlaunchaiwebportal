import { ListSkeleton, PanelSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Skeleton className="h-3 w-64" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <PanelSkeleton lines={4} />
      <ListSkeleton rows={2} />
    </div>
  );
}
