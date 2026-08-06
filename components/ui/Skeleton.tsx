/**
 * Skeleton موحّد — Block/Text/Circle، بديل لتكرار
 * "animate-pulse rounded bg-[var(--v-surface)]" في كل صفحة.
 */
export function SkeletonBlock({ className = "h-16 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--v-radius-md)] bg-[var(--v-surface)] ${className}`} />;
}

export function SkeletonText({ width = "w-3/4" }: { width?: string }) {
  return <div className={`h-3.5 animate-pulse rounded bg-[var(--v-surface)] ${width}`} />;
}

export function SkeletonCircle({ size = "h-8 w-8" }: { size?: string }) {
  return <div className={`animate-pulse rounded-full bg-[var(--v-surface)] ${size}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[var(--v-radius-lg)] border border-[var(--v-border)] bg-[var(--v-bg)] p-4">
      <div className="flex items-center gap-3">
        <SkeletonCircle />
        <div className="flex-1 space-y-2">
          <SkeletonText width="w-1/2" />
          <SkeletonText width="w-1/3" />
        </div>
      </div>
    </div>
  );
}
