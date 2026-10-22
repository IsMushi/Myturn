import type { Service } from "@/lib/types";

import { ActiveTicketDisplay } from "./ActiveTicketDisplay";
import { EmptyQueueState } from "./EmptyQueueState";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { Users } from "lucide-react";

/**
 * Single combined panel that shows all services' current calls and status.
 *
 * Replaces the grid of individual service cards with one unified view
 * that shows who is being served across all services and their current status.
 */
export function CombinedServicePanel({ services, freshServiceIds }: { 
  services: Service[]; 
  freshServiceIds: string[]; 
}) {
  // Find all services that currently have someone being served
  const servicesWithCalls = services.filter(service => service.now_serving.length > 0);
  
  // Find all services that are currently waiting
  const servicesWithWaiting = services.filter(service => service.waiting > 0);
  
  return (
    <section className="myturn-display-service">
      {/* Header showing service status */}
      <div className="myturn-display-service-head">
        <h2 id="display-combined-services">
          Service Queue
        </h2>
      </div>

      {/* Main content area - show current calls first */}
      <div className="myturn-display-service-body">
        {servicesWithCalls.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-deep-green mb-3">
              Currently Being Served
            </h3>
            {servicesWithCalls.map(service => (
              <div key={service.id} className="border rounded-lg p-4 bg-mint/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-deep-green">
                      {service.letter}
                    </span>
                    <span className="font-medium">
                      {service.name}
                    </span>
                    <ServiceStatusBadge state={service.service_state} />
                  </div>
                  <span className="text-sm text-medium-green">
                    {service.now_serving.length} call{service.now_serving.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ActiveTicketDisplay calls={service.now_serving} />
                {service.waiting > 0 && (
                  <div className="mt-3 pt-3 border-t border-line/50">
                    <span className="text-sm text-medium-green">
                      {service.waiting} waiting • Next: {service.waiting_labels?.[0] || 'N/A'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyQueueState state="paused" />
        )}

        {/* Waiting services section */}
        {servicesWithWaiting.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-deep-green mb-3">
              Services with Waiting Tickets
            </h3>
            <div className="space-y-2">
              {servicesWithWaiting.map(service => (
                <div key={service.id} className="flex items-center justify-between py-2 border-b border-line/30">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-deep-green">
                      {service.letter}
                    </span>
                    <span>
                      {service.name}
                    </span>
                    <ServiceStatusBadge state={service.service_state} />
                  </div>
                  <span className="font-semibold text-medium-green">
                    {service.waiting} waiting
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer with total summary */}
      <div className="myturn-display-service-foot">
        <span className="myturn-display-service-waiting">
          <Users size={18} aria-hidden="true" />
          Total: {services.reduce((sum, s) => sum + s.waiting, 0)} tickets waiting
        </span>
        <strong
          className="myturn-display-service-count"
          aria-label={`${services.reduce((sum, s) => sum + s.waiting, 0)} total waiting tickets`}
        >
          {services.reduce((sum, s) => sum + s.waiting, 0)}
        </strong>
      </div>
    </section>
  );
}