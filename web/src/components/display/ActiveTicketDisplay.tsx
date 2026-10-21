import type { ServiceCall } from "@/lib/types";

/**
 * The number — or numbers — a service is calling right now.
 *
 * A service can have more than one desk, so it can legitimately be calling
 * more than one visitor at once. Each number keeps its own counter line; when
 * there are two, the type steps down so both stay inside the card instead of
 * pushing the layout sideways.
 */
export function ActiveTicketDisplay({ calls }: { calls: ServiceCall[] }) {
  return (
    <div className="myturn-display-active" data-count={calls.length}>
      <p className="myturn-display-calling">Now serving</p>
      <div className="myturn-display-numbers">
        {calls.map((call) => (
          <div className="myturn-display-call" key={`${call.label}-${call.desk ?? ""}`}>
            <p className="myturn-display-number">{call.label}</p>
            <p className="myturn-display-desk">{call.desk ?? "At the service desk"}</p>
          </div>
        ))}
      </div>
      <p className="myturn-display-instruction">
        {calls.length > 1
          ? "Please go to the counter shown with your number."
          : "Please proceed to the service desk."}
      </p>
    </div>
  );
}
