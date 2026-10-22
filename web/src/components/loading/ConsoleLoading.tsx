import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export function ConsoleLoading() {
  return (
    <div className="space-y-5" data-testid="page-loading" aria-busy="true">
      <p className="sr-only" role="status">
        Loading this section…
      </p>
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} lines={2} />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
