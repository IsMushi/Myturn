"use client";

/**
 * The two charts on the office Statistics page.
 *
 * They are the same kind of picture as the desk's charts — Recharts, the
 * project's own palette, no animation — but they answer a different question:
 * the desk asks "how is my counter doing", the office asks "when is the office
 * busy, and is every queue keeping up".
 *
 * Nothing here estimates or fills a gap. Every bar is a count the server took
 * from a row it already had, and a period with no tickets says so instead of
 * drawing an empty shape. Each chart also carries the same figures as a table
 * for anyone reading with a screen reader, because a chart read only by eye
 * leaves those readers out.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BarChart3, CalendarDays } from "lucide-react";

/** The palette, taken from the @theme tokens rather than invented here. */
const INK = "#00594f";
const GREEN = "#29835d";
const LIME = "#b9f477";
const LINE = "#b8d8c7";
const MINT = "#eaf7ef";

export interface HourPoint {
  hour: number;
  issued: number;
}

export interface DayPoint {
  day: string;
  issued: number;
  served: number;
}

/** A two-digit hour. The chart reads 00 … 23, the way the clock does. */
function hourLabel(hour: number): string {
  return String(hour).padStart(2, "0");
}

/** "23/10" from the server's "2026-10-23". */
function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return month && date ? `${date}/${month}` : day;
}

/** The chart's own tooltip: a small card, not Recharts' default box. */
function ChartTip({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; value: number; colour: string }[];
}) {
  return (
    <div className="min-w-[9.5rem] rounded-lg border border-line bg-white px-3 py-2.5 shadow-lg">
      <p className="text-xs font-semibold text-deep-green">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ background: row.colour }}
              aria-hidden="true"
            />
            <span className="text-medium-green">{row.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The same numbers, for a screen reader. Visually it is not there. */
function FiguresTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) =>
              cellIndex === 0 ? (
                <th key={cellIndex} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={cellIndex}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyChart({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof BarChart3;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-3 flex flex-col items-center justify-center py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-soft-mint/70">
        <Icon className="size-6 text-medium-green" aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-medium text-deep-green">{title}</p>
      <p className="mt-1 max-w-[34ch] text-xs leading-relaxed text-medium-green">{body}</p>
    </div>
  );
}

/**
 * Tickets taken in each hour of the Kigali day, all days together.
 *
 * All 24 hours are drawn, including the ones the office is closed, so the shape
 * of a working day is not silently cropped. The busiest hour is the only bar in
 * the darkest green: it is the one fact the chart exists to show.
 */
export function HourlyTicketsChart({ hours }: { hours: HourPoint[] }) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    issued: hours.find((point) => point.hour === hour)?.issued ?? 0,
  }));

  const total = rows.reduce((sum, row) => sum + row.issued, 0);
  const peak = rows.reduce((best, row) => Math.max(best, row.issued), 0);
  const busiest = rows.find((row) => row.issued === peak && peak > 0) ?? null;

  return (
    <section aria-labelledby="busiest-hours-heading" className="rounded-2xl bg-white p-5">
      <h2 id="busiest-hours-heading" className="text-sm font-semibold text-deep-green">
        Busiest hours
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-medium-green">
        Every ticket, counted by the hour of the Kigali day it was taken.
      </p>

      {total === 0 ? (
        <EmptyChart
          icon={BarChart3}
          title="No tickets yet"
          body="The shape of the day appears once visitors start taking numbers."
        />
      ) : (
        <>
          <div
            className="mt-4 h-52"
            role="img"
            aria-label={
              busiest
                ? `Tickets taken per hour. The busiest hour is ${hourLabel(busiest.hour)}:00 with ${peak}.`
                : "Tickets taken per hour."
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={hourLabel}
                  interval={2}
                  tick={{ fontSize: 10, fill: GREEN }}
                  axisLine={{ stroke: LINE }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: GREEN }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  cursor={{ fill: MINT }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <ChartTip
                        label={`${hourLabel(Number(label))}:00`}
                        rows={[
                          {
                            name: "Tickets",
                            value: Number(payload[0]?.value ?? 0),
                            colour: INK,
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="issued" name="Tickets" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {rows.map((row) => (
                    <Cell key={row.hour} fill={busiest?.hour === row.hour ? INK : GREEN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-medium-green">
            {busiest ? (
              <>
                Busiest hour{" "}
                <strong className="font-semibold text-deep-green">
                  {hourLabel(busiest.hour)}:00
                </strong>{" "}
                — {peak} {peak === 1 ? "ticket" : "tickets"} taken.
              </>
            ) : null}{" "}
            A ticket counts in the hour it was taken, whether or not the visitor was still there
            later.
          </p>

          <FiguresTable
            caption="Tickets taken per hour of the day"
            head={["Hour", "Tickets"]}
            rows={rows.map((row) => [`${hourLabel(row.hour)}:00`, row.issued])}
          />
        </>
      )}
    </section>
  );
}

/**
 * Tickets issued and served for each of the most recent days that had any.
 *
 * Issued and served sit side by side rather than one on top of the other: the
 * gap between them is the part of the day the desk did not get to, and a
 * stacked bar would hide it.
 */
export function DailyTicketsChart({ perDay }: { perDay: DayPoint[] }) {
  const busiest = perDay.reduce((best, day) => Math.max(best, day.issued), 0);

  return (
    <section aria-labelledby="daily-tickets-heading" className="rounded-2xl bg-white p-5">
      <h2 id="daily-tickets-heading" className="text-sm font-semibold text-deep-green">
        Tickets per day
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-medium-green">
        The fourteen most recent days that had tickets, at most. Days without a ticket are not
        drawn.
      </p>

      {perDay.length === 0 ? (
        <EmptyChart
          icon={CalendarDays}
          title="No day to compare yet"
          body="A day appears here once the first ticket of that day has been taken."
        />
      ) : (
        <>
          <div
            className="mt-4 h-52"
            role="img"
            aria-label={`Tickets issued and served per day for ${perDay.length} ${perDay.length === 1 ? "day" : "days"}. The busiest day issued ${busiest}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perDay} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barGap={2}>
                <CartesianGrid stroke={LINE} strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 10, fill: GREEN }}
                  axisLine={{ stroke: LINE }}
                  tickLine={false}
                  minTickGap={10}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: GREEN }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  cursor={{ fill: MINT }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <ChartTip
                        label={String(label)}
                        rows={[
                          { name: "Issued", value: Number(payload[0]?.value ?? 0), colour: LIME },
                          {
                            name: "Served",
                            value: Number(payload[1]?.value ?? 0),
                            colour: INK,
                          },
                        ]}
                      />
                    );
                  }}
                />

                <Bar
                  dataKey="issued"
                  name="Issued"
                  fill={LIME}
                  stroke={GREEN}
                  strokeWidth={1}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="served"
                  name="Served"
                  fill={INK}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-medium-green">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: LIME, boxShadow: `inset 0 0 0 1px ${GREEN}` }}
                aria-hidden="true"
              />
              Issued
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: INK }}
                aria-hidden="true"
              />
              Served
            </span>
          </div>

          <FiguresTable
            caption="Tickets issued and served per day"
            head={["Day", "Issued", "Served"]}
            rows={perDay.map((day) => [day.day, day.issued, day.served])}
          />
        </>
      )}
    </section>
  );
}
