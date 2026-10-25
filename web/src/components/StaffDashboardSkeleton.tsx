import { Skeleton } from "@/components/ui/Skeleton";

/** Match the operational layout so the page does not jump when the data arrives. */
export function StaffDashboardSkeleton() {
  return (
    <div className="staff-workspace" data-testid="staff-dashboard-skeleton" aria-busy="true">
      <p className="sr-only" role="status">Loading the desk…</p>
      <div className="staff-page-header">
        <h1 className="staff-page-title">Service desk</h1>
        <div className="staff-page-description">
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className="staff-desk-toolbar">
        <div className="staff-availability">
          <Skeleton className="h-7 w-20 rounded-full" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </div>

      <dl className="staff-summary" aria-label="Waiting list and personal activity">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </dl>

      <div className="staff-main-grid">
        <div className="staff-call-panel rounded-2xl bg-white p-6">
          <Skeleton className="h-5 w-32" />
          <div className="my-10 space-y-4">
            <Skeleton className="h-20 w-48" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-3 h-11 w-full" />
        </div>
        <div className="staff-waiting-panel rounded-2xl bg-white p-5">
          <Skeleton className="h-5 w-36" />
          <div className="my-6 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
      </div>

      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}