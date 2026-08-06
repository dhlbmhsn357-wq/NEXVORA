import { SkeletonBlock, SkeletonText } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <SkeletonText width="w-32" />
      <div className="mt-6 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBlock key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
