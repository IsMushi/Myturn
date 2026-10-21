"use client";

import { Clock3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { TIME_ZONE } from "@/lib/format";
import type { LiveStatus } from "@/lib/useLive";

import { ConnectionIndicator } from "./ConnectionIndicator";

/**
 * The strip along the top of the wall.
 *
 * The logo is the only thing on the left, and the only way back to the site.
 * It links home rather than adding a navigation bar to a television screen.
 * On the right the board says how it is connected and the current time, so a
 * visitor can read the clock the way they would on any wall. The time the
 * numbers were last confirmed is kept as a tooltip, so a frozen screen cannot
 * pass for a live one.
 */
export function PublicDisplayHeader({
  status,
  offline,
  updatedAt,
}: {
  status: LiveStatus;
  offline: boolean;
  updatedAt: string | null;
}) {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: TIME_ZONE,
    }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="myturn-display-header">
      <Link
        href="/"
        className="myturn-display-home"
        aria-label="MyTurn home"
        title="Back to MyTurn home"
      >
        <Logo className="myturn-display-logo" />
      </Link>
      <div className="myturn-display-status">
        <ConnectionIndicator status={status} offline={offline} />
        <span
          className="myturn-display-updated"
          title={updatedAt ? `Last data update: ${updatedAt}` : "Waiting for data"}
        >
          <Clock3 size={17} aria-hidden="true" />
          <span>{now ?? "—"}</span>
        </span>
      </div>
    </header>
  );
}