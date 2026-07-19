import { ListSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Skeleton className="h-[38px] w-28 rounded-sm" />
      </div>
      <ListSkeleton rows={5} />
    </div>
  );
}
