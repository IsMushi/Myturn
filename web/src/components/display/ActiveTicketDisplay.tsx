"use client";

import { useEffect, useState } from "react";

import type { ServiceCall } from "@/lib/types";

const ARRIVAL_SECONDS = 60;

/**
 * The number — or numbers — a service is calling right now.
 *
 * A service can have more than one desk, so it can legitimately be calling
 * more than one visitor at once. Each number keeps its own counter line; when
 * there are two, the type steps down so both stay inside the card instead of
 * pushing the layout sideways.
 */
export function ActiveTicketDisplay({ calls, serverTime, offline = false }: {
  calls: ServiceCall[];
  serverTime?: string;
  offline?: boolean;
}) {
  const [clock, setClock] = useState<{ source: string; elapsed: number } | null>(null);
  useEffect(() => {
    if (!serverTime || offline || calls.length === 0) return;
    // Advance from the server snapshot using a monotonic local clock. A tablet
    // with the wrong date still shows the right remaining arrival time.
    const receivedAt = performance.now();
    const interval = window.setInterval(() => {
      setClock({ source: serverTime, elapsed: performance.now() - receivedAt });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [serverTime, offline, calls.length]);
  const serverNow = serverTime ? Date.parse(serverTime) : Number.NaN;
  const now = serverNow + (clock && clock.source === serverTime ? clock.elapsed : 0);

  return (
    <div className="myturn-display-active" data-count={calls.length}>
      {!serverTime && <p className="myturn-display-calling">Now serving</p>}
      <div className="myturn-display-numbers">
        {calls.map((call) => {
          const calledAt = call.called_at ? Date.parse(call.called_at) : Number.NaN;
          const remaining = Number.isFinite(calledAt) && Number.isFinite(now)
            ? Math.min(ARRIVAL_SECONDS, Math.max(0, Math.ceil((calledAt + ARRIVAL_SECONDS * 1000 - now) / 1000)))
            : null;
          return (
          <div className="myturn-display-call" key={`${call.label}-${call.desk ?? ""}`}>
            <p className="myturn-display-number">{call.label}</p>
            <p className="myturn-display-desk">{call.desk ?? "Ask staff for your service point"}</p>
            {serverTime && (
              <div className="myturn-display-arrival" data-ended={remaining === 0}>
                {offline ? <p>Timer unavailable while disconnected</p> : remaining === null ? <p>Arrival time unavailable</p> : (
                  <>
                    <span role="timer" aria-live="off" aria-label={`Arrival countdown for ${call.label}`} className="myturn-display-arrival-seconds">{remaining}s</span>
                    <p>{remaining === 0 ? "Arrival window ended" : "Time to reach your service point"}</p>
                  </>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>
      <p className="myturn-display-instruction">
        {calls.every((call) => call.desk)
          ? "Please go to the service point shown with your number."
          : "Please ask staff which service point to visit."}
      </p>
    </div>
  );
}
