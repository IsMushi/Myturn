"use client";

import { Inbox, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Alert, Select, SelectItem, inputClass } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { calendarDate, clockTime, formatDuration } from "@/lib/format";
import { TICKET_STATUS, TONE_STYLES } from "@/lib/ticket-status";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { usePolling } from "@/lib/usePolling";
import type { ServiceList, TicketStatus, TicketsList } from "@/lib/types";

const STATUSES = ["waiting", "called", "completed", "skipped", "cancelled"] as const;

const STATUS_LABELS: Record<TicketStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  completed: "Served",
  skipped: "Missed",
  cancelled: "Cancelled",
};

function statusBadge(status: string) {
  const key = status as TicketStatus;
  const style = TICKET_STATUS[key];
  return {
    label: STATUS_LABELS[key] ?? status,
    tone: style ? TONE_STYLES[style.tone] : "bg-soft-mint text-deep-green ring-line",
    Icon: style?.icon,
  };
}

const SKELETON_WIDTHS = ["w-16", "w-24", "w-16", "w-16", "w-12", "w-24", "w-16"];

export function AdminTickets() {
  const [service, setService] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
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

  const loadServices = useCallback(() => api.serviceList(), []);
  const services = usePolling<ServiceList>(loadServices, 60000);

  const live = useLiveRefresh(() => {
    void refresh();
  }, 15000);

  // The filters are server-side, so wait for the typing to stop rather than
  // asking on every key. Enter applies straight away.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(query.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const filtering = service !== "all" || status !== "all" || appliedQuery !== "";
  // A live refresh can leave the open page past the end of a shorter list.
  const beyondEnd = data !== null && data.tickets.length === 0 && total > 0;

  function clearFilters() {
    setService("all");
    setStatus("all");
    setQuery("");
    setAppliedQuery("");
    setPage(0);
  }

  async function manualRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-deep-green">All tickets</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-medium-green">
            <span>Every ticket the office has issued, newest first.</span>
            <span aria-hidden="true">·</span>
            {live === "live" ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full bg-medium-green shadow-[0_0_0_3px_rgba(41,131,93,0.16)]"
                  aria-hidden="true"
                />
                Live
              </span>
            ) : (
              <span>Updates automatically</span>
            )}
          </p>
        </div>
        <Button
          variant="quiet"
          onClick={() => void manualRefresh()}
          disabled={refreshing}
          className="shrink-0"
        >
          <RefreshCw
            className={`size-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {error && <Alert tone="error" focus>{error.message}</Alert>}

      <section aria-label="Narrow the tickets" className="rounded-2xl bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 basis-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-medium-green"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedQuery(query.trim());
                  setPage(0);
                }
              }}
              placeholder="Search by ticket number or contact"
              aria-label="Search tickets"
              className={`${inputClass} pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear the search"
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-medium-green transition-colors hover:bg-soft-mint hover:text-deep-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="grid w-full gap-3 sm:flex sm:w-auto">
            <label htmlFor="ticket-service" className="sr-only">
              Filter by service
            </label>
            <Select
              id="ticket-service"
              value={service}
              onValueChange={(value) => {
                setService(value);
                setPage(0);
              }}
              className="w-full sm:w-56"
            >
              <SelectItem value="all">All services</SelectItem>
              {(services.data?.services ?? []).map((entry) => (
                <SelectItem key={entry.letter} value={entry.letter}>
                  {entry.letter} · {entry.name}
                </SelectItem>
              ))}
            </Select>
            <label htmlFor="ticket-status" className="sr-only">
              Filter by status
            </label>
            <Select
              id="ticket-status"
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(0);
              }}
              className="w-full sm:w-44"
            >
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {STATUS_LABELS[entry]}
                </SelectItem>
              ))}
            </Select>
          </div>

          {filtering && (
            <Button variant="ghost" onClick={clearFilters} className="shrink-0">
              Clear filters
            </Button>
          )}
        </div>

        <p className="mt-3 text-xs text-medium-green" aria-live="polite">
          {data
            ? data.tickets.length === 0
              ? total === 0
                ? filtering
                  ? "No tickets match these filters."
                  : "No tickets yet."
                : "No tickets are on this page."
              : `Showing ${data.offset + 1}–${data.offset + data.tickets.length} of ${total} ${total === 1 ? "ticket" : "tickets"}, newest first.`
            : "Reading the tickets…"}
        </p>
      </section>

      <section className="rounded-2xl bg-white p-5">
        {data && data.tickets.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center px-2 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-soft-mint">
              <Inbox className="size-6 text-medium-green" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-deep-green">
              {beyondEnd ? "This page is empty" : filtering ? "Nothing matches that" : "No tickets yet"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-medium-green">
              {beyondEnd
                ? "The list is shorter than it was. Go back to the first page to see the tickets."
                : filtering
                  ? "No ticket fits the service, status and search together. Clear them to see the whole list."
                  : "A ticket appears here as soon as the first visitor takes one."}
            </p>
            {beyondEnd ? (
              <Button variant="solid" onClick={() => setPage(0)} className="mt-4">
                Go to the first page
              </Button>
            ) : filtering ? (
              <Button variant="solid" onClick={clearFilters} className="mt-4">
                Clear the filters
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label="All tickets">
                <thead>
                  <tr className="border-b border-line text-xs tracking-wide text-medium-green uppercase">
                    <th scope="col" className="py-2 pr-4 font-semibold">Ticket</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Service</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Desk</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Source</th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">Joined</th>
                    <th scope="col" className="py-2 text-right font-semibold">Service time</th>
                  </tr>
                </thead>
                <tbody>
                  {!data
                    ? Array.from({ length: 6 }, (_, row) => (
                        <tr key={row} className="border-b border-line/60 last:border-0">
                          {SKELETON_WIDTHS.map((width, column) => (
                            <td key={column} className={column === 6 ? "py-3" : "py-3 pr-4"}>
                              <Skeleton className={`h-4 ${width}`} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : data.tickets.map((ticket) => {
                        const badge = statusBadge(ticket.status);
                        const Icon = badge.Icon;
                        return (
                          <tr
                            key={ticket.ticket_id}
                            className="border-b border-line/60 last:border-0 hover:bg-soft-mint/30"
                          >
                            <td className="py-3 pr-4 font-mono font-semibold text-deep-green">
                              {ticket.label}
                            </td>
                            <td className="py-3 pr-4 text-medium-green">{ticket.service_name}</td>
                            <td className="py-3 pr-4">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge.tone}`}
                              >
                                {Icon && <Icon className="size-3.5" aria-hidden="true" />}
                                {badge.label}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-medium-green">{ticket.desk_name ?? "—"}</td>
                            <td className="py-3 pr-4 text-medium-green">{ticket.source}</td>
                            <td className="whitespace-nowrap py-3 pr-4 text-right text-xs tabular-nums text-medium-green">
                              {calendarDate(ticket.created_at)} {clockTime(ticket.created_at)}
                            </td>
                            <td className="whitespace-nowrap py-3 text-right text-xs tabular-nums text-medium-green">
                              {ticket.service_seconds !== null
                                ? formatDuration(ticket.service_seconds)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>

            {data && total > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-medium-green">
                <span>
                  Showing {data.offset + 1}–{data.offset + data.tickets.length} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="quiet"
                    disabled={safePage <= 0}
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                  >
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    Page {safePage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="quiet"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
