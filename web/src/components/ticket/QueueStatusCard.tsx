import { Clock3, Hourglass, Megaphone, Users } from "lucide-react";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { describeWait, plural, waitEstimate } from "@/lib/format";
import type { Service } from "@/lib/types";

/** How many numbers are listed before the rest are counted. */
const SHOWN = 8;

/**
 * What the queue of one service looks like right now.
 *
 * Every number here comes from the API. The wait is only shown when the server
 * has served enough visitors to know how long the service usually takes; when
 * it has not, the card says so instead of putting a made-up figure on the
 * screen.
 *
 * A service may have more than one desk, so there may be more than one number
 * being served: each is shown with the counter that is serving it.
 *
 * The numbers themselves are listed too, because "three ahead" means more
 * when you can see them. With a ticket of your own that is the line ahead of
 * your number; without one, the line you are about to join. Either way only
 * the next few are shown — the count above them is the whole truth.
 */
export function QueueStatusCard({
  service,
  ahead,
  aheadLabels,
  loading = false,
}: {
  service: Service | null;
  /** How many tickets are ahead of this visitor, when they already hold one. */
  ahead?: number | null;
  /** The next few numbers ahead of this visitor, when they already hold one. */
  aheadLabels?: string[] | null;
  loading?: boolean;
}) {
  if (loading && !service) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-line bg-white p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!service) return null;

  const calls = service.now_serving;
  const aheadCount = ahead ?? service.waiting;
  const estimate = waitEstimate(aheadCount, service.average_service_seconds);
  const wait = describeWait(estimate);
  // The visitor's own ticket cuts the line at their number; a visitor without
  // one sees the whole queue they would join.
  const queue = aheadLabels ?? service.waiting_labels ?? [];
  const listed = queue.slice(0, SHOWN);
  const rest = queue.length - listed.length;

  return (
    <div className="space-y-3">
      <dl className="myturn-ticket-queue-stats">
        <Stat
          icon={Megaphone}
          label="Now serving"
          value={calls.length === 0 ? "—" : calls.map((call) => call.label).join(", ")}
          note={
            calls.length === 0
              ? "Nobody has been called yet"
              : calls.map((call) => call.desk ?? "the desk").join(" · ")
          }
        />
        <Stat
          icon={Users}
          label="Tickets waiting"
          value={String(service.waiting)}
          note={service.waiting === 0 ? "The queue is empty" : `${plural(service.waiting, "ticket")} in this queue`}
        />
        <Stat
          icon={Hourglass}
          label="Estimated wait"
          value={wait ?? "Not available"}
          note={
            wait
              ? `Based on the last ${plural(service.service_samples, "visitor")} served`
              : "The desk has not served enough visitors yet to measure this"
          }
        />
        <div className="myturn-ticket-stat">
          <dt className="flex items-center gap-2 text-xs font-medium text-deep-green">
            <Clock3 className="size-4" aria-hidden="true" />
            Desk status
          </dt>
          <dd className="mt-3">
            <DeskStateBadge state={service.service_state} />
          </dd>
        </div>
      </dl>

      {listed.length > 0 && (
        <div className="myturn-ticket-ahead">
          <p className="text-xs font-medium text-deep-green">
            {aheadLabels ? "Numbers ahead of you" : "Waiting in this queue"}
          </p>
          <ul
            className="mt-2 flex flex-wrap gap-2"
            aria-label={aheadLabels ? "Numbers ahead of you" : "Waiting in this queue"}
          >
            {listed.map((label) => (
              <li key={label} className="myturn-ticket-ahead-chip">
                {label}
              </li>
            ))}
            {rest > 0 && (
              <li className="myturn-ticket-ahead-chip myturn-ticket-ahead-more">
                +{rest} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="myturn-ticket-stat">
      <dt className="flex items-center gap-2 text-xs font-medium text-deep-green">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-2xl leading-tight font-bold text-deep-green">{value}</dd>
      <dd className="mt-2 text-xs leading-relaxed text-deep-green">{note}</dd>
    </div>
  );
}
