import { SkeletonBlock, SkeletonText } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonText width="w-40" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-16" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="h-16" />
          ))}
        </div>
      </div>
    </div>
  );
}
