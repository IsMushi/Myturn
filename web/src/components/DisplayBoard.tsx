"use client";

import { Ticket, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { clockTime, plural } from "@/lib/format";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import type { PublicState, ServiceCall } from "@/lib/types";

import { PublicDisplayFooter } from "./display/PublicDisplayFooter";
import { PublicDisplayHeader } from "./display/PublicDisplayHeader";
import { connectionLabel } from "./display/ConnectionIndicator";
import { NowServingHeader } from "./display/NowServingHeader";
import { ServiceQueueCard } from "./display/ServiceQueueCard";
import { DisplayBoardSkeleton } from "./display/DisplayBoardSkeleton";

import "./display-board.css";

/** How long a call is announced with a ring: long enough to notice, then gone. */
const CALL_IS_NEW_MS = 2500;

/** Whether the server's own state is still within the first moments of a call. */
function calledJustNow(call: ServiceCall, serverNow: number): boolean {
  if (!call.called_at || !Number.isFinite(serverNow)) return false;
  const called = Date.parse(call.called_at);
  return Number.isFinite(called) && serverNow >= called && serverNow - called < CALL_IS_NEW_MS;
}

/** The calls a service currently holds, as a stable identity for one card. */
function callSignature(calls: ServiceCall[]): string {
  return calls.map((call) => `${call.label}@${call.desk ?? ""}`).join("|");
}

/**
 * The screen on the waiting-room wall.
 *
 * It follows the same server-sent stream as the rest of the site, with polling
 * underneath, and it says only what the API says: every service, the number
 * each one is calling, and how many people are waiting for it. When the
 * connection drops it keeps the last numbers but labels them as old rather
 * than letting a frozen screen look live.
 */
export function DisplayBoard() {
  const { data, error, status, reload } = useLive<PublicState>({
    url: api.eventsUrl(),
    event: "queue",
    select: (payload) => (payload as { state: PublicState }).state,
    load: api.publicState,
    intervalMs: 3000,
  });

  const services = data?.services ?? [];
  const calls = services.flatMap((service) =>
    service.now_serving.map(
      (call) => `${service.name}: ${call.label}, ${call.desk ?? "at the desk"}`,
    ),
  );

  const offline = Boolean(error);
  const updatedAt = data ? clockTime(data.server_time) : null;
  const label = connectionLabel(status, offline);
  /* The state carries the server's clock, so a call is "new" by the same time
     the numbers were written, not by when this browser happened to render. */
  const serverNow = data ? Date.parse(data.server_time) : Number.NaN;

  return (
    <main className="myturn-display" data-offline={offline} aria-busy={!data && !error}>
      <p className="sr-only" role="status" aria-atomic="true">
        {label}.{" "}
        {calls.length > 0
          ? `Now serving ${calls.join(". ")}.`
          : "No number is currently being called."}{" "}
        {data ? `${plural(data.waiting, "visitor")} waiting.` : "Loading the queue."}
        {updatedAt ? ` Last updated ${updatedAt}.` : ""}
      </p>

      <PublicDisplayHeader status={status} offline={offline} updatedAt={updatedAt} />

      {offline && data && (
        <div className="myturn-display-warning" role="alert">
          <WifiOff size={20} aria-hidden="true" />
          <p>
            Connection interrupted. These are the last received numbers, from{" "}
            {clockTime(data.server_time)}; they may be out of date.
          </p>
          <Button variant="quiet" onClick={reload}>
            Reconnect
          </Button>
        </div>
      )}

      {!data ? (
        error ? (
          <div className="myturn-display-state">
            <div className="myturn-display-state-icon" aria-hidden="true">
              <WifiOff size={28} />
            </div>
            <h2>The queue cannot be reached</h2>
            <p>Please check the connection or ask at the service desk.</p>
            <Button variant="quiet" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : (
          <DisplayBoardSkeleton />
        )
      ) : services.length === 0 ? (
        <div className="myturn-display-state">
          <Ticket size={44} aria-hidden="true" />
          <h2>No services to display</h2>
          <p>Please ask a staff member at the counter.</p>
        </div>
      ) : (
        <>
          <NowServingHeader waiting={data.waiting} />

          <div className="myturn-display-services">
            {services.map((service) => {
              const signature = callSignature(service.now_serving);
              return (
                <ServiceQueueCard
                  /* A changed call remounts the card, so the number arrives and
                     the ring restarts even when the state itself looks equal. */
                  key={`${service.id}:${signature}`}
                  service={service}
                  fresh={service.now_serving.some((call) => calledJustNow(call, serverNow))}
                />
              );
            })}
          </div>
        </>
      )}

      <PublicDisplayFooter />
    </main>
  );
}
