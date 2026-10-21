import { Skeleton } from "@/components/ui/Skeleton";

/** Match the operational layout without hiding a desk picker that already works. */
export function StaffDashboardSkeleton() {
  return (
    <div className="staff-loading space-y-5" data-testid="staff-dashboard-skeleton" aria-busy="true">
      <p className="sr-only" role="status">Loading the desk…</p>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4">
        <Skeleton className="h-8 w-24" /><Skeleton className="h-10 w-52" />
      </div>
      <div className="grid grid-cols-2 gap-5 rounded-xl bg-white p-5 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3">
          <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-28 max-w-full" />
        </div>)}
      </div>
      <div className="staff-main-grid">
        <div className="rounded-xl bg-white p-6">
          <Skeleton className="h-5 w-32" />
          <div className="my-10 space-y-4"><Skeleton className="h-20 w-48" /><Skeleton className="h-4 w-3/4" /></div>
          <Skeleton className="h-12 w-full" /><Skeleton className="mt-3 h-11 w-full" />
        </div>
        <div className="rounded-xl bg-white p-5">
          <Skeleton className="h-5 w-36" />
          <div className="my-6 space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
      <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
    </div>
  );
}
