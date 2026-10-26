"use client";

import {
  Inbox,
  Layers,
  MonitorCheck,
  RefreshCw,
  Search,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { singleLineClass } from "@/components/ui/field-styles";
import { api } from "@/lib/api";
import { activityLabel } from "@/lib/activity";
import { TIME_ZONE, clockTime, fullTimestamp, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { ActivityEntry, ActivityFeed, ServiceList } from "@/lib/types";

/**
 * What has happened lately, from all three records at once.
 *
 * The queue, the desk and the accounts each write their own history as they
 * change; this page only reads it back. Nothing here is a summary the server
 * keeps separately, so the list cannot drift from what actually happened.
 *
 * Read as days, not as one long column: the first question an administrator
 * asks of a history is "what changed today", and a flat list of a hundred and
 * fifty lines does not answer it. Each day is a heading with its own lines,
 * newest first, and the filters and the search narrow the same set.
 *
 * The contact details an account or a ticket carries stay on screen only while
 * the entry is in the list; nothing is copied anywhere.
 */

const KINDS = [
  { key: "all", label: "Everything", icon: Layers },
  { key: "ticket", label: "Tickets", icon: Ticket },
  { key: "desk", label: "Desk", icon: MonitorCheck },
  { key: "account", label: "Accounts", icon: Users },
] as const;

type KindFilter = (typeof KINDS)[number]["key"];

/** The colour of a line's icon tile, by the record it came from. */
const KIND_STYLE: Record<ActivityEntry["kind"], { tile: string; icon: typeof Ticket }> = {
  ticket: { tile: "bg-soft-mint text-deep-green", icon: Ticket },
  desk: { tile: "bg-soft-mint text-medium-green", icon: MonitorCheck },
  account: { tile: "bg-light-lime/45 text-deep-green", icon: Users },
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** The office's calendar day of a moment, as 2026-10-23. */
function dayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** "Today", "Yesterday", or the day's own name. */
function dayTitle(iso: string, today: string, yesterday: string): string {
  const key = dayKey(iso);
  const named = DAY_FORMAT.format(new Date(iso));
  if (key === today) return `Today — ${named}`;
  if (key === yesterday) return `Yesterday — ${named}`;
  return named.charAt(0).toUpperCase() + named.slice(1);
}

export function AdminActivity() {
  const load = useCallback(() => api.activity(200), []);
  const { data, error, refresh } = usePolling<ActivityFeed>(load, 10000);
  // A ticket, desk or account change should appear at the top at once.
  useLiveRefresh(refresh, 10000);

  // The account history names a service by its letter; the catalogue turns
  // that back into "A — General Service" for the reader.
  const services = usePolling<ServiceList>(
    useCallback(() => api.serviceList(), []),
    60000,
  );

  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const service of services.data?.services ?? []) map.set(service.letter, service.name);
    return map;
  }, [services.data]);

  const all = useMemo(() => data?.entries ?? [], [data]);

  const counts = useMemo(() => {
    const counted: Record<KindFilter, number> = {
      all: all.length,
      ticket: 0,
      desk: 0,
      account: 0,
    };
    for (const entry of all) counted[entry.kind] += 1;
    return counted;
  }, [all]);

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((entry) => {
      if (kind !== "all" && entry.kind !== kind) return false;
      if (!needle) return true;
      const haystack = [
        activityLabel(entry.event),
        entry.event,
        entry.actor,
        entry.email,
        entry.detail,
        entry.label,
        entry.desk,
        entry.service,
        entry.service ? names.get(entry.service) : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [all, kind, names, query]);

  // "Today" is the office's day and is read from the clock once the page is on
  // screen, not during the render: a heading should not depend on when React
  // happened to re-render it. Re-reading every minute also carries the page
  // over midnight without a reload.
  const [today, setToday] = useState("");
  const [yesterday, setYesterday] = useState("");
  useEffect(() => {
    const read = () => {
      const clock = Date.now();
      setToday(dayKey(new Date(clock).toISOString()));
      setYesterday(dayKey(new Date(clock - 86_400_000).toISOString()));
    };
    read();
    const timer = window.setInterval(read, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Newest first already, so a day's lines are gathered as they are met.
  const days = useMemo(() => {
    const grouped: { key: string; title: string; entries: ActivityEntry[] }[] = [];
    for (const entry of entries) {
      const key = dayKey(entry.at);
      const last = grouped[grouped.length - 1];
      if (last && last.key === key) {
        last.entries.push(entry);
      } else {
        grouped.push({ key, title: dayTitle(entry.at, today, yesterday), entries: [entry] });
      }
    }
    return grouped;
  }, [entries, today, yesterday]);

  async function reload() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const filtering = kind !== "all" || query.trim() !== "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Activity</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-medium-green">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full bg-medium-green shadow-[0_0_0_3px_rgba(41,131,93,0.16)]"
                aria-hidden="true"
              />
              Live
            </span>
            <span aria-hidden="true">·</span>
            <span>
              the most recent 200 events
              {data ? `, checked ${relative(data.server_time) === "0 s ago" ? "just now" : relative(data.server_time)}` : ", loading"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={refreshing}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-deep-green transition-colors hover:bg-soft-mint disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
        >
          <RefreshCw
            className={`size-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          Refresh
        </button>
      </div>

      <section aria-label="Narrow the history" className="rounded-2xl bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Which record to show" className="flex flex-wrap gap-2">
            {KINDS.map((option) => {
              const Icon = option.icon;
              const active = kind === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setKind(option.key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
                    active
                      ? "border-deep-green bg-deep-green text-white"
                      : "border-line bg-white text-deep-green hover:bg-soft-mint"
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {option.label}
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      active ? "bg-white/20 text-white" : "bg-soft-mint text-deep-green"
                    }`}
                  >
                    {counts[option.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-medium-green"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the history"
              placeholder="Ticket, service, person or detail"
              className={`${singleLineClass} pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none`}
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
        </div>

        <p className="mt-3 text-xs text-medium-green" aria-live="polite">
          {data
            ? filtering
              ? `Showing ${entries.length} of ${all.length} events.`
              : `Showing all ${all.length} events, newest first.`
            : "Reading the history…"}
        </p>
      </section>

      {error && <Alert tone="error">{`The history could not be read: ${error.message}`}</Alert>}

      {!data && !error && (
        <section aria-label="Reading the history" className="rounded-2xl bg-white p-5">
          <p className="sr-only" role="status">
            Loading the history…
          </p>
          <div className="space-y-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="size-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data && entries.length === 0 && (
        <section className="rounded-2xl bg-white p-8">
          <div className="mx-auto flex max-w-sm flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-soft-mint">
              <Inbox className="size-6 text-medium-green" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-deep-green">
              {filtering ? "Nothing matches that" : "Nothing has been recorded yet"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-medium-green">
              {filtering
                ? "No event in the most recent 200 fits the filter and the search. Clear them to see the whole history."
                : "Taking a ticket, opening a desk or inviting somebody writes the first line here."}
            </p>
            {filtering && (
              <button
                type="button"
                onClick={() => {
                  setKind("all");
                  setQuery("");
                }}
                className="mt-4 rounded-full bg-deep-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-medium-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
              >
                Clear the filters
              </button>
            )}
          </div>
        </section>
      )}

      {entries.length > 0 && (
        <section aria-label="Recorded events" className="rounded-2xl bg-white px-4 py-2 sm:px-5">
          {days.map((day) => (
            <section key={day.key} aria-label={day.title}>
              <h2 className="sticky top-0 z-10 -mx-1 flex flex-wrap items-baseline justify-between gap-2 bg-white/95 px-1 py-3 backdrop-blur-sm">
                <span className="text-xs font-semibold tracking-wide text-deep-green uppercase">
                  {day.title}
                </span>
                <span className="text-[11px] tabular-nums text-medium-green">
                  {day.entries.length} {day.entries.length === 1 ? "event" : "events"}
                </span>
              </h2>
              <ol className="divide-y divide-line/60 border-t border-line/60">
                {day.entries.map((entry, index) => (
                  <Row
                    key={`${entry.at}-${entry.kind}-${entry.event}-${index}`}
                    entry={entry}
                    serviceName={entry.service ? names.get(entry.service) : undefined}
                  />
                ))}
              </ol>
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ entry, serviceName }: { entry: ActivityEntry; serviceName?: string }) {
  const label = activityLabel(entry.event);
  const style = KIND_STYLE[entry.kind];
  const Icon = style.icon;

  // What the small print says, in the order it is useful: which queue, what the
  // record adds, and the address it belongs to. Empty parts are left out rather
  // than printed as a stray separator. A ticket's queue is named by its letter
  // and its name together, so the chip above and the line below agree.
  const queue = entry.service
    ? serviceName
      ? `${entry.service} · ${serviceName}`
      : entry.service
    : null;
  const detail = [queue, entry.detail, entry.email].filter(Boolean).join(" · ");

  return (
    <li className="flex items-start gap-3 py-3.5">
      <time
        dateTime={entry.at}
        title={fullTimestamp(entry.at)}
        className="w-11 shrink-0 pt-1.5 text-right text-xs tabular-nums text-medium-green"
      >
        {clockTime(entry.at)}
      </time>

      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${style.tile}`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-deep-green">{label}</span>
          {entry.label && (
            <span className="rounded-md bg-soft-mint px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-deep-green">
              {entry.label}
            </span>
          )}
          {entry.desk && <span className="text-xs text-medium-green">{entry.desk}</span>}
        </div>

        {detail && (
          <p className="mt-0.5 text-xs leading-relaxed break-words text-medium-green">{detail}</p>
        )}

        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-medium-green sm:hidden">
          <span>by {entry.actor}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={entry.at}>{relative(entry.at)}</time>
        </p>
      </div>

      <div className="hidden w-40 shrink-0 text-right sm:block">
        <p className="truncate text-xs text-medium-green" title={entry.actor}>
          by {entry.actor}
        </p>
        <time dateTime={entry.at} className="text-[11px] text-medium-green/80">
          {relative(entry.at)}
        </time>
      </div>
    </li>
  );
}
