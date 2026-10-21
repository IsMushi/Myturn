"use client";

import { Download, TrendingUp } from "lucide-react";
import { useCallback, useState } from "react";

import { api } from "@/lib/api";
import { formatDuration, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { Stats } from "@/lib/types";

/**
 * The numbers the desk left behind.
 *
 * Every figure is counted from rows the prototype already writes, and the
 * service-time measurement is the same one the visitor page uses, so the two
 * pages cannot disagree. Where there is not enough history the page says so
 * rather than showing a number that would not hold up.
 *
 * Times are the server's, which are kept in UTC: the day boundary and the
 * hourly bars are Kigali's, because the office is in Kigali, and the page
 * says so.
 */
export function AdminStatistics() {
  const [filter, setFilter] = useState<string | null>(null);
  const load = useCallback(() => api.stats(filter ?? undefined), [filter]);
  const { data, error, refresh } = usePolling<Stats>(load, 15000);
  // Tickets leaving the queue change the counts; refresh them as they do.
  useLiveRefresh(refresh, 15000);

  if (error && !data) {
    return <p className="text-sm text-rose-700">The statistics could not be read: {error.message}</p>;
  }
  if (!data) {
    return <p className="text-sm text-medium-green">Counting…</p>;
  }

  const { totals } = data;
  const busiest = data.hours.reduce((best, hour) => (hour.issued > best ? hour.issued : best), 0);
  const busiestDay = data.per_day.reduce((best, day) => (day.issued > best ? day.issued : best), 0);
  const mostServed = data.histogram.reduce((best, bucket) => (bucket.count > best ? bucket.count : best), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Statistics</h1>
        <span className="text-sm text-medium-green">counted {relative(data.server_time)}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-line bg-white px-3 py-2 text-sm font-semibold text-deep-green hover:bg-soft-mint"
          >
            Refresh
          </button>
          <a
            href={api.ticketsCsvUrl}
            download
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-sm font-semibold text-deep-green hover:bg-soft-mint"
          >
            <Download className="size-4" aria-hidden="true" />
            Download the tickets (CSV)
          </a>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-4">
        <h2 className="text-sm font-semibold text-deep-green">Which queue</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter(null)}
            className={[
              "rounded-full border px-3 py-1.5 text-sm font-semibold",
              filter === null
                ? "border-deep-green bg-soft-mint text-deep-green"
                : "border-line bg-white text-medium-green",
            ].join(" ")}
          >
            The whole office
          </button>
          {data.per_service.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => setFilter(service.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-sm font-semibold",
                filter === service.id
                  ? "border-deep-green bg-soft-mint text-deep-green"
                  : "border-line bg-white text-medium-green",
              ].join(" ")}
            >
              {service.letter} · {service.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-medium-green">
          {filter === null
            ? "The figures below cover every service the office offers."
            : `The figures below cover ${data.service?.name ?? filter} only.`}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Tickets issued" value={String(totals.issued)} />
        <Tile label="Served" value={String(totals.served)} />
        <Tile
          label="No-shows"
          value={String(totals.no_shows)}
          note={
            totals.issued > 0
              ? `${totals.no_show_percent}% of the tickets issued`
              : "nothing issued yet"
          }
        />
        <Tile label="Waiting now" value={String(totals.waiting)} />
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">How long the desk takes</h2>
        <p className="mt-1 text-sm text-medium-green">
          Measured from the moment a number is called to the moment it is closed, over the
          tickets that were served.
        </p>
        {data.target_seconds === null ? (
          <p className="mt-2 text-sm text-medium-green">
            No target time is set. An administrator can add one in Desk settings, and this
            page will report how often it is met.
          </p>
        ) : (
          <p className="mt-2 text-sm text-deep-green">
            Target <span className="font-semibold">{formatDuration(data.target_seconds)}</span>
            {data.within_target_percent === null
              ? "."
              : ` — met by ${data.within_target_percent}% of the served tickets measured here.`}
          </p>
        )}

        {data.service_samples === 0 ? (
          <p className="mt-4 rounded-xl bg-soft-mint px-4 py-3 text-sm text-deep-green">
            Not available yet: no ticket has been served and closed, so there is nothing to
            measure.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Tile
                label="Average"
                value={
                  data.average_service_seconds === null
                    ? "Not available"
                    : formatDuration(data.average_service_seconds)
                }
                note={
                  data.average_service_seconds === null
                    ? "the server withholds it below its sample threshold"
                    : `over ${data.service_samples} served tickets`
                }
              />
              <Tile
                label="Middle"
                value={
                  data.median_service_seconds === null
                    ? "—"
                    : formatDuration(data.median_service_seconds)
                }
                note="half the visitors were quicker than this"
              />
              <Tile label="Tickets served" value={String(data.service_samples)} />
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold tracking-wide text-medium-green uppercase">
                Distribution
              </p>
              <ul className="mt-3 space-y-2">
                {data.histogram.map((bucket) => (
                  <li key={bucket.label} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 text-medium-green">{bucket.label}</span>
                    <span className="h-2.5 flex-1 rounded-full bg-soft-mint" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${mostServed ? (bucket.count / mostServed) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums text-deep-green">
                      {bucket.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Each queue</h2>
        <p className="mt-1 text-sm text-medium-green">
          What every service the office offers has done, counted from its own tickets.
        </p>
        <ul className="mt-3 space-y-2">
          {data.per_service.map((service) => (
            <li key={service.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-deep-green text-xs font-bold text-light-lime">
                {service.letter}
              </span>
              <span className="w-44 shrink-0 font-semibold text-deep-green">{service.name}</span>
              <span className="text-medium-green">{service.issued} issued</span>
              <span className="text-medium-green">{service.served} served</span>
              <span className="text-medium-green">{service.waiting} waiting</span>
              <span className="ml-auto tabular-nums text-deep-green">
                {service.average_service_seconds === null
                  ? "Not available"
                  : formatDuration(service.average_service_seconds)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
            <TrendingUp className="size-5" aria-hidden="true" />
            Busiest hours
          </h2>
          <p className="mt-1 text-sm text-medium-green">
            Tickets taken in each hour of the day, Kigali time.
          </p>
          {data.hours.length === 0 ? (
            <p className="mt-4 text-sm text-medium-green">No tickets yet.</p>
          ) : (
            <div className="mt-4">
              <ul className="flex h-24 items-end gap-1" aria-label="Tickets taken per hour">
                {Array.from({ length: 24 }, (_, hour) => {
                  const found = data.hours.find((row) => row.hour === hour);
                  const issued = found?.issued ?? 0;
                  const height = issued && busiest ? Math.max(6, (issued / busiest) * 100) : 0;
                  return (
                    <li
                      key={hour}
                      aria-label={`${hour}:00, ${issued} ticket${issued === 1 ? "" : "s"}`}
                      title={`${hour}:00 — ${issued} ticket${issued === 1 ? "" : "s"}`}
                      className="flex h-full flex-1 items-end"
                    >
                      <span
                        className={`w-full rounded-t ${issued ? "bg-medium-green" : "bg-line"}`}
                        style={height ? { height: `${height}%` } : { height: "3px" }}
                      />
                    </li>
                  );
                })}
              </ul>
              <div
                className="mt-1 flex gap-1 text-[10px] tabular-nums text-medium-green"
                aria-hidden="true"
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} className="flex-1 text-center">
                    {hour % 6 === 0 ? hour : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-medium-green">
            A ticket counts in the hour it was taken, whether or not the visitor was still
            there later.
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5">
          <h2 className="text-lg font-semibold text-deep-green">Tickets per day</h2>
          <p className="mt-1 text-sm text-medium-green">
            The most recent days that have tickets, at most fourteen.
          </p>
          {data.per_day.length === 0 ? (
            <p className="mt-4 text-sm text-medium-green">No tickets yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.per_day.map((day) => (
                <li key={day.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-medium-green">{day.day}</span>
                  <span className="h-2.5 flex-1 rounded-full bg-soft-mint" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${busiestDay ? (day.issued / busiestDay) * 100 : 0}%` }}
                    />
                  </span>
                  <span className="w-36 shrink-0 text-right tabular-nums text-deep-green">
                    {day.issued} issued, {day.served} served
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="text-xs text-medium-green">
        Every figure on this page comes from the tickets and events the system already
        recorded. Nothing here is projected or estimated.
      </p>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <p className="text-xs tracking-wide text-medium-green uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-deep-green">{value}</p>
      {note && <p className="text-xs text-medium-green">{note}</p>}
    </div>
  );
}
