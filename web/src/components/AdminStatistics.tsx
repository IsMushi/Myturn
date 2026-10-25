"use client";

import {
  ArrowRight,
  CheckCircle2,
  Download,
  Hourglass,
  Layers,
  MonitorSmartphone,
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
import { DateRangePicker } from "@/components/staff/DateRangePicker";
import { api } from "@/lib/api";
import { formatDuration, plural, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { Stats } from "@/lib/types";

/**
 * What the office left behind.
 *
 * The page answers four questions in the order an administrator asks them: how
 * much came in (the totals), what became of it (the outcomes), when it came (the
 * two charts), and how long it took (waiting, service, and the two together).
 * The counters close it, because a counter is where a waiting list actually
 * happens. The two controls at the top narrow all of it at once — one period, one
 * waiting list — so the page can never mix a figure for this week with a figure
 * for the office.
 *
 * Three rules hold everywhere below, and the page says so rather than leaving a
 * reader to discover them:
 *
 * - Every figure is counted from rows the prototype already writes. Nothing is
 *   projected, and a band that nobody landed in is reported as a zero.
 * - A share is taken over the tickets that have been *decided* — served, missed
 *   or cancelled — never over every ticket ever taken, so a line that is growing
 *   does not read as a desk that is falling behind.
 * - A mean is withheld until it rests on enough tickets, which is what "Not
 *   available" means.
 *
 * Times are the server's, kept in UTC; the day boundary and the hourly bars are
 * Kigali's, because the office is in Kigali and the page says so.
 */

/** The periods the page offers, in the order it offers them. */
const PERIODS = [
  { key: "all", label: "All time", days: null },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
] as const;

/** The parts of an issued ticket, in the order they are stacked. */
const OUTCOMES = [
  { key: "served", label: "Served", colour: "bg-deep-green", dot: "bg-deep-green" },
  { key: "no_shows", label: "No-shows", colour: "bg-warning", dot: "bg-warning" },
  { key: "cancelled", label: "Cancelled", colour: "bg-danger", dot: "bg-danger" },
  { key: "waiting", label: "Waiting now", colour: "bg-light-lime", dot: "bg-light-lime" },
] as const;

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10-24" as "24 Oct 2026", without moving the day through a timezone. */
function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : DAY_LABEL.format(date);
}

/** The chosen period, in the words the page uses for it. */
function periodLabel(window: Stats["window"]): string {
  if (window.from && window.to) {
    if (window.from === window.to) return dayLabel(window.from);
    return `${dayLabel(window.from)} – ${dayLabel(window.to)}`;
  }
  return "all of its history";
}

/**
 * Whether the figures in hand were counted for the controls that are showing.
 *
 * The server answers with the period it used and the waiting list it filtered
 * on, so a page that has just changed a filter can tell that the numbers it is
 * still holding belong to the one before.
 */
function answersQuery(
  data: Stats,
  service: string | null,
  period: { days: number | null; from?: string; to?: string },
): boolean {
  if (data.filter.service !== (service ?? null)) return false;
  if (period.from && period.to) {
    return data.window.from === period.from && data.window.to === period.to;
  }
  return data.window.days === period.days;
}

export function AdminStatistics() {
  const [service, setService] = useState<string | null>(null);
  const [period, setPeriod] = useState<{ days: number | null; from?: string; to?: string }>({
    days: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () => api.stats({ service: service ?? undefined, ...period }),
    [service, period],
  );
  const { data, error, refresh } = usePolling<Stats>(load, 15000);
  // Tickets leaving the queue change the counts; refresh them as they do.
  useLiveRefresh(refresh, 15000);

  /**
   * The filters and the figures can disagree for a moment: the new period is
   * asked for, and the old figures are still on screen. They are dimmed until
   * the answer for the chosen period arrives, because a number labelled with a
   * period it does not describe is worse than a number that is late. The server
   * echoes back what it counted, so this is read off the answer rather than
   * tracked in an effect of its own.
   */
  const stale = data !== null && !answersQuery(data, service, period);

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

  const scopeName = service ? data?.per_service.find((row) => row.id === service)?.name : undefined;
  const custom = Boolean(period.from && period.to);

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
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-deep-green transition-colors hover:bg-soft-mint disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
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
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-deep-green transition-colors hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
          >
            <Download className="size-4" aria-hidden="true" />
            Download tickets (CSV)
          </a>
        </div>
      </div>

      {error && data && (
        <Alert tone="error">{`This is the last count; refreshing failed: ${error.message}`}</Alert>
      )}

      <Filters
        data={data}
        service={service}
        onService={setService}
        period={period}
        onPeriod={setPeriod}
        custom={custom}
      />

      {!data ? (
        <StatisticsSkeleton />
      ) : (
        <div
          className={`space-y-5 transition-opacity ${stale ? "opacity-50" : "opacity-100"}`}
          aria-busy={stale}
        >
          <Statistics data={data} service={service} onService={setService} scopeName={scopeName} />
        </div>
      )}
    </div>
  );
}

/**
 * The two controls that narrow everything below: a period of Kigali days, and
 * the waiting list. They live in one panel on purpose — they are the same kind of
 * decision, and a page with a period in one corner and a queue in another asks a
 * reader to work out whether the two are still in step.
 */
function Filters({
  data,
  service,
  onService,
  period,
  onPeriod,
  custom,
}: {
  data: Stats | null;
  service: string | null;
  onService: (next: string | null) => void;
  period: { days: number | null; from?: string; to?: string };
  onPeriod: (next: { days: number | null; from?: string; to?: string }) => void;
  custom: boolean;
}) {
  return (
    <section aria-labelledby="filters-heading" className="rounded-2xl bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2
          id="filters-heading"
          className="text-xs font-semibold tracking-wide text-medium-green uppercase"
        >
          Counting
        </h2>
        <p className="text-xs leading-relaxed text-medium-green">
          {data
            ? `Every figure below covers ${periodLabel(data.window)}${
                service ? ` · ${data.per_service.find((row) => row.id === service)?.name ?? service}` : ""
              }.`
            : "Choosing the period and the waiting list…"}
        </p>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <p id="period-label" className="text-xs font-semibold text-deep-green">
            Period
          </p>
          <div
            role="group"
            aria-labelledby="period-label"
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            {PERIODS.map((choice) => {
              const active = !custom && period.days === choice.days;
              return (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => onPeriod({ days: choice.days })}
                  aria-pressed={active}
                  className={`inline-flex min-h-10 items-center rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
                    active
                      ? "border-deep-green bg-deep-green text-white"
                      : "border-line bg-white text-deep-green hover:bg-soft-mint"
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
            <DateRangePicker
              from={period.from}
              to={period.to}
              onApply={(next) =>
                onPeriod(
                  next.from && next.to
                    ? { days: null, from: next.from, to: next.to }
                    : { days: null },
                )
              }
              className={
                custom
                  ? "border-deep-green bg-deep-green text-white hover:bg-medium-green"
                  : undefined
              }
            />
          </div>
        </div>

        <div>
          <p id="scope-label" className="text-xs font-semibold text-deep-green">
            Waiting list
          </p>
          <div role="group" aria-labelledby="scope-label" className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onService(null)}
              aria-pressed={service === null}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
                service === null
                  ? "border-deep-green bg-deep-green text-white"
                  : "border-line bg-white text-deep-green hover:bg-soft-mint"
              }`}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              The whole office
            </button>
            {data?.per_service.map((row) => {
              const active = service === row.id;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onService(row.id)}
                  aria-pressed={active}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border py-2 pr-3 pl-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
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
                    {row.letter}
                  </span>
                  {row.name}
                  {!row.is_active && (
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
        </div>
      </div>
    </section>
  );
}

function Statistics({
  data,
  service,
  onService,
  scopeName,
}: {
  data: Stats;
  service: string | null;
  onService: (next: string | null) => void;
  scopeName?: string;
}) {
  const { totals } = data;
  const inPeriod = data.window.days !== null;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          icon={Ticket}
          label="Tickets issued"
          value={String(totals.issued)}
          note={service ? "in this waiting list" : "across the office"}
        />
        <Kpi
          icon={CheckCircle2}
          label="Served"
          value={String(totals.served)}
          note={
            totals.decided > 0
              ? `${totals.served_percent}% of the ${plural(totals.decided, "decided ticket")}`
              : "nothing decided yet"
          }
          share={totals.served_percent}
        />
        <Kpi
          icon={UserX}
          label="No-shows"
          value={String(totals.no_shows)}
          note={
            totals.decided > 0
              ? `${totals.no_show_percent}% of the ${plural(totals.decided, "decided ticket")}`
              : "nothing decided yet"
          }
          share={totals.no_show_percent}
          tone="warning"
        />
        <Kpi
          icon={Hourglass}
          label="Waiting now"
          value={String(totals.waiting)}
          note={inPeriod ? "right now, whatever the period" : "in the lines now"}
          tone="lime"
        />
      </dl>

      <Outcomes totals={totals} />

      <div className="grid gap-5 xl:grid-cols-2">
        <HourlyTicketsChart
          hours={data.hours}
          scope={
            inPeriod
              ? "Every ticket taken in the period, by the hour of the Kigali day it was taken."
              : "Every ticket, counted by the hour of the Kigali day it was taken."
          }
        />
        <DailyTicketsChart
          perDay={data.per_day}
          scope={
            inPeriod
              ? "Issued and served for each day of the period, quiet days included."
              : "Issued and served for the most recent days that had tickets, at most fourteen."
          }
        />
      </div>

      <HowLong data={data} service={service} />

      <ServiceTable data={data} service={service} onService={onService} scopeName={scopeName} />

      <CounterTable data={data} service={service} />

      <p className="text-xs leading-relaxed text-medium-green">
        Every figure on this page is counted from the tickets and events the system recorded, over{" "}
        {periodLabel(data.window)}. A share is taken over the tickets that have been decided — served,
        missed or cancelled — not over every ticket ever taken, so a line that is still growing does
        not read as a desk that is falling behind. A mean is withheld until it rests on enough served
        tickets, and a count of zero means the record has no such ticket — not that one is missing.
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
  /** A proportion, drawn as a thin line under the figure. */
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
 * The shares here are of the tickets taken — that is what the bar divides — which
 * is a different question from the served rate above, and the caption says so.
 */
function Outcomes({ totals }: { totals: Stats["totals"] }) {
  const parts = OUTCOMES.map((part) => ({ ...part, value: totals[part.key] }));
  const sum = parts.reduce((total, part) => total + part.value, 0);

  return (
    <section aria-labelledby="outcomes-heading" className="rounded-2xl bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="outcomes-heading" className="text-sm font-semibold text-deep-green">
          Where every ticket went
        </h2>
        <p className="text-xs tabular-nums text-medium-green">
          {plural(totals.issued, "ticket")} issued · shares of the tickets taken
        </p>
      </div>

      {totals.issued === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-medium-green">
          No ticket has been issued in this period, so there is nothing to divide up.
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

          {totals.requeued > 0 && (
            <p className="mt-3 rounded-xl bg-soft-mint px-3.5 py-2.5 text-xs leading-relaxed text-deep-green">
              {plural(totals.requeued, "turn")} {totals.requeued === 1 ? "was" : "were"} given back to
              the queue after a call nobody answered. Those visitors came back under a new number, so
              they are counted as served or waiting, not as no-shows.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The two halves of a visit, and the shape of each.
 *
 * Waiting and service are measured from different timestamps but they are read
 * together, because "we serve people in two minutes" is only half the story if
 * they stood in line for twenty. The three figures come first, then one bar that
 * shows how the total divides, then the distributions — a mean alone describes
 * neither a desk that serves most visitors quickly nor the one visitor in ten who
 * takes much longer.
 *
 * The target belongs to one waiting list, so it is only compared when one is
 * chosen: an office-wide percentage against one service's promise would be a
 * figure that means nothing.
 */
function HowLong({ data, service }: { data: Stats; service: string | null }) {
  const wait = data.wait;
  const serviceAverage = data.average_service_seconds;
  const total = wait.average_total_seconds;
  const both = wait.average_seconds !== null && serviceAverage !== null;
  const sum = both ? (wait.average_seconds ?? 0) + (serviceAverage ?? 0) : 0;

  return (
    <section aria-labelledby="how-long-heading" className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="how-long-heading"
            className="flex items-center gap-2 text-sm font-semibold text-deep-green"
          >
            <Timer className="size-4 text-medium-green" aria-hidden="true" />
            How long it takes
          </h2>
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-medium-green">
            Waiting is measured from the moment a number is taken to the moment a desk calls it;
            service, from that call to the moment the ticket is closed. Both come from the tickets
            themselves, and a ticket that was called and missed carries its whole wait with it.
          </p>
        </div>
        {service !== null && (
          <span className="rounded-full bg-soft-mint px-3 py-1 text-xs font-semibold text-deep-green">
            {data.per_service.find((row) => row.id === service)?.name ?? service}
          </span>
        )}
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <Time figure={wait.average_seconds} label="They waited" samples={wait.samples} unit="turn" />
        <Time
          figure={serviceAverage}
          label="The counter took"
          samples={data.service_samples}
          unit="served ticket"
        />
        <Time figure={total} label="In the office" samples={0} unit="" strong />
      </dl>

      {both && sum > 0 ? (
        <div className="mt-4">
          <div
            className="flex h-3 overflow-hidden rounded-full bg-soft-mint"
            role="img"
            aria-label={`Of ${formatDuration(sum)} in the office, ${formatDuration(
              wait.average_seconds ?? 0,
            )} waiting and ${formatDuration(serviceAverage ?? 0)} at the counter.`}
          >
            <span
              className="h-full bg-light-lime"
              style={{ width: `${((wait.average_seconds ?? 0) * 100) / sum}%` }}
            />
            <span
              className="h-full bg-deep-green"
              style={{ width: `${((serviceAverage ?? 0) * 100) / sum}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-medium-green">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-light-lime" aria-hidden="true" />
              Waiting
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-deep-green" aria-hidden="true" />
              At the counter
            </span>
            <span className="ml-auto flex items-center gap-1.5 tabular-nums">
              Most of a visit
              <ArrowRight className="size-3.5 text-medium-green" aria-hidden="true" />
              <strong className="font-semibold text-deep-green">
                {(wait.average_seconds ?? 0) > (serviceAverage ?? 0) ? "is waiting" : "is the counter"}
              </strong>
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-soft-mint px-3.5 py-3 text-xs leading-relaxed text-deep-green">
          The two halves are not measured yet, so the whole visit cannot be drawn. Waiting needs a
          ticket that has been called; the counter needs one that has been served and closed.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Buckets
          title="How long they waited"
          buckets={wait.histogram}
          samples={wait.samples}
          empty="Nobody has been called in this period yet, so there is no wait to measure."
        />
        <Buckets
          title="How long the counter took"
          buckets={data.histogram}
          samples={data.service_samples}
          empty="No ticket has been served and closed here, so there is nothing to measure."
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-medium-green">
        Each measured ticket falls in exactly one band, and each percentage is of the tickets in
        that column. A band at zero is a band nobody landed in, not a figure that is missing.
      </p>

      {service === null ? (
        <p className="mt-5 rounded-xl bg-soft-mint px-3.5 py-3 text-xs leading-relaxed text-deep-green">
          A target belongs to one waiting list. Choose one above to see how often the desk met it.
        </p>
      ) : data.target_seconds === null ? (
        <p className="mt-5 rounded-xl bg-soft-mint px-3.5 py-3 text-xs leading-relaxed text-deep-green">
          No target is set for this waiting list. An administrator can add one in Desk settings.
        </p>
      ) : (
        <div className="mt-5">
          <p className="flex flex-wrap items-center gap-2 text-sm text-deep-green">
            <Target className="size-4 text-medium-green" aria-hidden="true" />
            Target <strong className="font-semibold">{formatDuration(data.target_seconds)}</strong>
            {data.within_target_percent !== null && (
              <span className="ml-auto text-xs text-medium-green">
                met by {data.within_target_percent}% of the{" "}
                {plural(data.service_samples, "served ticket")} measured
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
    </section>
  );
}

/** One of the three figures at the top of the "how long" panel. */
function Time({
  figure,
  label,
  samples,
  unit,
  strong = false,
}: {
  figure: number | null;
  label: string;
  samples: number;
  unit: string;
  /** The total is the figure the panel exists for, so it is drawn largest. */
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-medium-green uppercase">{label}</dt>
      <dd className="mt-1">
        <span
          className={`block tabular-nums font-semibold tracking-tight text-deep-green ${
            strong ? "text-3xl" : "text-2xl"
          }`}
        >
          {figure === null ? "Not available" : formatDuration(figure)}
        </span>
        <span className="mt-1 block text-[11px] leading-snug text-medium-green">
          {figure === null
            ? unit
              ? "withheld until it rests on enough tickets"
              : "the two halves together"
            : unit
              ? `over the ${plural(samples, `most recent ${unit}`)}`
              : "waiting plus the counter"}
        </span>
      </dd>
    </div>
  );
}

/** A distribution as a list of bars. Every band is listed, at zero too. */
function Buckets({
  title,
  buckets,
  samples,
  empty,
}: {
  title: string;
  buckets: { label: string; count: number }[];
  samples: number;
  empty: string;
}) {
  const busiest = buckets.reduce((best, bucket) => Math.max(best, bucket.count), 0);
  const counted = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-medium-green uppercase">{title}</p>
      {samples === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-medium-green">{empty}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2.5">
            {buckets.map((bucket) => (
              <li key={bucket.label} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-medium-green">{bucket.label}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft-mint">
                  <span
                    className="block h-full rounded-full bg-medium-green"
                    style={{ width: `${busiest ? (bucket.count / busiest) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-8 text-right font-semibold tabular-nums text-deep-green">
                  {bucket.count}
                </span>
                <span className="w-9 text-right text-[11px] tabular-nums text-medium-green">
                  {counted ? Math.round((bucket.count * 100) / counted) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Each waiting list against the others.
 *
 * The name is a button: choosing a line here does the same thing as choosing it
 * in the controls above, so a comparison can be turned into a close look without
 * scrolling back. Waiting and service sit beside each other because a queue that
 * is slow to be called and slow to be served are two different problems, and the
 * target column is the promise the queue made about itself.
 */
function ServiceTable({
  data,
  service,
  onService,
  scopeName,
}: {
  data: Stats;
  service: string | null;
  onService: (next: string | null) => void;
  scopeName?: string;
}) {
  return (
    <section aria-labelledby="per-service-heading" className="rounded-2xl bg-white p-5">
      <h2 id="per-service-heading" className="text-sm font-semibold text-deep-green">
        Each waiting list
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-medium-green">
        What every service the office offers has done in this period, counted from its own tickets.
        Choose a name to count only that line{scopeName ? ` — ${scopeName} is chosen` : ""}.
      </p>

      {/* A phone gets one row per waiting list with its figures in a grid. A
          seven-column table on a 390 px screen shows two columns and hides the
          rest behind a sideways scroll that nobody notices is there. */}
      <ul className="mt-3 divide-y divide-line/60 border-t border-line/60 sm:hidden">
        {data.per_service.map((row) => {
          const active = service === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onService(active ? null : row.id)}
                aria-pressed={active}
                className={`-mx-2 w-[calc(100%+1rem)] rounded-lg px-2 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green ${
                  active ? "bg-soft-mint" : "hover:bg-soft-mint/60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Letter letter={row.letter} active={active} />
                  <span className="font-semibold text-deep-green">{row.name}</span>
                  {!row.is_active && <OffBadge />}
                </span>
                <span className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <ServiceFigure label="Issued" value={row.issued} />
                  <ServiceFigure label="Served" value={row.served} />
                  <ServiceFigure label="Waiting" value={row.waiting} />
                  <ServiceFigure
                    label="Waited"
                    value={
                      row.average_wait_seconds === null
                        ? "Not available"
                        : formatDuration(row.average_wait_seconds)
                    }
                  />
                  <ServiceFigure
                    label="Served in"
                    value={
                      row.average_service_seconds === null
                        ? "Not available"
                        : formatDuration(row.average_service_seconds)
                    }
                  />
                  <ServiceFigure
                    label="Target met"
                    value={
                      row.target_seconds === null
                        ? "No target"
                        : row.within_target_percent === null
                          ? "Not measured"
                          : `${row.within_target_percent}%`
                    }
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <caption className="sr-only">
            Tickets issued, served and waiting, the average wait and service time, and how often
            the target was met, for each waiting list
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
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Waited
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">
                Served in
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Target met
              </th>
            </tr>
          </thead>
          <tbody>
            {data.per_service.map((row) => {
              const active = service === row.id;
              return (
                <tr
                  key={row.id}
                  className={`border-b border-line/60 last:border-0 ${
                    active ? "bg-soft-mint/70" : ""
                  }`}
                >
                  <th scope="row" className="py-2.5 pr-4 font-normal">
                    <button
                      type="button"
                      onClick={() => onService(active ? null : row.id)}
                      aria-pressed={active}
                      className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left transition-colors hover:text-medium-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
                    >
                      <Letter letter={row.letter} active={active} />
                      <span className="font-semibold text-deep-green">{row.name}</span>
                      {!row.is_active && <OffBadge />}
                    </button>
                  </th>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-deep-green">
                    {row.issued}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="font-semibold tabular-nums text-deep-green">{row.served}</span>
                      <span
                        className="h-1.5 w-14 overflow-hidden rounded-full bg-line/50"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-medium-green"
                          style={{ width: `${row.decided ? (row.served * 100) / row.decided : 0}%` }}
                        />
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-medium-green">
                    {row.waiting}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-deep-green">
                    {row.average_wait_seconds === null
                      ? "—"
                      : formatDuration(row.average_wait_seconds)}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-deep-green">
                    {row.average_service_seconds === null
                      ? "—"
                      : formatDuration(row.average_service_seconds)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {row.target_seconds === null ? (
                      <span className="text-medium-green">No target</span>
                    ) : row.within_target_percent === null ? (
                      <span className="text-medium-green">Not measured</span>
                    ) : (
                      <span className="font-semibold text-deep-green">
                        {row.within_target_percent}%
                      </span>
                    )}
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

/**
 * Each counter, because a counter is where a waiting list actually happens.
 *
 * Two desks on one service can keep up and fall behind at the same time, and "the
 * line is slow" is not something an administrator can act on. Choosing a waiting
 * list above narrows this to its own counters.
 */
function CounterTable({ data, service }: { data: Stats; service: string | null }) {
  if (data.per_desk.length === 0) return null;

  return (
    <section aria-labelledby="per-desk-heading" className="rounded-2xl bg-white p-5">
      <h2
        id="per-desk-heading"
        className="flex items-center gap-2 text-sm font-semibold text-deep-green"
      >
        <MonitorSmartphone className="size-4 text-medium-green" aria-hidden="true" />
        Each counter
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-medium-green">
        {service
          ? "The counters that serve this waiting list, and what each of them did in this period."
          : "Every counter in the office, and what each of them did in this period."}{" "}
        A ticket keeps the counter that closed it, so the figures are the counter&rsquo;s own.
      </p>

      <ul className="mt-3 divide-y divide-line/60 border-t border-line/60">
        {data.per_desk.map((desk) => (
          <li key={desk.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-md bg-soft-mint text-[11px] font-bold text-deep-green"
                aria-hidden="true"
              >
                {desk.letter}
              </span>
              <span className="font-semibold text-deep-green">{desk.name}</span>
              <span className="text-xs text-medium-green">{desk.service_name}</span>
              {desk.waiting > 0 && (
                <span className="ml-auto rounded-full bg-light-lime px-2.5 py-0.5 text-[11px] font-semibold text-deep-green">
                  {plural(desk.waiting, "waiting")}
                </span>
              )}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              <ServiceFigure label="Issued" value={desk.issued} />
              <ServiceFigure label="Served" value={desk.served} />
              <ServiceFigure
                label="Waited"
                value={
                  desk.average_wait_seconds === null
                    ? "Not available"
                    : formatDuration(desk.average_wait_seconds)
                }
              />
              <ServiceFigure
                label="Served in"
                value={
                  desk.average_service_seconds === null
                    ? "Not available"
                    : formatDuration(desk.average_service_seconds)
                }
              />
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The letter a service's numbers are prefixed with, as a small tile. */
function Letter({ letter, active }: { letter: string; active: boolean }) {
  return (
    <span
      className={`grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold ${
        active ? "bg-deep-green text-light-lime" : "bg-soft-mint text-deep-green"
      }`}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

function OffBadge() {
  return (
    <span className="rounded-md bg-soft-mint px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-medium-green uppercase">
      off
    </span>
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
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-96 w-full rounded-2xl" />
    </div>
  );
}
