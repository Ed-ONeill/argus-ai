export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-edge p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-4 w-16 bg-raised rounded-full animate-pulse" />
        <div className="h-3 w-24 bg-raised rounded animate-pulse ml-auto" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full bg-raised rounded animate-pulse" />
        <div className="h-4 w-4/5 bg-raised rounded animate-pulse" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-raised rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-raised rounded animate-pulse" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-28 bg-raised rounded-full animate-pulse" />
        <div className="h-5 w-16 bg-raised rounded animate-pulse ml-auto" />
      </div>
    </div>
  );
}
