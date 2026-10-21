"use client";

import { CheckCircle2, Printer, TicketCheck } from "lucide-react";

import { DigitalTicket } from "@/components/ticket/DigitalTicket";
import { Button, ButtonLink } from "@/components/ui/Button";
import type { ServiceState, TicketStatus } from "@/lib/types";

/**
 * The moment the ticket is issued.
 *
 * The visitor sees the number the desk will call, and three ways to keep it:
 * leave the page open, open the link on another device, or print it. The
 * instructions are short on purpose — they are read once, standing up.
 */
export function TicketConfirmation({
  label,
  status,
  ahead,
  serviceName,
  deskState,
  issuedAt,
  trackUrl,
  onAnother,
  onForget,
  busy = false,
}: {
  label: string;
  status: TicketStatus;
  ahead: number;
  serviceName: string;
  deskState: ServiceState;
  issuedAt: string | null;
  trackUrl: string;
  onAnother: () => void;
  onForget: () => void;
  busy?: boolean;
}) {
  return (
    <div className="myturn-ticket-focused space-y-6">
      <div className="print-hide flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-ink">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-deep-green">
            Your Ticket Is Ready
          </h1>
          <p className="mt-1 text-medium-green">
            Keep this page, or write the number down. The desk calls numbers in order.
          </p>
        </div>
      </div>

      <DigitalTicket
        label={label}
        status={status}
        ahead={ahead}
        serviceName={serviceName}
        deskState={deskState}
        issuedAt={issuedAt}
        trackUrl={trackUrl}
      />

      <div className="print-hide space-y-5">
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={trackUrl ? new URL(trackUrl).pathname : "/ticket"} size="lg">
            <TicketCheck className="size-4" aria-hidden="true" />
            Track My Turn
          </ButtonLink>
          <Button variant="quiet" size="lg" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            Print ticket
          </Button>
        </div>

        <div className="rounded-2xl border border-line bg-soft-mint p-5">
          <h2 className="text-sm font-semibold tracking-wide text-deep-green uppercase">
            What happens next
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-deep-green">
            <li className="flex gap-2">
              <span className="font-semibold">1.</span>
              Watch the screen in the waiting area, or leave this page open. It updates on its own.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">2.</span>
              When your number appears, go to the {serviceName} desk.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold">3.</span>
              If you miss your call, your ticket returns to the back of the queue with a new number. Keep this page open for the update.
            </li>
          </ol>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
          <Button variant="link" onClick={onAnother} disabled={busy}>
            Take a ticket for somebody else
          </Button>
          <Button variant="link" onClick={onForget}>
            Remove this ticket from this phone
          </Button>
        </div>
      </div>
    </div>
  );
}
