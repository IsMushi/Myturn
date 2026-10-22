import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export function PublicLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the page…
      </p>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="h-5 w-3/4" />
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-12 w-44 rounded-full" />
            <Skeleton className="h-12 w-36 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
      <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} lines={3} />
        ))}
      </div>
      <div className="mt-16 grid gap-5 lg:grid-cols-3">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
