"use client";

import { useEffect, useState } from "react";

import { api } from "./api";
import type { SessionInfo } from "./types";

export type SessionState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "in"; session: SessionInfo };

/**
 * Who this browser is signed in as.
 *
 * The answer comes from the server, never from anything stored in the browser,
 * so the pages behind it are guarded by the session cookie rather than by the
 * interface pretending to be careful.
 */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .me()
      .then((session) => {
        if (!live) return;
        setState(session ? { status: "in", session } : { status: "out" });
      })
      .catch(() => {
        if (live) setState({ status: "out" });
      });
    return () => {
      live = false;
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
