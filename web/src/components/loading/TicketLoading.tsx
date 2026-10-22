import { Skeleton } from "@/components/ui/Skeleton";

export function TicketLoading() {
  return (
    <div className="myturn-ticket-focused space-y-6" aria-busy="true">
      <p className="sr-only" role="status">
        Loading your ticket…
      </p>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-96 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    </div>
  );
}
