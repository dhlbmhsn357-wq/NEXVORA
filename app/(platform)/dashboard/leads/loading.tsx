import { SkeletonBlock, SkeletonText } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonText width="w-48" />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonBlock key={i} className="h-24" />
          ))}
        </div>
        <SkeletonBlock className="h-64" />
      </div>
    </div>
  );
}
