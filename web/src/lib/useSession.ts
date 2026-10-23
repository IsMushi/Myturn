"use client";

import { useEffect, useState } from "react";

import { api } from "./api";
import type { SessionInfo } from "./types";

export type SessionState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "in"; session: SessionInfo };

/** Inactive minutes before the admin session times out. */
const IDLE_MINUTES = 20;

/**
 * Who this browser is signed in as.
 *
 * The answer comes from the server, never from anything stored in the browser,
 * so the pages behind it are guarded by the session cookie rather than by the
 * interface pretending to be careful.
 *
 * After ${IDLE_MINUTES} minutes of no mouse/keyboard activity the session is
 * automatically terminated so a logged‑in administrator cannot leave an
 * unattended session open.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [idleTimeout, setIdleTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let live = true;

    const resetIdle = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        setIdleTimeout(null);
      }
      setIdleTimeout(
        setTimeout(() => {
          if (!live) return;
          api.logout().then(() => setState({ status: "out" }));
        }, IDLE_MINUTES * 60 * 1000)
      );
    };

    const handleActivity = () => {
      resetIdle();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keypress", handleActivity);
    window.addEventListener("keydown", handleActivity);

    api
      .me()
      .then((session) => {
        if (!live) return;
        setState(session ? { status: "in", session } : { status: "out" });
        // Initial reset after login
        resetIdle();
      })
      .catch(() => {
        if (live) setState({ status: "out" });
      });

    return () => {
      live = false;
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keypress", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
    };
  }, [nonce]);

  // Another page in the console changed the account, so the copy the sidebar
  // carries is out of date. Reading it again is cheaper than keeping two.
  useEffect(() => {
    function onChanged() {
      setNonce((n) => n + 1);
    }
    window.addEventListener(SESSION_CHANGED, onChanged);
    return () => window.removeEventListener(SESSION_CHANGED, onChanged);
  }, []);

  return state;
}

/** The event that tells the rest of the console the account has changed. */
const SESSION_CHANGED = "myturn:session-changed";

/** Say that the account has changed, so the sidebar reads it again. */
export function announceSessionChange() {
  window.dispatchEvent(new Event(SESSION_CHANGED));
}
