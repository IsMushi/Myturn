"use client";

import { useCallback, useSyncExternalStore } from "react";

const TOKEN_KEY = "myturn.ticket.token";
const CHANGE_EVENT = "myturn:ticket";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** True after hydration, so the first render matches the server. */
export function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * The ticket the visitor is following, kept on their own phone.
 *
 * Reading it through useSyncExternalStore means the page notices a change
 * without an effect, and stays in step if the visitor opens a second tab.
 */
export function useTicketToken() {
  const token = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(TOKEN_KEY),
    () => null,
  );

  const setToken = useCallback((value: string | null) => {
    if (value === null) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [token, setToken] as const;
}
