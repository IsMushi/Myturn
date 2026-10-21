"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "./api";

export interface PollError {
  message: string;
  status: number;
}

/**
 * Loads data immediately, then again on a fixed interval.
 *
 * The loader is part of the dependencies, so a page that starts following a new
 * ticket restarts polling with the new one at once.
 *
 * `stopWhen` ends the polling once there is nothing left to wait for — a
 * finished ticket, for example. Pass a function that keeps the same identity
 * between renders (wrap it in useCallback), because a new one restarts polling.
 * `reload()` asks again and starts the polling up again, so a manual refresh
 * still works after it has stopped.
 */
export function usePolling<T>(
  load: () => Promise<T>,
  intervalMs: number,
  enabled = true,
  stopWhen?: (data: T) => boolean,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PollError | null>(null);
  const [nonce, setNonce] = useState(0);
  const [stopped, setStopped] = useState(false);

  // The timer, an action's own refresh and now the live stream can all ask at
  // once. A reply that a later request has overtaken is dropped, so the slowest
  // answer cannot make the page step back to an older queue.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await load();
      if (id !== requestId.current) return;
      setData(next);
      setError(null);
      if (stopWhen?.(next)) setStopped(true);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(
        e instanceof ApiError
          ? { message: e.message, status: e.status }
          : { message: e instanceof Error ? e.message : "Request failed", status: 0 },
      );
    }
  }, [load, stopWhen]);

  useEffect(() => {
    if (!enabled || stopped) return;

    let live = true;
    const tick = async () => {
      if (live) await refresh();
    };

    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [enabled, stopped, intervalMs, refresh, nonce]);

  return {
    data,
    error,
    refresh,
    reload: () => {
      setStopped(false);
      setNonce((n) => n + 1);
    },
  };
}
