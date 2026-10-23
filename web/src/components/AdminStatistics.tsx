"use client";

import {
  CheckCircle2,
  Download,
  Hourglass,
  Layers,
  RefreshCw,
  Target,
  Ticket,
  Timer,
  UserX,
} from "lucide-react";
import { useCallback, useState } from "react";

import { Alert } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { DailyTicketsChart, HourlyTicketsChart } from "@/components/AdminCharts";
import { api } from "@/lib/api";
import { formatDuration, plural, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { Stats } from "@/lib/types";

/**
 * The numbers the office left behind.
 *
 * Every figure is counted from rows the prototype already writes, and the
 * service-time measurement is the same one the visitor page uses, so the two
 * pages cannot disagree. Where there is not enough history the page says so
 * rather than showing a number that would not hold up.
 *
 * The page answers three questions in the order an administrator asks them:
 * how much came in (the totals), when it came (the two charts), and whether the
 * desk kept up (the service time and the comparison between lines). The scope
 * chosen at the top narrows all three at once, so the page never mixes a figure
 * for one queue with a figure for the office.
 *
 * Times are the server's, which are kept in UTC: the day boundary and the
 * hourly bars are Kigali's, because the office is in Kigali, and the page says
 * so.
 */

/** The parts of an issued ticket, in the order they are stacked. */
const OUTCOMES = [
  { key: "served", label: "Served", colour: "bg-deep-green", dot: "bg-deep-green" },
  { key: "no_shows", label: "No-shows", colour: "bg-warning", dot: "bg-warning" },
  { key: "cancelled", label: "Cancelled", colour: "bg-danger", dot: "bg-danger" },
  { key: "waiting", label: "Waiting now", colour: "bg-light-lime", dot: "bg-light-lime" },
] as const;

export function AdminStatistics() {
  const [filter, setFilter] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.stats(filter ?? undefined), [filter]);
  const { data, error, refresh } = usePolling<Stats>(load, 15000);
  // Tickets leaving the queue change the counts; refresh them as they do.
  useLiveRefresh(refresh, 15000);

  async function reload() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (error && !data) {
    return <Alert tone="error">{`The statistics could not be read: ${error.message}`}</Alert>;
  }

  const scope = filter ? data?.per_service.find((service) => service.id === filter) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Statistics</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-medium-green">
            <span>Counted from the tickets the office recorded</span>
            <span aria-hidden="true">·</span>
            <span>
              {data
                ? relative(data.server_time) === "0 s ago"
                  ? "updated just now"
                  : `updated ${relative(data.server_time)}`
                : "counting"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-deep-green transition-colors hover:bg-soft-mint disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
          <a
            href={api.ticketsCsvUrl}
            download
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-deep-green transition-colors hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
          >
            <Download className="size-4" aria-hidden="true" />
            Download tickets (CSV)
          </a>
        </div>
      </div>

      {error && data && (
        <Alert tone="error">{`This is the last count; refreshing failed: ${error.message}`}</Alert>
      )}

      {!data ? (
        <StatisticsSkeleton />
      ) : (
        <Statistics data={data} filter={filter} onFilter={setFilter} scopeName={scope?.name} />
      )}
    </div>
  );
}

function Statistics({
  data,
  filter,
  onFilter,
  scopeName,
}: {
  data: Stats;
  filter: string | null;
  onFilter: (next: string | null) => void;
  scopeName?: string;
}) {
  const { totals } = data;
  const issued = totals.issued;

  const share = (part: number) => (issued > 0 ? Math.round((part * 100) / issued) : 0);
  const servedShare = share(totals.served);

  return (
    <>
      <section aria-labelledby="scope-heading" className="rounded-2xl bg-white p-4 sm:p-5">
        <h2 id="scope-heading" className="text-xs font-semibold tracking-wide text-medium-green uppercase">
          Looking at
        </h2>
        <div role="group" aria-label="Which waiting list to count" className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onFilter(null)}
            aria-pressed={filter === null}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
              filter === null
                ? "border-deep-green bg-deep-green text-white"
                : "border-line bg-white text-deep-green hover:bg-soft-mint"
            }`}
          >
            <Layers className="size-3.5" aria-hidden="true" />
            The whole office
          </button>
          {data.per_service.map((service) => {
            const active = filter === service.id;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => onFilter(service.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
                  active
                    ? "border-deep-green bg-deep-green text-white"
                    : "border-line bg-white text-deep-green hover:bg-soft-mint"
                }`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-md text-[11px] font-bold ${
                    active ? "bg-white/15 text-white" : "bg-deep-green text-light-lime"
                  }`}
                  aria-hidden="true"
                >
                  {service.letter}
                </span>
                {service.name}
                {!service.is_active && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                      active ? "bg-white/15 text-white" : "bg-soft-mint text-medium-green"
                    }`}
                  >
                    off
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-xs text-medium-green" aria-live="polite">
          {filter === null
            ? "Every figure below covers the whole office, across each waiting list."
            : `Every figure below covers ${data.per_service.find((s) => s.id === filter)?.letter ?? filter} · ${scopeName ?? filter} only.`}
        </p>
      </section>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          icon={Ticket}
          label="Tickets issued"
          value={String(totals.issued)}
          note={filter ? "in this waiting list" : "across the office"}
        />
        <Kpi
          icon={CheckCircle2}
          label="Served"
          value={String(totals.served)}
          note={issued > 0 ? `${servedShare}% of the tickets issued` : "nothing issued yet"}
          share={servedShare}
        />
        <Kpi
          icon={UserX}
          label="No-shows"
          value={String(totals.no_shows)}
          note={
            issued > 0
              ? `${totals.no_show_percent}% of the tickets issued`
              : "nothing issued yet"
          }
          share={totals.no_show_percent}
          tone="warning"
        />
        <Kpi
          icon={Hourglass}
          label="Waiting now"
          value={String(totals.waiting)}
          note={filter ? "in this line now" : "in the lines now"}
          tone="lime"
        />
      </dl>

      <Outcomes totals={totals} />

      <div className="grid gap-5 xl:grid-cols-2">
        <HourlyTicketsChart hours={data.hours} />
        <DailyTicketsChart perDay={data.per_day} />
      </div>

      <ServiceTime data={data} filter={filter} />

      <ServiceTable data={data} filter={filter} onFilter={onFilter} />

      <p className="text-xs leading-relaxed text-medium-green">
        Every figure on this page comes from the tickets and events the system already recorded.
        Nothing here is projected or estimated, and a count of zero means the record has no such
        ticket — not that one is missing.
      </p>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  share,
  tone = "green",
}: {
  icon: typeof Ticket;
  label: string;
  value: string;
  note?: string;
  /** A proportion of the issued tickets, drawn as a thin line under the figure. */
  share?: number;
  tone?: "green" | "warning" | "lime";
}) {
  const bar = {
    green: "bg-medium-green",
    warning: "bg-warning",
    lime: "bg-light-lime",
  }[tone];

  return (
    <div className="rounded-2xl bg-white p-4">
      <dt className="flex items-center gap-2 text-xs font-semibold tracking-wide text-medium-green uppercase">
        <span className="grid size-7 place-items-center rounded-lg bg-soft-mint text-deep-green">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {label}
      </dt>
      <dd className="mt-2.5">
        <span className="block text-2xl font-semibold tabular-nums tracking-tight text-deep-green sm:text-3xl">
          {value}
        </span>
        {note && (
          <span className="mt-1 block text-[11px] leading-snug text-medium-green sm:text-xs">
            {note}
          </span>
        )}
        {share !== undefined && (
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-line/40" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${bar}`}
              style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
            />
          </span>
        )}
      </dd>
    </div>
  );
}

/**
 * Where every issued ticket ended up, as one bar and a legend.
 *
 * The four parts are always listed, at zero too, so the legend adds up to the
 * number of tickets issued rather than quietly dropping the empty categories.
 */
function Outcomes({ totals }: { totals: Stats["totals"] }) {
  const parts = OUTCOMES.map((part) => ({
    ...part,
    value: totals[part.key],
  }));
  const sum = parts.reduce((total, part) => total + part.value, 0);

  return (
    <section aria-labelledby="outcomes-heading" className="rounded-2xl bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="outcomes-heading" className="text-sm font-semibold text-deep-green">
          Where every ticket went
        </h2>
        <p className="text-xs tabular-nums text-medium-green">
          {plural(totals.issued, "ticket")} issued in total
        </p>
      </div>

      {totals.issued === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-medium-green">
          No ticket has been issued yet, so there is nothing to divide up.
        </p>
      ) : (
        <>
          <div
            className="mt-3 flex h-3 gap-px overflow-hidden rounded-full bg-soft-mint"
            role="img"
            aria-label={parts.map((part) => `${part.label} ${part.value}`).join(", ")}
          >
            {parts.map((part) =>
              part.value > 0 ? (
                <span
                  key={part.key}
                  className={`h-full ${part.colour}`}
                  style={{ width: `${(part.value * 100) / totals.issued}%` }}
                />
              ) : null,
            )}
            {sum < totals.issued && (
              <span
                className="h-full bg-line"
                style={{ width: `${((totals.issued - sum) * 100) / totals.issued}%` }}
                aria-hidden="true"
              />
            )}
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 xl:grid-cols-4">
            {parts.map((part) => (
              <li key={part.key} className="flex items-center gap-2 text-sm">
                <span className={`size-2.5 shrink-0 rounded-sm ${part.dot}`} aria-hidden="true" />
                <span className="text-medium-green">{part.label}</span>
                <span className="ml-auto font-semibold tabular-nums text-deep-green">
                  {part.value}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-medium-green">
                  {Math.round((part.value * 100) / totals.issued)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The distribution of service times, and the average the visitor page uses.
 *
 * The average alone would describe neither a desk that serves most visitors in
 * a minute nor the one visitor in ten who takes much longer, so the shape is
 * shown beside it. The target is only compared when one waiting list is
 * selected: a target belongs to a single service, and an office-wide percentage
 * against one service's target would be a figure that means nothing.
 */
function ServiceTime({ data, filter }: { data: Stats; filter: string | null }) {
  const measured = data.service_samples;
  const busiestBucket = data.histogram.reduce((best, bucket) => Math.max(best, bucket.count), 0);
  const bucketTotal = data.histogram.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <section aria-labelledby="service-time-heading" className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="service-time-heading"
            className="flex items-center gap-2 text-sm font-semibold text-deep-green"
          >
            <Timer className="size-4 text-medium-green" aria-hidden="true" />
            How long the desk takes
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-medium-green">
            Measured from the moment a number is called to the moment it is closed, over the
            tickets that were served.
          </p>
        </div>
        {filter !== null && (
          <span className="rounded-full bg-soft-mint px-3 py-1 text-xs font-semibold text-deep-green">
            {data.per_service.find((service) => service.id === filter)?.name ?? filter}
          </span>
        )}
      </div>

      {measured === 0 ? (
        <div className="mt-4 rounded-xl bg-soft-mint px-4 py-6 text-center">
          <p className="text-sm font-semibold text-deep-green">Not available yet</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-xs leading-relaxed text-medium-green">
            No ticket has been served and closed here, so there is nothing to measure. The first
            served ticket starts the count.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <p className="text-xs font-semibold tracking-wide text-medium-green uppercase">
              Average service time
            </p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-deep-green">
              {data.average_service_seconds === null
                ? "Not available"
                : formatDuration(data.average_service_seconds)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-medium-green">
              {data.average_service_seconds === null
                ? `measured on ${plural(measured, "ticket")}; the server withholds the average below its sample threshold rather than guess it`
                : `over the ${plural(measured, "most recently served ticket")}`}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line/70 pt-4">
              <div>
                <p className="text-xs text-medium-green">Middle</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-deep-green">
                  {data.median_service_seconds === null
                    ? "—"
                    : formatDuration(data.median_service_seconds)}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-medium-green">
                  half the visitors were quicker
                </p>
              </div>
              <div>
                <p className="text-xs text-medium-green">Served tickets</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-deep-green">{measured}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-medium-green">
                  in the average above
                </p>
              </div>
            </div>

            {filter === null ? (
              <p className="mt-5 rounded-xl bg-soft-mint px-3.5 py-3 text-xs leading-relaxed text-deep-green">
                A target belongs to one waiting list. Choose one above to see how often the desk
                met it.
              </p>
            ) : data.target_seconds === null ? (
              <p className="mt-5 rounded-xl bg-soft-mint px-3.5 py-3 text-xs leading-relaxed text-deep-green">
                No target is set for this waiting list. An administrator can add one in Desk
                settings.
              </p>
            ) : (
              <div className="mt-5">
                <p className="flex flex-wrap items-center gap-2 text-sm text-deep-green">
                  <Target className="size-4 text-medium-green" aria-hidden="true" />
                  Target <strong className="font-semibold">{formatDuration(data.target_seconds)}</strong>
                  {data.within_target_percent !== null && (
                    <span className="ml-auto text-xs text-medium-green">
                      met by {data.within_target_percent}% of the tickets measured
                    </span>
                  )}
                </p>
                {data.within_target_percent !== null && (
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-soft-mint"
                    role="progressbar"
                    aria-label="Share of served tickets closed within the target"
                    aria-valuenow={data.within_target_percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full rounded-full bg-medium-green"
                      style={{ width: `${data.within_target_percent}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-medium-green uppercase">
              Distribution
            </p>
            <ul className="mt-3 space-y-2.5">
              {data.histogram.map((bucket) => (
                <li key={bucket.label} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-medium-green">{bucket.label}</span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft-mint">
                    <span
                      className="block h-full rounded-full bg-medium-green"
                      style={{
                        width: `${busiestBucket ? (bucket.count / busiestBucket) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right font-semibold tabular-nums text-deep-green">
                    {bucket.count}
                  </span>
                  <span className="w-9 text-right text-[11px] tabular-nums text-medium-green">
                    {bucketTotal ? Math.round((bucket.count * 100) / bucketTotal) : 0}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-medium-green">
              Each closed ticket falls in exactly one row; the percentages are of the{" "}
              {plural(bucketTotal, "ticket")} counted.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Each waiting list against the others.
 *
 * The name is a button: choosing a line here does the same thing as choosing it
 * in the scope above, so a comparison can be turned into a close look without
 * scrolling back. The figures are the service's own, counted from its tickets.
 */
function ServiceTable({
  data,
  filter,
  onFilter,
}: {
  data: Stats;
  filter: string | null;
  onFilter: (next: string | null) => void;
}) {
  return (
    <section aria-labelledby="per-service-heading" className="rounded-2xl bg-white p-5">
      <h2 id="per-service-heading" className="text-sm font-semibold text-deep-green">
        Each waiting list
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-medium-green">
        What every service the office offers has done, counted from its own tickets. Choose a name
        to count only that line.
      </p>

      {/* A phone gets one row per waiting list with its figures in a grid. A
          five-column table on a 390 px screen shows two columns and hides the
          rest behind a sideways scroll that nobody notices is there. */}
      <ul className="mt-3 divide-y divide-line/60 border-t border-line/60 sm:hidden">
        {data.per_service.map((service) => {
          const active = filter === service.id;
          return (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => onFilter(active ? null : service.id)}
                aria-pressed={active}
                className={`-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
                  active ? "bg-soft-mint" : "hover:bg-soft-mint/60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold ${
                      active ? "bg-deep-green text-light-lime" : "bg-soft-mint text-deep-green"
                    }`}
                    aria-hidden="true"
                  >
                    {service.letter}
                  </span>
                  <span className="font-semibold text-deep-green">{service.name}</span>
                  {!service.is_active && (
                    <span className="rounded-md bg-soft-mint px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-medium-green uppercase">
                      off
                    </span>
                  )}
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <ServiceFigure label="Issued" value={service.issued} />
                  <ServiceFigure label="Served" value={service.served} />
                  <ServiceFigure label="Waiting" value={service.waiting} />
                  <ServiceFigure
                    label="Average"
                    value={
                      service.average_service_seconds === null
                        ? "Not available"
                        : formatDuration(service.average_service_seconds)
                    }
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <caption className="sr-only">
            Tickets issued, served and waiting, and the average service time, for each waiting
            list
          </caption>
          <thead>
            <tr className="border-b border-line text-[11px] tracking-wide text-medium-green uppercase">
              <th scope="col" className="py-2 pr-4 font-semibold">
                Waiting list
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Issued
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Served
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Waiting
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Average
              </th>
            </tr>
          </thead>
          <tbody>
            {data.per_service.map((service) => {
              const active = filter === service.id;
              return (
                <tr
                  key={service.id}
                  className={`border-b border-line/60 last:border-0 ${
                    active ? "bg-soft-mint/70" : ""
                  }`}
                >
                  <th scope="row" className="py-2.5 pr-4 font-normal">
                    <button
                      type="button"
                      onClick={() => onFilter(active ? null : service.id)}
                      aria-pressed={active}
                      className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left transition-colors hover:text-medium-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
                    >
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold ${
                          active ? "bg-deep-green text-light-lime" : "bg-soft-mint text-deep-green"
                        }`}
                        aria-hidden="true"
                      >
                        {service.letter}
                      </span>
                      <span className="font-semibold text-deep-green">{service.name}</span>
                      {!service.is_active && (
                        <span className="rounded-md bg-soft-mint px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-medium-green uppercase">
                          off
                        </span>
                      )}
                    </button>
                  </th>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-deep-green">
                    {service.issued}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="font-semibold tabular-nums text-deep-green">
                        {service.served}
                      </span>
                      <span
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-line/50"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-medium-green"
                          style={{
                            width: `${service.issued ? (service.served * 100) / service.issued : 0}%`,
                          }}
                        />
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-medium-green">
                    {service.waiting}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-deep-green">
                    {service.average_service_seconds === null
                      ? "Not available"
                      : formatDuration(service.average_service_seconds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One figure in the phone's waiting-list row. */
function ServiceFigure({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="block">
      <span className="block text-[11px] text-medium-green">{label}</span>
      <span className="block text-xs font-semibold tabular-nums text-deep-green">{value}</span>
    </span>
  );
}

function StatisticsSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <p className="sr-only" role="status">
        Counting the tickets…
      </p>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}
