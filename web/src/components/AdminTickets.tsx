"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Alert, Field, Select, SelectItem, TextInput, inputClass } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { calendarDate, clockTime, formatDuration } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import type { TicketsList } from "@/lib/types";
import { toast } from "sonner";

const STATUSES = ["all", "waiting", "called", "completed", "skipped", "cancelled"] as const;

const STATUS_STYLES: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-900 ring-amber-300",
  called: "bg-soft-mint text-deep-green ring-medium-green",
  completed: "bg-medium-green/15 text-deep-green ring-medium-green",
  skipped: "bg-rose-100 text-rose-800 ring-rose-300",
  cancelled: "bg-rose-100 text-rose-800 ring-rose-300",
};

export function AdminTickets() {
  const [service, setService] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const load = useCallback(
    () =>
      api.ticketsList({
        service: service === "all" ? undefined : service,
        status: status === "all" ? undefined : status,
        q: appliedQuery || undefined,
        limit: pageSize,
        offset: page * pageSize,
      }),
    [service, status, appliedQuery, page],
  );
  const { data, error, refresh } = usePolling<TicketsList>(load, 15000);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  function applySearch() {
    setAppliedQuery(query.trim());
    setPage(0);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">All tickets</h1>
        <p className="mt-1 text-sm text-medium-green">
          Every ticket the office has issued, newest first. Search by number or contact.
        </p>
      </div>

      {error && <Alert tone="error" focus>{error.message}</Alert>}

      <section className="rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }}
            placeholder="Search number or contact…"
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm text-deep-green placeholder:text-medium-green/60 focus:outline-none focus:ring-2 focus:ring-deep-green/30"
            aria-label="Search tickets"
          />
          <Button variant="quiet" onClick={applySearch}>Search</Button>
          <Select
            id="ticket-service"
            value={service}
            onValueChange={(v) => { setService(v); setPage(0); }}
            className={inputClass}
            aria-label="Filter by service"
          >
            <SelectItem value="all">All services</SelectItem>
            <SelectItem value="A">A · General Service</SelectItem>
            <SelectItem value="B">B · Admissions</SelectItem>
            <SelectItem value="C">C · Finance</SelectItem>
          </Select>
          <Select
            id="ticket-status"
            value={status}
            onValueChange={(v) => { setStatus(v); setPage(0); }}
            className={inputClass}
            aria-label="Filter by status"
          >
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </Select>
          <Button variant="quiet" onClick={() => void refresh()}>Refresh</Button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-soft-mint/60 text-left text-xs font-semibold uppercase tracking-wide text-deep-green">
              <tr>
                <th className="px-4 py-3 font-mono">Ticket</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Desk</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Joined</th>
                <th className="px-4 py-3 text-right">Service time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {!data ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-soft-mint" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-soft-mint" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-soft-mint" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-soft-mint" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-12 animate-pulse rounded bg-soft-mint" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-soft-mint" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-soft-mint" /></td>
                  </tr>
                ))
              ) : data.tickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-medium-green">
                    No tickets match these filters.
                  </td>
                </tr>
              ) : (
                data.tickets.map((ticket) => (
                  <tr key={ticket.ticket_id} className="hover:bg-soft-mint/30">
                    <td className="px-4 py-3 font-mono font-semibold text-deep-green">
                      {ticket.label}
                    </td>
                    <td className="px-4 py-3 text-medium-green">{ticket.service_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                          STATUS_STYLES[ticket.status] ?? "bg-soft-mint text-deep-green ring-line"
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-medium-green">
                      {ticket.desk_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-medium-green">{ticket.source}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-medium-green">
                      {calendarDate(ticket.created_at)} {clockTime(ticket.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-medium-green">
                      {ticket.service_seconds !== null ? formatDuration(ticket.service_seconds) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-medium-green">
            <span>
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="quiet"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="tabular-nums">
                Page {safePage + 1} of {totalPages}
              </span>
              <Button
                variant="quiet"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}