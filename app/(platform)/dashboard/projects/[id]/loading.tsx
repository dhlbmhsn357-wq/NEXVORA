import { SkeletonBlock, SkeletonText } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <div className="hud-frame mb-6 rounded-[var(--v-radius-lg)] p-4">
        <SkeletonText width="w-56" />
        <div className="mt-2">
          <SkeletonText width="w-32" />
        </div>
      </div>
      <div className="mb-6 flex gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <SkeletonBlock key={i} className="h-8 w-20" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}
