"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "./api";
import type { PollError } from "./usePolling";

/** How the live connection is doing, for a page that wants to say so. */
export type LiveStatus = "connecting" | "live" | "polling" | "stopped";

interface LiveOptions<T> {
  /** The stream to open, or null while there is nothing to watch yet. */
  url: string | null;
  /** The SSE event name the stream sends. */
  event: string;
  /** Turns one stream frame into the value the page cares about. */
  select: (payload: unknown) => T;
  /** The same value over plain HTTP, used if the stream cannot be opened. */
  load: () => Promise<T>;
  /** How often the fallback asks, when it is in use. */
  intervalMs: number;
  enabled?: boolean;
  /** Ends the connection once there is nothing left to wait for. */
  stopWhen?: (data: T) => boolean;
}

// How long to wait before trying the stream again after it drops, doubling
// with each failure up to a ceiling. The polling fallback keeps the page
// current while the stream is away, and the stream is tried again so a page
// that briefly lost the network returns to live instead of polling for good.
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 30000;

/**
 * Follows a server-sent stream, with polling underneath it.
 *
 * The stream is the point: one open connection replaces a request every few
 * seconds, and the server pushes the moment something changes. It is not the
 * only way in, though — an old browser, a proxy that buffers the response, or
 * an API that refuses the stream all fall back to asking on a timer, so the
 * page keeps working exactly as it did before the stream existed.
 *
 * A stream that drops is retried with a growing delay rather than abandoned:
 * the fallback polling keeps the page correct meanwhile, and the page goes
 * back to live by itself once the stream can be reopened.
 *
 * The connection is closed on unmount and once `stopWhen` is met, so a finished
 * ticket does not sit holding a socket open.
 */
export function useLive<T>({
  url,
  event,
  select,
  load,
  intervalMs,
  enabled = true,
  stopWhen,
}: LiveOptions<T>): {
  data: T | null;
  error: PollError | null;
  status: LiveStatus;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PollError | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [stopped, setStopped] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Held in refs so `select` and `stopWhen` may be written inline without the
  // effect below restarting the stream on every render. Kept current in an
  // effect rather than during render, which React forbids.
  const selectRef = useRef(select);
  const stopWhenRef = useRef(stopWhen);
  useEffect(() => {
    selectRef.current = select;
    stopWhenRef.current = stopWhen;
  });

  const reload = useCallback(() => {
    setStopped(false);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled || stopped || !url) return;

    let cancelled = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const stopRetry = () => {
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
    };

    /** Stop for good: the thing being watched will not change again. */
    const finish = () => {
      setStopped(true);
      source?.close();
      source = null;
      stopTimer();
      stopRetry();
    };

    const apply = (next: T) => {
      if (cancelled) return;
      setData(next);
      setError(null);
      if (stopWhenRef.current?.(next)) finish();
    };

    /** Ask over HTTP on a timer instead of listening to the stream. */
    const startPolling = () => {
      if (cancelled || timer) return;
      setStatus("polling");
      let inFlight = false;
      const tick = async () => {
        // A slow answer must not stack on top of the next tick: two replies
        // can arrive out of order and make a display step backwards.
        if (inFlight) return;
        inFlight = true;
        try {
          apply(await load());
        } catch (e) {
          if (!cancelled) setError(toPollError(e));
        } finally {
          inFlight = false;
        }
      };
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
    };

    /** Try the stream again, later, while the fallback keeps the page right. */
    const scheduleRetry = () => {
      if (cancelled || retry) return;
      const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempts);
      attempts += 1;
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, wait);
    };

    const connect = () => {
      if (cancelled) return;

      // No EventSource at all: behave exactly as the polling pages always did.
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }

      let connection: EventSource;
      try {
        connection = new EventSource(url);
      } catch {
        startPolling();
        scheduleRetry();
        return;
      }
      source = connection;

      connection.onopen = () => {
        if (cancelled) return;
        attempts = 0;
        stopTimer();
        setStatus("live");
      };

      connection.addEventListener(event, (message) => {
        try {
          apply(selectRef.current(JSON.parse((message as MessageEvent).data as string)));
          if (!cancelled) setStatus("live");
        } catch {
          // A frame that cannot be read is skipped; the next one still arrives.
        }
      });

      connection.onerror = () => {
        if (cancelled) return;
        // The stream is gone, whatever the reason. Ask on a timer while we
        // retry the stream: the fallback answers with real status codes, so
        // "the ticket is gone" and "the network is down" stay telling apart.
        connection.close();
        if (source === connection) source = null;
        startPolling();
        scheduleRetry();
      };
    };

    const cleanup = () => {
      cancelled = true;
      source?.close();
      stopTimer();
      stopRetry();
    };

    connect();
    return cleanup;
  }, [url, event, enabled, stopped, intervalMs, load, nonce]);

  return { data, error, status, reload };
}

function toPollError(e: unknown): PollError {
  if (e instanceof ApiError) return { message: e.message, status: e.status };
  return {
    message: e instanceof Error ? e.message : "Request failed",
    status: 0,
  };
}
