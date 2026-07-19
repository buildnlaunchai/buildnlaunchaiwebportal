import { ListSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-[38px] w-full max-w-[360px] rounded-sm" />
      <ListSkeleton rows={6} />
    </div>
  );
}
