import type { Service } from "@/lib/types";

/** Waiting numbers come from each service's bounded server-side queue preview. */
export function WaitingPanel({ services, total }: { services: Service[]; total: number }) {
  return (
    <aside className="myturn-display-waiting-panel" aria-labelledby="display-waiting-heading">
      <div className="myturn-display-waiting-panel-head">
        <div>
          <h2 id="display-waiting-heading">Waiting list</h2>
          <p>{total} {total === 1 ? "ticket" : "tickets"} waiting</p>
        </div>
        <strong aria-label={`${total} ${total === 1 ? "visitor" : "visitors"} waiting`}>{total}</strong>
      </div>
      <div className="myturn-display-waiting-panel-content">
        {total === 0 && <p className="myturn-display-waiting-empty">No tickets waiting right now.</p>}
        {services.filter((service) => service.waiting > 0).map((service) => {
          const labels = service.waiting_labels ?? [];
          const remaining = Math.max(0, service.waiting - labels.length);
          return (
            <section className="myturn-display-waiting-group" key={service.id} aria-labelledby={`waiting-${service.id}`}>
              <div className="myturn-display-waiting-group-head">
                <h3 id={`waiting-${service.id}`}>{service.name}</h3>
                <span aria-label={`${service.waiting} waiting for ${service.name}`}>{service.waiting}</span>
              </div>
              {labels.length > 0 ? (
                <ol className="myturn-display-waiting-rows" aria-label={`Next tickets for ${service.name}`}>
                  {labels.map((label, index) => (
                    <li key={label}>
                      <span>{index === 0 ? "Next" : `${index + 1}`}</span>
                      <strong>{label}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="myturn-display-waiting-group-empty">Waiting numbers unavailable</p>
              )}
              {remaining > 0 && <p className="myturn-display-waiting-overflow">+{remaining} more waiting</p>}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
