"use client";

import { BarChart3, Clock3, RefreshCw, TrendingUp, Users, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { usePolling } from "@/lib/usePolling";

interface QueueAnalytics {
  current_queue_length: number;
  average_wait_time_seconds: number | null;
  tickets_served_today: number;
  busiest_hour: number | null;
  estimated_wait_seconds: number | null;
  service_rate_per_hour: number;
}

interface DeskComparison {
  desk_id: number;
  desk_name: string;
  service_letter: string;
  service_name: string;
  state: "active" | "paused" | "closed";
  waiting: number;
  tickets_served_today: number;
  no_shows_today: number;
  average_service_time_seconds: number | null;
  service_samples: number;
  active_hours_today: number;
  last_served_seconds_ago: number | null;
}

interface TrendDay {
  date: string;
  total_tickets: number;
  total_served: number;
  average_wait_time_seconds: number | null;
}

interface TrendsData {
  period_days: number;
  trends: TrendDay[];
}

/**
 * The office's numbers, in the same colours as the rest of the console.
 *
 * The figures are read from the analytics endpoints the API already serves, and
 * every surface uses the MyTurn tokens (white panels on the mint workspace, deep
 * green for headings, medium green for the second line), so the page reads as
 * part of the console rather than a page of its own.
 */
export function AnalyticsDashboard() {
  const [desks, setDesks] = useState<DeskComparison[]>([]);

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/analytics/queue");
    if (!response.ok) {
      throw new ApiError(response.status, `Request failed (${response.status})`);
    }
    return (await response.json()).data as QueueAnalytics;
  }, []);
  const { data: queue, error: queueError, refresh: refreshQueue } = usePolling(loadQueue, 30000);

  const loadDesks = useCallback(async () => {
    const response = await fetch("/api/analytics/desks");
    if (!response.ok) {
      throw new ApiError(response.status, `Request failed (${response.status})`);
    }
    const rows = (await response.json()).data.desks as DeskComparison[];
    // The server returns them by service and name; the sheet reads best with
    // the busiest desk first. It is a sort of a figure already on the page,
    // not a score: two desks are not being called better or worse.
    setDesks([...rows].sort((a, b) => b.tickets_served_today - a.tickets_served_today));
    return rows;
  }, []);
  const { error: deskError, refresh: refreshDesks } = usePolling(loadDesks, 30000);

  const loadTrends = useCallback(async () => {
    const response = await fetch("/api/analytics/trends");
    if (!response.ok) {
      throw new ApiError(response.status, `Request failed (${response.status})`);
    }
    return (await response.json()).data as TrendsData;
  }, []);
  const { data: trends, error: trendsError, refresh: refreshTrends } = usePolling(loadTrends, 60000);

  const refreshAll = useCallback(() => {
    void refreshQueue();
    void refreshDesks();
    void refreshTrends();
  }, [refreshQueue, refreshDesks, refreshTrends]);
  // The queue stream says when something moved; read again then rather than
  // waiting for the next poll.
  useLiveRefresh(refreshAll, 15000);

  const hasError = Boolean(queueError || deskError || trendsError);

  useEffect(() => {
    document.title = "Visitor statistics | MyTurn";
    return () => {
      document.title = "MyTurn";
    };
  }, []);

  if (!queue && !hasError) return <Loading />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Visitor statistics</h1>
          <p className="mt-1 text-sm text-medium-green">
            Real-time metrics and the last seven days, for every service desk.
          </p>
        </div>
        <div className="ml-auto">
          <Button variant="quiet" onClick={() => void refreshAll()}>
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {hasError && <LoadError retry={refreshAll} />}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Waiting now"
          value={String(queue?.current_queue_length ?? "—")}
          note="Across all services"
          icon={<Users size={18} aria-hidden="true" />}
        />
        <Tile
          label="Average wait"
          value={
            queue?.average_wait_time_seconds != null
              ? formatDuration(queue.average_wait_time_seconds)
              : "—"
          }
          note="Today, measured from served tickets"
          icon={<Clock3 size={18} aria-hidden="true" />}
        />
        <Tile
          label="Served today"
          value={String(queue?.tickets_served_today ?? "—")}
          note="Every desk"
          icon={<TrendingUp size={18} aria-hidden="true" />}
          accent
        />
        <Tile
          label="Estimated wait"
          value={
            queue?.estimated_wait_seconds != null
              ? formatDuration(queue.estimated_wait_seconds)
              : "—"
          }
          note={queue?.busiest_hour != null ? `Busiest hour ${queue.busiest_hour}:00` : "For the next ticket"}
          icon={<BarChart3 size={18} aria-hidden="true" />}
        />
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Desk performance</h2>
        <p className="mt-1 text-sm text-medium-green">
          Every service point side by side, for today.
        </p>
        <div className="mt-4 overflow-x-auto">
          {desks.length > 0 ? (
            <DeskComparisonTable desks={desks} />
          ) : (
            <p className="text-sm text-medium-green">No desk data available.</p>
          )}
        </div>
        <p className="mt-3 text-xs text-medium-green">
          Sorted by tickets served today. Waiting is counted for the whole service, which its
          desks share, so the same figure can appear at two service points. Nothing here is scored.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">7-day trends</h2>
        <p className="mt-1 text-sm text-medium-green">Tickets issued and served, day by day.</p>
        <div className="mt-4 overflow-x-auto">
          {trends ? (
            <TrendsTable trends={trends} />
          ) : (
            <p className="text-sm text-medium-green">Counting…</p>
          )}
        </div>
      </section>

      <p className="text-xs text-medium-green">
        Every figure on this page comes from the tickets and events the system already recorded.
        Nothing here is projected or estimated.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-64 animate-pulse rounded bg-soft-mint" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-soft-mint" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

function LoadError({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3"
    >
      <WifiOff size={20} className="text-rose-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-deep-green">Unable to load the analytics</p>
        <p className="text-sm text-medium-green">Check your connection, then try again.</p>
      </div>
      <Button variant="quiet" onClick={() => void retry()}>
        Try again
      </Button>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
            accent ? "bg-primary text-ink" : "bg-soft-mint text-deep-green"
          }`}
        >
          {icon}
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-medium-green">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-deep-green">{value}</p>
      {note && <p className="mt-1 text-xs text-medium-green">{note}</p>}
    </div>
  );
}

function DeskComparisonTable({ desks }: { desks: DeskComparison[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line bg-soft-mint text-medium-green">
          <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">
            Desk
          </th>
          <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">
            State
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Served today
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            No-shows
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Waiting
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Recent average
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Hours with work
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Last served
          </th>
        </tr>
      </thead>
      <tbody>
        {desks.map((desk) => (
          <tr key={desk.desk_id} className="border-b border-line last:border-b-0 hover:bg-soft-mint/60">
            <th scope="row" className="px-4 py-2.5 text-left font-normal">
              <span className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-deep-green text-xs font-bold text-light-lime">
                  {desk.service_letter}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-deep-green">{desk.desk_name}</span>
                  <span className="block text-xs text-medium-green">{desk.service_name}</span>
                </span>
              </span>
            </th>
            <td className="px-4 py-2.5">
              <DeskStateBadge state={desk.state} />
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">
              {desk.tickets_served_today}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">
              {desk.no_shows_today}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">{desk.waiting}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">
              {desk.average_service_time_seconds != null
                ? formatDuration(desk.average_service_time_seconds)
                : "—"}
              {desk.service_samples > 0 && (
                <span className="block text-xs font-normal text-medium-green">
                  {desk.service_samples} {desk.service_samples === 1 ? "visit" : "visits"}
                </span>
              )}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">
              {desk.active_hours_today > 0 ? `${desk.active_hours_today} h` : "—"}
            </td>
            <td className="px-4 py-2.5 text-right tabular-nums text-medium-green">
              {desk.last_served_seconds_ago != null
                ? `${formatDuration(desk.last_served_seconds_ago)} ago`
                : "Never"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendsTable({ trends }: { trends: TrendsData }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const dayName = days[date.getUTCDay()];
    const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    return `${dayName}, ${month} ${date.getUTCDate()}`;
  }

  if (trends.trends.length === 0) {
    return (
      <p className="flex flex-col items-center gap-2 py-8 text-center text-sm text-medium-green">
        <BarChart3 size={28} className="opacity-40" aria-hidden="true" />
        No tickets in the past week.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line bg-soft-mint text-medium-green">
          <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">
            Date
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Issued
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Served
          </th>
          <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide">
            Average wait
          </th>
        </tr>
      </thead>
      <tbody>
        {trends.trends.map((day) => (
          <tr key={day.date} className="border-b border-line last:border-b-0 hover:bg-soft-mint/60">
            <td className="px-4 py-2.5 font-medium text-deep-green">{formatDate(day.date)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">{day.total_tickets}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-deep-green">{day.total_served}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-medium-green">
              {day.average_wait_time_seconds != null
                ? formatDuration(day.average_wait_time_seconds)
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
