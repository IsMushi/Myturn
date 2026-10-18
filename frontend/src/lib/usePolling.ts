"use client";

import { useCallback, useEffect, useState } from "react";

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
 */
export function usePolling<T>(
  load: () => Promise<T>,
  intervalMs: number,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PollError | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { message: e.message, status: e.status }
          : { message: e instanceof Error ? e.message : "Request failed", status: 0 },
      );
    }
  }, [load]);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled, intervalMs, refresh, nonce]);

  return { data, error, refresh, reload: () => setNonce((n) => n + 1) };
}
