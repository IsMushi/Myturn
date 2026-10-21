import { CheckCircle2, DoorClosed, Loader2, WifiOff } from "lucide-react";

import type { PollError } from "@/lib/usePolling";
import type { Service } from "@/lib/types";

/**
 * Whether this service is taking tickets right now.
 *
 * It is worked out from the state the server reports, never assumed, so a
 * visitor can see the difference between an open desk, a closed one and a
 * connection that is not answering.
 */
export function ServiceStatusPill({
  service,
  error,
  loading = false,
}: {
  service: Service | null;
  error: PollError | null;
  loading?: boolean;
}) {
  const look = status(service, error, loading);

  return (
    <p
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${look.className}`}
    >
      <look.icon
        className={`size-4 ${look.spin ? "motion-safe:animate-spin" : ""}`}
        aria-hidden="true"
      />
      {look.label}
    </p>
  );
}

function status(service: Service | null, error: PollError | null, loading: boolean) {
  if (error) {
    return {
      label: "Queue updates unavailable",
      icon: WifiOff,
      className: "border-amber-300 bg-amber-50 text-amber-900",
      spin: false,
    };
  }

  if (loading && !service) {
    return {
      label: "Checking the ticket service…",
      icon: Loader2,
      className: "border-line bg-white text-medium-green",
      spin: true,
    };
  }

  if (service?.service_state === "closed") {
    return {
      label: "This service is closed",
      icon: DoorClosed,
      className: "border-rose-300 bg-rose-50 text-rose-900",
      spin: false,
    };
  }

  if (!service || !service.available) {
    return { label: "No ticket service available", icon: DoorClosed, className: "border-line bg-white text-deep-green", spin: false };
  }

  return {
    label: "Ticket service available",
    icon: CheckCircle2,
    className: "border-medium-green bg-soft-mint text-deep-green",
    spin: false,
  };
}
