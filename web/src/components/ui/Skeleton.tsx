/**
 * A placeholder block, shown while the page is still asking the server.
 *
 * It is hidden from screen readers, because the region it stands in announces
 * "Loading" on its own; the shape is there for the eye, not for the ear.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-lg bg-soft-mint ${className}`} />
  );
}

/** The shape of a card that has not arrived yet. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className={index === lines - 1 ? "h-4 w-2/3" : "h-4 w-full"} />
        ))}
      </div>
    </div>
  );
}
