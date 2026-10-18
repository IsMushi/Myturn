"use client";

import { useCallback, useState } from "react";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { api } from "@/lib/api";
import { useMounted, useTicketToken } from "@/lib/useTicketToken";
import { usePolling } from "@/lib/usePolling";
import type { TicketCreated, TicketState } from "@/lib/types";

export default function VisitorPage() {
  // The ticket is remembered on the visitor's own phone.
  const [token, setToken] = useTicketToken();
  const mounted = useMounted();
  const [issued, setIssued] = useState<TicketCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = useCallback(
    async () => (token ? api.ticketState(token) : null),
    [token],
  );
  const { data, error: pollError } = usePolling<TicketState | null>(
    loadTicket,
    3000,
    Boolean(token),
  );
  const { data: desk } = usePolling(api.publicState, 3000);

  // Show the ticket the moment it is issued, then keep it up to date.
  const ticket: TicketState | null =
    data ??
    (issued
      ? {
          ticket_no: issued.ticket_no,
          status: "waiting",
          ahead: issued.ahead,
          created_at: "",
          called_at: null,
          service_state: issued.service_state,
        }
      : null);

  async function takeTicket() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createTicket("qr");
      setToken(created.token);
      setIssued(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not take a ticket");
    } finally {
      setBusy(false);
    }
  }

  function forgetTicket() {
    setToken(null);
    setIssued(null);
  }

  const state = ticket?.service_state ?? desk?.service_state ?? "paused";
  const served = desk?.called_no ?? null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Take your turn</h1>
        <DeskStateBadge state={state} />
      </div>

      <p className="mt-2 text-sm text-medium-green">
        One service desk, one queue. The number at the desk is shown below, and this page keeps
        your place even if you close it.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-white p-6 shadow-sm">
        {mounted && !token && (
          <div className="text-center">
            <p className="text-sm text-medium-green">Tap the button to join the queue.</p>
            <button
              onClick={() => void takeTicket()}
              disabled={busy || state === "closed"}
              className="mt-4 w-full rounded-xl bg-deep-green px-6 py-4 text-lg font-semibold text-white transition hover:bg-medium-green disabled:cursor-not-allowed disabled:bg-line disabled:text-medium-green"
            >
              {busy ? "Issuing…" : state === "closed" ? "The desk is closed" : "Take a ticket"}
            </button>
          </div>
        )}

        {token && ticket && (
          <div className="text-center">
            <p className="text-sm font-medium tracking-wide text-medium-green uppercase">
              Your number
            </p>
            <p className="mt-1 text-7xl font-bold tabular-nums text-deep-green">
              {ticket.ticket_no}
            </p>
            <p className="mt-4 text-lg font-medium">{statusLine(ticket)}</p>
            <p className="mt-2 text-sm text-medium-green">
              {ticket.status === "waiting"
                ? ticket.ahead === 0
                  ? "You are next in line."
                  : `${ticket.ahead} ${ticket.ahead === 1 ? "ticket is" : "tickets are"} ahead of you.`
                : ""}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-3 text-left text-sm">
              <div className="rounded-lg bg-light-lime/40 p-3">
                <dt className="text-medium-green">Now being served</dt>
                <dd className="text-xl font-semibold tabular-nums text-deep-green">
                  {served ?? "—"}
                </dd>
              </div>
              <div className="rounded-lg bg-light-lime/40 p-3">
                <dt className="text-medium-green">Waiting</dt>
                <dd className="text-xl font-semibold tabular-nums text-deep-green">
                  {desk?.waiting ?? "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => void takeTicket()}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-light-lime disabled:opacity-50"
              >
                Take another ticket
              </button>
              <button
                onClick={forgetTicket}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-deep-green hover:bg-soft-mint"
              >
                Forget this ticket
              </button>
            </div>
          </div>
        )}

        {!mounted && <p className="text-center text-medium-green">Loading…</p>}

        {error && <p className="mt-4 text-center text-sm text-rose-700">{error}</p>}
        {pollError && pollError.status === 404 && (
          <p className="mt-4 text-center text-sm text-rose-700">
            This ticket is no longer on the server. Take a new one.
          </p>
        )}
        {pollError && pollError.status !== 404 && (
          <p className="mt-4 text-center text-sm text-rose-700">{pollError.message}</p>
        )}
      </section>
    </div>
  );
}

function statusLine(ticket: TicketState): string {
  switch (ticket.status) {
    case "waiting":
      return "You are in the queue.";
    case "called":
      return "It is your turn. Please go to the service desk.";
    case "completed":
      return "You have been served. Thank you.";
    case "skipped":
      return "Your number was called and nobody came. Please take a new ticket.";
    case "cancelled":
      return "This ticket was cancelled.";
  }
}
