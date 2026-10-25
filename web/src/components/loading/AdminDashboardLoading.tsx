import { Skeleton } from "@/components/ui/Skeleton";

export function AdminDashboardLoading() {
  return (
    <div className="space-y-5" data-testid="page-loading" aria-busy="true">
      <p className="sr-only" role="status">
        Loading dashboard…
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-2xl bg-white p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-8 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-3 h-10 w-full rounded-xl" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="mt-4">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
