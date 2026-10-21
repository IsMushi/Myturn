"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

/**
 * Reads one value from the query string.
 *
 * The link to an invitation or a password reset carries its token this way, and
 * the login page carries the page the visitor was trying to reach. Reading it
 * through useSyncExternalStore keeps the first render identical to the server's
 * and makes a back button press follow along.
 */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}
