import type { Service } from "@/lib/types";

import { ActiveTicketDisplay } from "./ActiveTicketDisplay";
import { EmptyQueueState } from "./EmptyQueueState";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { WaitingPanel } from "./WaitingPanel";

/** Called tickets and waiting tickets are two distinct, live regions. */
export function CombinedServicePanel({ services, freshServiceIds, serverTime, offline }: {
  services: Service[];
  freshServiceIds: string[];
  serverTime: string;
  offline: boolean;
}) {
  const servicesWithCalls = services.filter((service) => service.now_serving.length > 0);
  const totalWaiting = services.reduce((sum, service) => sum + service.waiting, 0);

  return (
    <div className="myturn-display-queue-board">
      <section className="myturn-display-service myturn-display-current-panel" aria-labelledby="display-combined-services">
      {/* Header showing service status */}
      <div className="myturn-display-service-head">
        <h2 id="display-combined-services">
          Now calling
        </h2>
      </div>

      {/* Main content area - show current calls first */}
      <div className="myturn-display-current-content">
        {servicesWithCalls.length > 0 ? (
          <div className="myturn-display-current-list">
            {servicesWithCalls.map((service) => (
              <section key={service.id} className="myturn-display-current-service" data-fresh={freshServiceIds.includes(service.id)} aria-label={`Calls for ${service.name}`}>
                <div className="myturn-display-current-service-head">
                  <h3>{service.name}</h3>
                  <ServiceStatusBadge state={service.service_state} />
                </div>
                <ActiveTicketDisplay calls={service.now_serving} serverTime={serverTime} offline={offline} />
              </section>
            ))}
          </div>
        ) : (
          <EmptyQueueState
            state={
              services.some((service) => service.service_state === "active")
                ? "active"
                : services.every((service) => service.service_state === "closed")
                  ? "closed"
                  : "paused"
            }
          />
        )}

      </div>
      </section>
      <WaitingPanel services={services} total={totalWaiting} />
    </div>
  );
}
