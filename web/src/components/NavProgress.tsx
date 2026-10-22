"use client";

import { useEffect, useRef, useState } from "react";

interface Navigation {
  from: string;
  count: number;
  visible: boolean;
  finished: boolean;
}

function isPageLink(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return false;
  }
  return true;
}

function currentAddress(): string {
  return window.location.pathname + window.location.search;
}

export function NavProgress() {
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  const show = useRef<number | null>(null);
  const safety = useRef<number | null>(null);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (show.current) window.clearTimeout(show.current);
      if (safety.current) window.clearTimeout(safety.current);
      if (poll.current) window.clearInterval(poll.current);
    }

    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isPageLink(event, anchor)) return;

      clearTimers();
      const from = currentAddress();
      setNavigation((current) => ({
        from,
        count: (current?.count ?? 0) + 1,
        visible: false,
        finished: false,
      }));

      show.current = window.setTimeout(() => {
        setNavigation((current) => {
          if (!current || current.finished || current.from !== currentAddress()) return current;
          return { ...current, visible: true };
        });
      }, 120);

      poll.current = window.setInterval(() => {
        if (currentAddress() === from) return;
        window.clearInterval(poll.current ?? undefined);
        poll.current = null;
        setNavigation((current) =>
          current && current.from === from && !current.finished
            ? { ...current, finished: true }
            : current,
        );
      }, 60);

      safety.current = window.setTimeout(() => {
        setNavigation((current) => (current ? { ...current, finished: true } : current));
      }, 4000);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  const phase = !navigation || !navigation.visible ? "idle" : navigation.finished ? "done" : "loading";

  return (
    <div className="nav-progress" data-phase={phase} aria-hidden="true">
      <div key={navigation?.count ?? 0} className="nav-progress-bar" />
    </div>
  );
}
