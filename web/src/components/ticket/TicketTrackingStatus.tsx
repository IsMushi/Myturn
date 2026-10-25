"use client";

import { Clock, RefreshCw, TicketX, UserRoundX } from "lucide-react";

import { QueueStatusCard } from "@/components/ticket/QueueStatusCard";
import { TicketStatusBadge } from "@/components/ticket/TicketStatusBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { clockTime, plural } from "@/lib/format";
import { TICKET_STATUS, isFinished } from "@/lib/ticket-status";
import type { PublicState, TicketState } from "@/lib/types";

/**
 * A ticket the visitor is following.
 *
 * The state is the server's, polled while the ticket is still moving. Once the
 * desk is finished with it the polling stops and the page says what happened,
 * so nothing keeps asking a question that has already been answered.
 *
 * The headline sits in a live region, so a visitor listening to the page hears
 * the change the moment their number comes up.
 */
export function TicketTrackingStatus({
  ticket,
  state,
  loading,
  stateLoading,
  error,
  onRetry,
  onAnother,
  onForget,
  busy = false,
}: {
  ticket: TicketState | null;
  state: PublicState | null;
  loading: boolean;
  stateLoading: boolean;
  error: { message: string; missing: boolean } | null;
  onRetry: () => void;
  onAnother: () => void;
  onForget: () => void;
  busy?: boolean;
}) {
  if (error) return <TicketUnavailable {...error} onRetry={onRetry} onForget={onForget} />;

  if (loading && !ticket) {
    return (
      <div className="space-y-5" aria-busy="true">
        <span className="sr-only">Loading your ticket…</span>
        <div className="rounded-3xl border border-line bg-white p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-20 w-40" />
          <Skeleton className="mt-4 h-8 w-32" />
        </div>
        <QueueStatusCard service={null} loading />
      </div>
    );
  }

  if (!ticket) return null;

  const style = TICKET_STATUS[ticket.status];
  const Icon = style.icon;
  const finished = isFinished(ticket.status);

  return (
    <div className="myturn-ticket-tracking">
      <section
        className={[
          "myturn-ticket-tracking-banner rounded-3xl border p-6 text-center",
          bannerTone(ticket.status),
        ].join(" ")}
        aria-labelledby="ticket-headline"
      >
        <p className="text-sm font-medium">
          Your number
        </p>
        <p className="myturn-ticket-tracking-number mt-3 leading-none font-bold tabular-nums">
          <span aria-label={`Ticket number ${ticket.label}`}>{ticket.label}</span>
        </p>

        <div className="mt-5 flex justify-center">
          <TicketStatusBadge status={ticket.status} size="lg" />
        </div>

        {/* The change a visitor is waiting for is announced, not just redrawn. */}
        <div role="status" aria-live="polite">
          <h1
            id="ticket-headline"
            className="mt-5 flex items-center justify-center gap-2 text-2xl font-semibold"
          >
            <Icon
              className={[
                "size-6",
                ticket.status === "called" ? "motion-safe:animate-pulse" : "",
              ].join(" ")}
              aria-hidden="true"
            />
            {style.headline}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm opacity-90">{style.detail}</p>
          {ticket.status === "called" && ticket.desk && (
            <p className="mt-3 text-lg font-bold">Go to {ticket.desk}</p>
          )}
        </div>

        {ticket.status === "waiting" && ticket.ahead === 0 && (
          <p className="mt-3 text-sm font-semibold">You are next in line.</p>
        )}
      </section>

      {/* A missed call gives the ticket a new number on the same link. Saying
          so is the difference between an explained queue and a mystery. */}
      {ticket.last_requeue && !finished && (
        <section
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900"
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <Clock className="size-4" aria-hidden="true" />
            This ticket was called and missed
          </h2>
          <p className="mt-1">
            {ticket.last_requeue.previous_label
              ? `We called ${ticket.last_requeue.previous_label} at ${clockTime(ticket.last_requeue.at)} and the turn was not taken in time, so it went to the back of the line. `
              : `The turn at ${clockTime(ticket.last_requeue.at)} was not taken in time, so the ticket went to the back of the line. `}
            You now hold <strong>{ticket.label}</strong>.
          </p>
        </section>
      )}

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="sr-only">
          The waiting list right now
        </h2>
        <QueueStatusCard
          service={
            state?.services.find((service) => service.id === ticket.service.id) ??
            ticket.service
          }
          ahead={ticket.ahead}
          aheadLabels={ticket.ahead_labels}
          loading={stateLoading}
        />
      </section>

      <section className="myturn-ticket-tracking-meta flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-white px-5 py-4 text-sm">
        <p className="text-medium-green">
          Service: <span className="font-semibold text-deep-green">{ticket.service.name}</span>
        </p>
        <p className="text-medium-green">
          Position:{" "}
          <span className="font-semibold text-deep-green">
            {plural(ticket.ahead, "person", "people")} ahead
          </span>
        </p>
        <p className="ml-auto flex items-center gap-2 text-medium-green">
          Last checked {clockTime(ticket.server_time)}
          <Button variant="quiet" onClick={onRetry} aria-label="Check now">
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        </p>
      </section>

      <section className="myturn-ticket-tracking-actions flex flex-wrap gap-4">
        {(ticket.status === "waiting" || ticket.status === "called") ? (
          <Button
            variant="quiet"
            onClick={async () => {
              if (typeof window !== "undefined") {
                const ok = window.confirm("Give up your place in this queue?");
                if (!ok) return;
              }
              try {
                const { api } = await import("@/lib/api");
                // Try to get token from URL
                if (typeof window !== "undefined") {
                  const parts = window.location.pathname.split("/");
                  const token = parts[parts.length - 1];
                  if (token && token !== "ticket") {
                    await api.giveUpTicket(token);
                    window.location.reload();
                    return;
                  }
                }
                window.location.reload();
              } catch (e) {
                // ignore
              }
            }}
            disabled={busy}
          >
            Give up my place
          </Button>
        ) : null}
        {finished && (
          <Button size="lg" onClick={onAnother} disabled={busy}>
            Take a new ticket
          </Button>
        )}
        <Button variant="link" onClick={onForget}>
          Remove this ticket from this phone
        </Button>
      </section>
    </div>
  );
}

/** The colours of the banner, chosen to match the state without relying on them. */
function bannerTone(status: TicketState["status"]): string {
  switch (status) {
    case "called":
      return "border-medium-green bg-primary text-ink";
    case "waiting":
      return "border-line bg-soft-mint text-deep-green";
    case "skipped":
      return "border-amber-300 bg-amber-50 text-amber-900";
    case "cancelled":
      return "border-danger-line bg-danger-soft text-danger";
    case "completed":
      return "border-line bg-white text-deep-green";
  }
}

/**
 * The ticket link no longer works.
 *
 * Either the server has never heard of the token, or it cannot be reached. The
 * visitor is told which, because the two need different things from them.
 */
function TicketUnavailable({
  message,
  missing,
  onRetry,
  onForget,
}: {
  message: string;
  missing: boolean;
  onRetry: () => void;
  onForget: () => void;
}) {
  return (
    <div className="rounded-3xl border border-danger-line bg-danger-soft p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-danger">
        {missing ? (
          <TicketX className="size-6" aria-hidden="true" />
        ) : (
          <UserRoundX className="size-6" aria-hidden="true" />
        )}
      </span>
      <h1 className="mt-4 text-xl font-semibold text-danger">
        {missing ? "This ticket is no longer available" : "We could not reach the ticket service"}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-danger">
        {missing
          ? "The ticket has been cleared from the server, or the link is not complete. Please take a fresh ticket at the desk."
          : message}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {!missing && (
          <Button variant="quiet" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        )}
        <ButtonLink href="/ticket" variant="quiet">
          Take a fresh ticket
        </ButtonLink>
        <Button variant="link" onClick={onForget}>
          Remove from this phone
        </Button>
      </div>
    </div>
  );
}
