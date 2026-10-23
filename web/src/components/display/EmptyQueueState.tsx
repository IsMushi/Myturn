import Image from "next/image";

import type { ServiceState } from "@/lib/types";

/**
 * What a counter with nothing on it says.
 *
 * Open, paused and closed are different promises, so they get different
 * sentences. A paused service is coming back; a closed one is not, today.
 */
const MESSAGES: Record<ServiceState, string> = {
  active: "The next number will appear here.",
  paused: "Service will continue after the break.",
  closed: "This service is closed. Please ask at the service point.",
};

export function EmptyQueueState({ state }: { state: ServiceState }) {
  return (
    <div className="myturn-display-idle">
      <span className="myturn-display-idle-icon" aria-hidden="true">
        <Image src="/images/display-ticket-art.webp" alt="" width={238} height={130} unoptimized />
      </span>
      <h3>No active call</h3>
      <p>{MESSAGES[state]}</p>
    </div>
  );
}
