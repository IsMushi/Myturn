"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Radio, Ticket } from "lucide-react";

import { api } from "@/lib/api";
import type { ServiceState } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

import { homeStyles as styles } from "./public-home";

const AVAILABILITY: Record<ServiceState, string> = {
  active: "Available",
  paused: "Paused",
  closed: "Closed",
};

/** The supplied concept artwork, separate from the page's real text and links. */
export function HeroVisual() {
  return (
    <figure className={styles.visual} aria-label="MyTurn service desk concept illustration">
      <Image
        src="/images/hero-desk-scene.webp"
        alt="Illustrated waiting room with a visitor following a ticket on their phone, a service desk and a wall display. Sensor and ESP32 callouts are connected by lime lines. Ticket numbers in the illustration are examples."
        width={932}
        height={843}
        preload
        sizes="(min-width: 1100px) 56vw, 100vw"
        className={styles.scene}
      />
      <figcaption className="sr-only">Illustration with example tickets. The separate live waiting-list panel shows the current service status.</figcaption>
      <LiveDeskPanel />
    </figure>
  );
}

/** Only this badge is live; the ticket numbers in the artwork are examples. */
function LiveDeskPanel() {
  const { data, error } = usePolling(api.publicState, 15000);
  const unavailable = error !== null;
  // The first service of the office is the one the panel speaks for.
  const service = data?.services?.[0];
  const state = service?.service_state ?? data?.service_state;
  const calling = service?.now_serving?.[0];
  const label = unavailable
    ? "Updates unavailable"
    : state
      ? AVAILABILITY[state]
      : "Connecting…";
  const hasCall = !unavailable && Boolean(calling);
  const heading = unavailable
    ? "Connection interrupted"
    : !data
      ? "Checking the waiting list"
      : hasCall
        ? "Now serving"
        : "No active call";
  const value = unavailable
    ? "Please check back shortly"
    : !data
      ? "Connecting…"
      : hasCall
        ? calling!.label
        : state === "paused"
          ? "Service is paused"
          : state === "closed"
            ? "Service is closed"
            : "Waiting for the next visitor";

  return (
    <div className={styles.livePanel}>
      <div role="status" aria-live="polite" aria-atomic="true">
        <div className="myturn-home-live-header">
          <span><Radio size={15} aria-hidden="true" /> Live waiting list</span>
          <span className="myturn-home-live-state" data-state={unavailable ? "offline" : state ?? "loading"}>
            <span aria-hidden="true" />{label}
          </span>
        </div>
        <p className="myturn-home-live-service" title={service?.name}>{service?.name ?? "Service desk"}</p>
        <div className="myturn-home-live-body">
          <span className="myturn-home-live-icon"><Ticket size={23} aria-hidden="true" /></span>
          <div>
            <p className="myturn-home-live-label">{heading}</p>
            <p className="myturn-home-live-value" data-called={hasCall}>{value}</p>
          </div>
        </div>
      </div>
      <Link href="/display" className="myturn-home-live-link">View live display <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </div>
  );
}
