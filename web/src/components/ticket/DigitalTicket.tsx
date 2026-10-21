"use client";

import { CalendarClock, Hash, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { TicketStatusBadge } from "@/components/ticket/TicketStatusBadge";
import { clockTime, plural } from "@/lib/format";
import type { ServiceState, TicketStatus } from "@/lib/types";

/**
 * The ticket itself, drawn as something a visitor could hand over or keep.
 *
 * The number is the number the server issued, never one worked out here: a
 * letter for the service and three digits for the place in its queue. The code
 * in the corner opens the same ticket on another device, so a visitor who
 * loses the page, or wants to show it at the desk, still has a way back to it.
 */
export function DigitalTicket({
  label,
  status,
  ahead,
  serviceName,
  deskState,
  issuedAt,
  trackUrl,
}: {
  label: string;
  status: TicketStatus;
  ahead: number;
  serviceName: string;
  deskState: ServiceState;
  issuedAt: string | null;
  trackUrl: string;
}) {
  return (
    <article
      data-print="ticket"
      className="overflow-hidden rounded-3xl border border-line bg-white"
      aria-label={ticketSummary(label, status, ahead)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-soft-mint px-5 py-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-medium-green uppercase">
            Service
          </p>
          <p className="font-semibold text-deep-green">{serviceName}</p>
        </div>
        <DeskStateBadge state={deskState} />
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div className="rounded-2xl bg-deep-green px-5 py-6 text-center">
          <p className="flex items-center justify-center gap-2 text-xs font-semibold tracking-wider text-light-lime uppercase">
            <Hash className="size-3.5" aria-hidden="true" />
            Ticket number
          </p>
          <p
            className="mt-1 text-7xl leading-none font-bold tabular-nums text-white sm:text-8xl"
            aria-label={`Ticket number ${label}`}
          >
            {label}
          </p>
          <div className="mt-5 flex justify-center">
            <TicketStatusBadge status={status} size="lg" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          {trackUrl ? (
            <div className="rounded-2xl border border-line bg-white p-3">
              <QRCodeSVG
                value={trackUrl}
                size={132}
                level="M"
                marginSize={0}
                bgColor="#FFFFFF"
                fgColor="#073D35"
                title="Scan to follow this ticket on another device"
              />
            </div>
          ) : (
            <div className="size-[156px] rounded-2xl border border-line bg-white p-3" aria-hidden="true" />
          )}
          <p className="max-w-[156px] text-center text-xs text-medium-green">
            Scan with another phone to follow the same ticket
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line">
        <Fact icon={Users} label="People ahead" value={String(ahead)} />
        <Fact
          icon={CalendarClock}
          label="Issued at"
          value={issuedAt ? clockTime(issuedAt) : "—"}
        />
      </dl>
    </article>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white px-5 py-3">
      <dt className="flex items-center gap-1.5 text-xs tracking-wide text-medium-green uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-deep-green">{value}</dd>
    </div>
  );
}

/** A one-line summary used above the ticket when it is read aloud. */
export function ticketSummary(label: string, status: TicketStatus, ahead: number): string {
  return `Ticket ${label}, status ${status}, ${plural(ahead, "person", "people")} ahead.`;
}
