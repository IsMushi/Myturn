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
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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
export function HourlyTicketsChart({ hours, scope }: { hours: HourPoint[]; scope?: string }) {
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
        {scope ?? "Every ticket, counted by the hour of the Kigali day it was taken."}
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
              <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -4 }}>
                <defs>
                  <linearGradient id="hourFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={INK} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={INK} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
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
                  cursor={{ stroke: GREEN, strokeWidth: 1, strokeDasharray: "3 3" }}
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
                <Area
                  type="monotone"
                  dataKey="issued"
                  name="Tickets"
                  stroke={INK}
                  strokeWidth={2}
                  fill="url(#hourFill)"
                  isAnimationActive={false}
                  dot={{ r: 2.5, fill: INK, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: INK, stroke: "#ffffff", strokeWidth: 2 }}
                />
              </AreaChart>
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
 * Tickets issued and served, day by day.
 *
 * Two bars side by side rather than one on top of the other: the gap between
 * them is the part of the day the desk did not get to, and stacking would hide
 * exactly the thing the chart exists to show. A day with no ticket is still
 * drawn, at zero, when a period is chosen — a gap in the line is information,
 * and dropping it would silently close the office for a quiet day.
 *
 * The chart is a bar chart of the days it is given. It used to be a two-slice
 * ring of the two totals, which answered "how many" a second time and never
 * answered "on which day".
 */
export function DailyTicketsChart({
  perDay,
  scope,
}: {
  perDay: DayPoint[];
  /** What the days cover, in the page's own words. */
  scope?: string;
}) {
  const issued = perDay.reduce((sum, day) => sum + day.issued, 0);
  const served = perDay.reduce((sum, day) => sum + day.served, 0);
  const busiest = perDay.reduce((best, day) => Math.max(best, day.issued), 0);
  // A month of days under one another does not fit under a chart; every other
  // tick keeps the labels readable without dropping the first or the last.
  const tickGap = Math.max(0, Math.ceil(perDay.length / 8) - 1);

  return (
    <section aria-labelledby="daily-tickets-heading" className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="daily-tickets-heading" className="text-sm font-semibold text-deep-green">
            Tickets per day
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-medium-green">
            {scope ?? "Issued and served, day by day."}
          </p>
        </div>
        {perDay.length > 0 && (
          <p className="text-xs tabular-nums text-medium-green">
            <span className="font-semibold text-deep-green">{served}</span> of{" "}
            <span className="font-semibold text-deep-green">{issued}</span> served
          </p>
        )}
      </div>

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
            aria-label={`Tickets issued and served across ${perDay.length} ${perDay.length === 1 ? "day" : "days"}. ${issued} issued, ${served} served, busiest day ${busiest}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={perDay}
                margin={{ top: 8, right: 4, bottom: 0, left: -4 }}
                barCategoryGap="22%"
                barGap={2}
              >
                <CartesianGrid stroke={LINE} strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  interval={tickGap}
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
                    const row = payload[0]?.payload as DayPoint | undefined;
                    return (
                      <ChartTip
                        label={label === undefined ? "" : shortDay(String(label))}
                        rows={[
                          { name: "Issued", value: row?.issued ?? 0, colour: LIME },
                          { name: "Served", value: row?.served ?? 0, colour: INK },
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
              <span className="size-2.5 rounded-sm" style={{ background: INK }} aria-hidden="true" />
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
