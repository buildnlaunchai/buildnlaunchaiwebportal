import { PanelSkeleton } from "@/components/ui/skeletons";

/** See the note in ../credits/loading.tsx — a loading boundary caps what a
 *  prefetch of this route costs. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={6} />
    </div>
  );
}
