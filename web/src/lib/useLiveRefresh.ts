"use client";

import { useCallback, useEffect, useRef } from "react";

import { api } from "./api";
import { useLive, type LiveStatus } from "./useLive";

/**
 * Refresh a page the moment the queue moves.
 *
 * The public event stream already carries a frame for every queue, desk and
 * service change. Pages whose payload is richer than that frame (the staff
 * queue, the account list, the statistics) still read over HTTP, but they read
 * when this stream says something changed rather than waiting for the next
 * poll. The page's own polling is left in place underneath, so a proxy that
 * buffers the stream costs freshness, never correctness.
 *
 * The callback is held in a ref rather than being an effect dependency: callers
 * naturally pass an inline function, whose identity changes every render, and
 * depending on it would re-run the effect each render and fetch without end.
 */
export function useLiveRefresh(refresh: () => void, intervalMs = 5000): LiveStatus {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  const load = useCallback(async () => Date.now(), []);
  const live = useLive<number>({
    url: api.eventsUrl(),
    event: "queue",
    select: () => Date.now(),
    load,
    intervalMs,
  });

  // The stream sends the current state as soon as it opens; skip that first
  // frame so the page does not fetch once more on top of its own first load.
  const { data } = live;
  const seen = useRef(false);
  useEffect(() => {
    if (data === null) return;
    if (!seen.current) {
      seen.current = true;
      return;
    }
    refreshRef.current();
  }, [data]);

  return live.status;
}
