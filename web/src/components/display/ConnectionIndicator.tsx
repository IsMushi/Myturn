import { LoaderCircle, Radio, WifiOff } from "lucide-react";

import type { LiveStatus } from "@/lib/useLive";

/** What the board should call the connection right now. Shared with the live region. */
export function connectionLabel(status: LiveStatus, offline: boolean): string {
  if (offline) return "Connection lost";
  // "Up to date", not how it gets there: a television says nothing about
  // sockets or refresh rates to the people waiting in front of it.
  if (status === "live" || status === "polling") return "Up to date";
  return "Connecting…";
}

/**
 * The connection, said in words first.
 *
 * The broadcast icon is decorative; the label carries the connection state.
 * Losing the connection changes both, and never leaves the board
 * looking as if nothing had happened.
 */
export function ConnectionIndicator({
  status,
  offline,
}: {
  status: LiveStatus;
  offline: boolean;
}) {
  if (offline) {
    return (
      <span className="myturn-display-connection" data-offline="true">
        <WifiOff size={18} aria-hidden="true" />
        <span>{connectionLabel(status, true)}</span>
      </span>
    );
  }

  const Icon = status === "connecting" ? LoaderCircle : Radio;

  return (
    <span className="myturn-display-connection" data-live="true">
      <Icon
        size={18}
        className={status === "connecting" ? "myturn-display-spin" : undefined}
        aria-hidden="true"
      />
      <span>{connectionLabel(status, false)}</span>
    </span>
  );
}
