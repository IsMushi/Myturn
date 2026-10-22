import { Users } from "lucide-react";

import type { Service } from "@/lib/types";

import { ActiveTicketDisplay } from "./ActiveTicketDisplay";
import { EmptyQueueState } from "./EmptyQueueState";
import { ServiceStatusBadge } from "./ServiceStatusBadge";

/**
 * One service on the wall.
 *
 * Every service gets a card, whatever its state, so the board always shows the
 * same place to look. The header names the service, the body is either the
 * number being called or an honest empty state, and the footer repeats this
 * service's queue length. Waiting numbers live in the panel beside the cards.
 *
 * `fresh` is true for a couple of seconds after a new call arrives. It draws a
 * ring around the card and lets the number rise into place; it is not the only
 * signal, because "Now serving" is already written above the number.
 */
export function ServiceQueueCard({ service, fresh }: { service: Service; fresh: boolean }) {
  const calls = service.now_serving;
  const headingId = `display-service-${service.id}`;

  return (
    <section
      className="myturn-display-service"
      data-state={service.service_state}
      data-fresh={fresh ? "true" : undefined}
      aria-labelledby={headingId}
    >
      <div className="myturn-display-service-head">
        {/* Avatar symbol removed */}
        <h2 id={headingId}>{service.name}</h2>
        <ServiceStatusBadge state={service.service_state} />
      </div>

      <div className="myturn-display-service-body">
        {calls.length > 0 ? (
          <ActiveTicketDisplay calls={calls} />
        ) : (
          <EmptyQueueState state={service.service_state} />
        )}
      </div>

      <div className="myturn-display-service-foot">
        <span className="myturn-display-service-waiting">
          <Users size={18} aria-hidden="true" />
          Waiting for this service
        </span>
        <strong
          className="myturn-display-service-count"
          aria-label={`${service.waiting} waiting for ${service.name}`}
        >
          {service.waiting}
        </strong>
      </div>
    </section>
  );
}
