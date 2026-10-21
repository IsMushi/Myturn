"use client";

/**
 * The two charts on the staff dashboard, drawn with Recharts.
 *
 * They used to be hand-written SVG, which was fine for a static picture but
 * could not follow a pointer: a busy day's exact figure could not be read, and
 * there was no way to ask for a different period. Recharts brings the tooltip,
 * the crosshair and the responsive box; the colours still come from the same
 * @theme tokens as the rest of the page.
 *
 * Both charts are pictures of numbers the server counted. Nothing here
 * estimates or fills a gap, and where there is no history the figure says so
 * instead of drawing a shape that would not hold up. Each one also carries a
 * table of the same values, in a sheet that comes in from the right, because a
 * chart read only by eye leaves out anyone using a screen reader.
 */
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BarChart3, MoreVertical, PieChart as PieChartIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { DateRangePicker } from "@/components/staff/DateRangePicker";
import type { StaffQueue } from "@/lib/types";

/** The colours the charts draw with, from the page's own theme. */
const INK = "#134e4a";
const GREEN = "#2f9e79";
const SLATE = "#94a3b8";
const LINE = "#e2e8e6";
/** A cancelled ticket is the one outcome that is a red, so it reads as one. */
const RED = "#dc2626";
/** The ranges the filter offers, in the order they are shown. */
const RANGES = [
  { key: "1", label: "1 day", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "custom", label: "Custom", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

export interface ChartRange {
  /** A preset length in days, or null when a custom from/to is in use. */
  days: number | null;
  from?: string;
  to?: string;
}

/**
 * The outcome breakdown as a ring: what happened to the tickets this service
 * has issued. All four parts are shown even at zero, so the legend always adds
 * up to the total in the middle rather than quietly losing a category.
 */
export function OutcomesDonut({
  outcomes,
  loading = false,
}: {
  outcomes: StaffQueue["charts"]["outcomes"] | null;
  loading?: boolean;
}) {
  const slices = useMemo(
    () =>
      outcomes
        ? [
            { name: "Served", value: outcomes.served, colour: INK },
            { name: "No-shows", value: outcomes.no_shows, colour: GREEN },
            { name: "Cancelled", value: outcomes.cancelled, colour: RED },
            { name: "Waiting", value: outcomes.waiting, colour: SLATE },
          ]
        : [],
    [outcomes],
  );

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="rounded-xl bg-white p-5">
      <h2 className="text-sm font-semibold text-deep-green">Where the tickets went</h2>

      {loading ? (
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <Skeleton className="size-36 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <div className="mt-3 flex flex-col items-center justify-center py-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-soft-mint/70">
            <PieChartIcon className="size-6 text-medium-green" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium text-deep-green">No tickets yet</p>
          <p className="mt-1 max-w-[30ch] text-xs leading-relaxed text-medium-green">
            This chart fills in once visitors start taking numbers.
          </p>
        </div>
      ) : (
        <>
          <div className="relative mt-2">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={1}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.colour} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* The total sits in the hole. It is a real element, not an SVG
                label, so it stays centred as the box resizes. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-deep-green">{total}</span>
              <span className="text-xs font-semibold text-medium-green">tickets</span>
            </div>
          </div>

          {/* The legend carries the numbers too, so the ring is readable
              without matching colours by eye. */}
          <ul className="mt-2 space-y-1.5 text-sm">
            {slices.map((slice) => (
              <li key={slice.name} className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded-sm"
                  style={{ background: slice.colour }}
                  aria-hidden
                />
                <span className="text-medium-green">{slice.name}</span>
                <span className="ml-auto font-semibold tabular-nums text-deep-green">
                  {slice.value}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-medium-green">
                  {Math.round((slice.value / total) * 100)}%
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
 * Tickets issued and served per day, as a filled area with a line over it.
 *
 * The range filter belongs to this chart alone: the ring above is an all-time
 * breakdown of outcomes, and shortening it to a week would change what it
 * means rather than how much of it is shown.
 */
export function DailyAreaChart({
  perDay,
  range,
  onRangeChange,
  loading = false,
}: {
  perDay: StaffQueue["charts"]["per_day"] | null;
  range: ChartRange;
  onRangeChange: (next: ChartRange) => void;
  loading?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = perDay ?? [];
  const busiest = rows.reduce((best, day) => Math.max(best, day.issued), 0);
  const active: RangeKey =
    (RANGES.find((r) => r.days !== null && r.days === range.days && !range.from)
      ?.key as RangeKey) ?? "custom";

  const heading = range.from && range.to
    ? `Tickets for ${range.from} → ${range.to}`
    : range.days === 1
      ? "Tickets for 1 day"
      : `Tickets for ${range.days} days`;

  // Short labels: with 30 days on a narrower card the full date collides.
  const shortDay = (day: string) => {
    const [, month, date] = day.split("-");
    return `${date}/${month}`;
  };

  const hasHistory = rows.length > 0 && busiest > 0;

  // The range is the name of the sheet. When it changes the chart and the rows
  // are drawn again, so a new period is seen to arrive rather than guessed at.
  const rangeKey = range.from && range.to ? `${range.from}-${range.to}` : `days-${range.days}`;

  return (
    <section className="rounded-xl bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-deep-green">{heading}</h2>

        {/* The range filter. */}
        <div
          role="group"
          aria-label="Chart range"
          className="ml-auto flex flex-wrap items-center gap-1 rounded-lg border border-line p-0.5"
        >
          {RANGES.filter((option) => option.key !== "custom").map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={active === option.key}
              onClick={() => {
                setCustomOpen(false);
                onRangeChange({ days: option.days });
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-medium-green focus-visible:outline-none ${
                active === option.key
                  ? "bg-deep-green text-white"
                  : "text-medium-green hover:bg-soft-mint"
              }`}
            >
              {option.label}
            </button>
          ))}

          {/* Vertical three-dot menu: Custom range + show figures as list. */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="More options"
                className="rounded-full px-2 py-1 text-medium-green transition-colors hover:bg-soft-mint focus-visible:ring-2 focus-visible:ring-medium-green focus-visible:outline-none"
              >
                <MoreVertical className="size-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-deep-green transition-colors hover:bg-soft-mint"
                onClick={() => {
                  setCustomOpen(true);
                  setMenuOpen(false);
                }}
              >
                Custom range
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-3 py-2 text-sm text-deep-green transition-colors hover:bg-soft-mint"
                onClick={() => {
                  setSheetOpen(true);
                  setMenuOpen(false);
                }}
              >
                Show as list
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* A custom range, revealed by its own button rather than always on
          screen, so the common ranges stay one click away. */}
      {customOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-soft-mint px-3 py-2.5">
          <DateRangePicker
            from={range.from}
            to={range.to}
            onApply={(next) => {
              onRangeChange({
                days: null,
                from: next.from ?? "",
                to: next.to ?? "",
              });
            }}
          />
        </div>
      )}

      {range.from && range.to && (
        <div className="mt-2 flex justify-end text-xs tabular-nums text-medium-green">
          {range.from} → {range.to}
        </div>
      )}

      {loading ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : !hasHistory ? (
        <div className="mt-3 flex flex-col items-center justify-center py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-soft-mint/70">
            <BarChart3 className="size-6 text-medium-green" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium text-deep-green">No history in this period</p>
          <p className="mt-1 max-w-[34ch] text-xs leading-relaxed text-medium-green">
            Nothing was issued between these dates. Try a wider range, or call the next visitor to start the count.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 h-40" key={rangeKey}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="issuedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0.04} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke={LINE} strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 10, fill: GREEN }}
                  axisLine={{ stroke: LINE }}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: GREEN }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="min-w-[140px] rounded-lg border border-line bg-white px-3 py-2.5 shadow-lg">
                        <p className="text-xs font-semibold text-deep-green">{label}</p>
                        <ul className="mt-1.5 space-y-1">
                          {payload.map((entry) => (
                            <li key={entry.name} className="flex items-center gap-2 text-xs">
                              <span
                                className="size-2 shrink-0 rounded-sm"
                                style={{ background: entry.color }}
                                aria-hidden
                              />
                              <span className="text-medium-green">{entry.name}</span>
                              <span className="ml-auto font-semibold tabular-nums text-ink">
                                {Number(entry.value)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="issued"
                  name="Issued"
                  stroke={GREEN}
                  strokeWidth={2}
                  fill="url(#issuedFill)"
                  animationDuration={700}
                />
                <Line
                  type="monotone"
                  dataKey="served"
                  name="Served"
                  stroke={INK}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={700}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-medium-green">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: GREEN }} aria-hidden />
              Issued
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: INK }} aria-hidden />
              Served
            </span>
          </div>

          {/* The same numbers as a table, for anyone not reading the picture.
              They come in from the right, so the chart keeps the room it needs
              and the figures are still one click away. */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Daily figures</SheetTitle>
                <SheetDescription>
                  Tickets issued and served, for each day of the period.
                </SheetDescription>
              </SheetHeader>
              <ul className="staff-sheet mt-6">
                {rows.map((day, index) => {
                  const ratio = day.issued > 0 ? Math.min(1, day.served / day.issued) : 0;
                  return (
                    <li
                      key={day.day}
                      className="group relative py-3 pl-4 pr-2 transition-colors hover:bg-soft-mint/50"
                      style={{ animationDelay: `${Math.min(index, 24) * 18}ms` }}
                    >
                      {/* Ledger rule between rows. */}
                      {index > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-px bg-line"
                        />
                      )}
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="font-medium tabular-nums text-deep-green">
                          {day.day}
                        </span>
                        <span className="flex items-baseline gap-5 tabular-nums">
                          <span className="text-medium-green">
                            <span className="text-xs">issued </span>
                            <span className="font-semibold text-ink">{day.issued}</span>
                          </span>
                          <span className="text-medium-green">
                            <span className="text-xs">served </span>
                            <span className="font-semibold text-ink">{day.served}</span>
                          </span>
                        </span>
                      </div>
                      {/* The one memorable element: a thin bar showing how much of
                          the day's issued tickets were actually served. */}
                      <div
                        className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-soft-mint"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-deep-green transition-[width] duration-500 ease-out"
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </>
      )}
    </section>
  );
}
