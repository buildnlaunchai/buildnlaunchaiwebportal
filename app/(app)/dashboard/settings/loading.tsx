import { PanelSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <PanelSkeleton lines={3} />
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={1} />
    </div>
  );
}
