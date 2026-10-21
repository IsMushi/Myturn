import type { ServiceState } from "@/lib/types";

const LABELS: Record<ServiceState, string> = {
  active: "Open",
  paused: "Paused",
  closed: "Closed",
};

/**
 * The state of one service, as a pill.
 *
 * The word carries the meaning; the dot only repeats it, so the badge still
 * reads for someone who cannot tell lime from amber across the room.
 */
export function ServiceStatusBadge({ state }: { state: ServiceState }) {
  return (
    <span className="myturn-display-badge" data-state={state}>
      <span className="myturn-display-badge-dot" aria-hidden="true" />
      {LABELS[state]}
    </span>
  );
}
