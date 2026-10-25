"use client";

import {
  ArrowRight, BarChart3, Cpu, LayoutDashboard, MonitorPlay, Settings2,
  ScrollText, Ticket, Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, type ReactNode } from "react";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { api } from "@/lib/api";
import { activityLabel } from "@/lib/activity";
import { formatDuration, plural, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { LiveStatus } from "@/lib/useLive";
import type {
  AccountsListing, ActivityEntry, AdminDesk, AdminDevice,
  ServiceProfile, Stats,
} from "@/lib/types";

/**
 * The administrator's Dashboard: the whole office on one page.
 *
 * The other administration pages each answer one question — who works here
 * (Team), what happened (Activity), how the office is doing (Statistics), how it
 * is set up (Desk settings). This page is the question before those: what needs
 * my attention right now, and where do I go to act on it. Nothing is folded
 * away behind a summary: a panel that has to be opened is a panel nobody opens.
 *
 * Every number is read from an endpoint the dedicated page also reads, so the
 * dashboard can never quietly disagree with the page it links to. Live figures
 * say when they were last read, and fall back to polling when the stream is
 * away rather than pretending to be current.
 */
export function AdminDashboard() {
  const offices = usePolling(useCallback(() => api.serviceList(), []), 15000);
  const desks = usePolling(useCallback(() => api.deskList(), []), 15000);
  const board = usePolling(useCallback(() => api.deviceList(), []), 15000);
  const team = usePolling(useCallback(() => api.accounts(), []), 30000);
  const activity = usePolling(useCallback(() => api.activity(6), []), 15000);
  const stats = usePolling(useCallback(() => api.stats(), []), 30000);

  // The queue stream says something changed; the polls above stay underneath as
  // the fallback for a proxy that buffers the stream.
  const live = useLiveRefresh(() => {
    void offices.refresh();
    void desks.refresh();
    void board.refresh();
    void team.refresh();
    void activity.refresh();
    void stats.refresh();
  }, 10000);

  const services: ServiceProfile[] = offices.data?.services ?? [];
  const servicePoints: AdminDesk[] = desks.data?.desks ?? [];
  const boards: AdminDevice[] = board.data?.devices ?? [];
  const people: AccountsListing | null = team.data;
  const feed: ActivityEntry[] = activity.data?.entries ?? [];
  const totals: Stats | null = stats.data;

  const openDesks = servicePoints.filter((desk) => desk.service_state === "active").length;
  const waiting = totals?.totals.waiting ?? services.reduce((sum, s) => sum + s.waiting, 0);
  const updated = stats.data?.server_time ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight text-deep-green">
            Dashboard
            <LiveBadge status={live} updated={updated} />
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-medium-green">
            The waiting lines, the service points and the team in one place, read from the same
            pages that manage them.
          </p>
        </div>
        <Link
          href="/admin/team"
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-deep-green hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
        >
          <Users className="size-4" aria-hidden="true" />
          Manage the team
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="The office now">
        <Stat
          label="Waiting now"
          value={offices.data ? String(waiting) : "—"}
          note={offices.data ? `${plural(services.length, "service")} on offer` : "reading the queues…"}
        />
        <Stat
          label="Service points open"
          value={desks.data ? `${openDesks} of ${servicePoints.length}` : "—"}
          note={
            !desks.data
              ? "reading the counters…"
              : servicePoints.length === 0
                ? "none configured yet"
                : openDesks === servicePoints.length
                  ? "every point is open"
                  : `${plural(servicePoints.length - openDesks, "point")} paused or closed`
          }
        />
        <Stat
          label="Served"
          value={totals ? String(totals.totals.served) : "—"}
          note={
            totals
              ? `${totals.totals.issued} issued · ${totals.totals.no_show_percent}% of decided missed`
              : "counting…"
          }
        />
        <Stat
          label="Average service"
          value={
            totals?.average_service_seconds === null || totals === null
              ? "Not available"
              : formatDuration(totals.average_service_seconds)
          }
          note={
            totals && totals.service_samples > 0
              ? `measured over ${plural(totals.service_samples, "served ticket")}`
              : "no served ticket has been measured yet"
          }
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section
          className="rounded-2xl bg-white p-5 lg:col-span-2"
          aria-labelledby="dashboard-services"
        >
          <PanelHead
            id="dashboard-services"
            title="Waiting lines"
            note="Each service keeps its own queue and its own numbers."
            href="/admin/statistics"
            link="Statistics"
          />
          {services.length === 0 ? (
            <Empty>
              No service is on offer yet. <Link className="underline" href="/admin/settings">Add one in Desk settings</Link>.
            </Empty>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {services.map((service) => (
                <li key={service.service_id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft-mint text-base font-bold text-deep-green"
                    aria-hidden="true"
                  >
                    {service.letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-deep-green">
                      {service.name}
                      <DeskStateBadge state={service.service_state} />
                      {!service.is_active && (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-300">
                          switched off
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-medium-green">
                      {service.waiting} waiting · {plural(service.desk_count, "desk")}
                      {service.target_seconds === null
                        ? " · no target set"
                        : ` · target ${formatDuration(service.target_seconds)}`}
                    </p>
                  </div>
                  <Link
                    href={`/admin/statistics?service=${encodeURIComponent(service.id)}`}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-deep-green hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
                  >
                    Figures
                    <ArrowRight className="size-4" aria-hidden="true" />
                    <span className="sr-only"> for {service.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5" aria-labelledby="dashboard-team">
          <PanelHead
            id="dashboard-team"
            title="Team"
            note="Who can sign in, and who has been invited."
            href="/admin/team"
            link="Manage"
          />
          {people === null ? (
            <p className="mt-4 text-sm text-medium-green">Reading the team…</p>
          ) : (
            <>
              <dl className="mt-4 space-y-2.5 text-sm">
                <Row label="Accounts" value={String(people.users.length)} />
                <Row
                  label="Administrators"
                  value={String(people.users.filter((user) => user.role === "admin").length)}
                />
                <Row
                  label="Switched off"
                  value={String(people.users.filter((user) => !user.is_active).length)}
                />
                <Row label="Invitations waiting" value={String(people.invitations.length)} />
              </dl>
              {people.invitations.length > 0 && (
                <p className="mt-3 rounded-xl bg-soft-mint px-3 py-2 text-xs text-deep-green">
                  {people.invitations[0].email}
                  {people.invitations.length > 1
                    ? ` and ${people.invitations.length - 1} more are waiting to accept`
                    : " is waiting to accept"}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section
          className="rounded-2xl bg-white p-5 lg:col-span-2"
          aria-labelledby="dashboard-desks"
        >
          <PanelHead
            id="dashboard-desks"
            title="Service points"
            note="Each counter serves one service. The board watches one of them."
            href="/admin/settings"
            link="Desk settings"
          />
          {servicePoints.length === 0 ? (
            <Empty>
              No counter is configured yet. <Link className="underline" href="/admin/settings">Add one in Desk settings</Link>.
            </Empty>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {servicePoints.map((desk) => (
                <li key={desk.desk_id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-deep-green">
                      {desk.name}
                      <DeskStateBadge state={desk.service_state} />
                      {!desk.is_active && (
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-300">
                          retired
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-medium-green">
                      {desk.service_letter} · {desk.service_name} · {desk.waiting} waiting
                      {desk.pause_reason ? ` · ${desk.pause_reason}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-medium-green">
                    {desk.device_label ? (
                      <>
                        <Cpu className="mr-1 inline size-3.5" aria-hidden="true" />
                        {desk.device_label} · {desk.device_online ? "reporting" : "silent"}
                      </>
                    ) : (
                      "no board"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5" aria-labelledby="dashboard-board">
          <PanelHead
            id="dashboard-board"
            title="Sensor boards"
            note="Each board watches one counter. Boards are registered, and moved, on their own page."
            href="/admin/board"
            link="The boards"
          />
          {boards.length === 0 ? (
            <Empty>
              No board is registered. <Link className="underline" href="/admin/board">Register one</Link>{" "}
              to start measuring a counter.
            </Empty>
          ) : (
            <ul className="mt-4 space-y-3">
              {boards.map((device) => (
                <li key={device.device_id} className="rounded-xl bg-soft-mint/60 px-3.5 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-deep-green">
                    {device.label}
                    <span
                      className={
                        device.online
                          ? "rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-deep-green"
                          : "rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-300"
                      }
                    >
                      {device.online ? "reporting" : "silent"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-medium-green">
                    {device.desk_name ? `Watching ${device.desk_name}` : "Not watching a counter"}
                    {" · "}
                    {device.last_seen ? `last report ${relative(device.last_seen)}` : "no report yet"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-medium-green">
            A counter without a board still serves visitors; the hold rule simply keeps its full length there.
          </p>
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5" aria-labelledby="dashboard-activity">
        <PanelHead
          id="dashboard-activity"
          title="Recent activity"
          note="The last few things the waiting line, the desk and the accounts recorded."
          href="/admin/activity"
          link="All activity"
        />
        {feed.length === 0 ? (
          <Empty>Nothing has been recorded yet.</Empty>
        ) : (
          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {feed.map((entry, index) => (
              <li
                key={`${entry.at}-${entry.event}-${index}`}
                className="flex items-start gap-2.5 border-b border-line/60 pb-2 text-sm last:border-0 sm:last:border-b"
              >
                <Icon kind={entry.kind} />
                <p className="min-w-0 flex-1 text-medium-green">
                  <span className="font-medium text-deep-green">{activityLabel(entry.event)}</span>
                  {entry.label ? ` · ${entry.label}` : ""}
                  {entry.email ? ` · ${entry.email}` : ""}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                  <span className="block text-xs">{relative(entry.at)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Administration pages">
        <QuickLink href="/admin/team" label="Team" note="Accounts, roles and invitations" icon={Users} />
        <QuickLink href="/admin/activity" label="Activity" note="Everything that happened" icon={ScrollText} />
        <QuickLink href="/admin/statistics" label="Statistics" note="Counts, times and targets" icon={BarChart3} />
        <QuickLink href="/admin/board" label="Board" note="Register a board, give it a counter" icon={Cpu} />
        <QuickLink href="/admin/settings" label="Desk settings" note="Services and the desks that serve them" icon={Settings2} />
      </nav>
    </div>
  );
}

/**
 * The freshness of the page, in the page's own words.
 *
 * "Live" means the queue stream is connected; "polling" means the page is still
 * reading, just less often. Neither word claims a reading is newer than the one
 * printed beside it, which is the time the server answered.
 */
function LiveBadge({ status, updated }: { status: LiveStatus; updated: string | null }) {
  const label = status === "live" ? "Live" : status === "polling" ? "Polling" : "Connecting";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-medium-green">
      <span
        className={
          status === "live"
            ? "size-2 rounded-full bg-primary"
            : "size-2 rounded-full bg-medium-green/50"
        }
        aria-hidden="true"
      />
      {label}
      {updated && <span className="font-normal"> · {relative(updated)}</span>}
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5">
      <p className="text-xs tracking-wide text-medium-green uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-deep-green">{value}</p>
      <p className="mt-0.5 text-xs text-medium-green">{note}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-medium-green">{label}</dt>
      <dd className="font-semibold text-deep-green">{value}</dd>
    </div>
  );
}

function PanelHead({
  id, title, note, href, link,
}: {
  id: string;
  title: string;
  note: string;
  href: string;
  link: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={id} className="text-lg font-semibold text-deep-green">{title}</h2>
        <p className="mt-1 text-sm text-medium-green">{note}</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-deep-green hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
      >
        {link}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-sm text-medium-green">{children}</p>;
}

function Icon({ kind }: { kind: ActivityEntry["kind"] }) {
  const Glyph = kind === "ticket" ? Ticket : kind === "desk" ? MonitorPlay : Users;
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-soft-mint text-deep-green">
      <Glyph className="size-4" aria-hidden="true" />
    </span>
  );
}

function QuickLink({
  href, label, note, icon: Glyph,
}: {
  href: string;
  label: string;
  note: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft-mint text-deep-green group-hover:bg-white">
        <Glyph className="size-4.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-deep-green">{label}</span>
        <span className="block text-xs text-medium-green">{note}</span>
      </span>
      <ArrowRight className="size-4 text-medium-green" aria-hidden="true" />
    </Link>
  );
}
