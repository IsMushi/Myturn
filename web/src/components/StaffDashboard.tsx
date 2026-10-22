"use client";

import {
  ArrowRight, BarChart3, Check, Clock3, Keyboard, ListOrdered,
  Loader2, Megaphone, Pause, Play, RotateCw, Ticket, Undo2, WifiOff, X,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChartRange } from "@/components/DeskCharts";
import { DeskStateBadge } from "@/components/DeskStateBadge";
import { StaffDashboardSkeleton } from "@/components/StaffDashboardSkeleton";
import { DeviceStatus } from "@/components/staff/DeviceStatus";
import { QueueConnectionToast } from "@/components/staff/QueueConnectionToast";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectItem } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";
import { clockTime, formatDuration, fullTimestamp, plural } from "@/lib/format";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { usePolling, type PollError } from "@/lib/usePolling";
import { useSession } from "@/lib/useSession";
import type { DeskSummary, QueueTicket, ServiceState, StaffAction, StaffQueue } from "@/lib/types";

import "./staff-dashboard.css";

// The charts are secondary; do not load their bundle until staff open trends.
const DailyAreaChart = dynamic(() => import("@/components/DeskCharts").then((m) => m.DailyAreaChart));
const OutcomesDonut = dynamic(() => import("@/components/DeskCharts").then((m) => m.OutcomesDonut));
const DESK_KEY = "myturn.desk";
const STALE_AFTER_MS = 15000;
const SERVICE_BUTTONS: { state: ServiceState; label: string; icon: LucideIcon }[] = [
  { state: "active", label: "Open", icon: Play },
  { state: "paused", label: "Pause", icon: Pause },
  { state: "closed", label: "Close", icon: X },
];

interface Undoable {
  ticketId: number;
  label: string;
  what: string;
  until: number;
}

interface QueueSnapshot {
  queue: StaffQueue;
  receivedAt: number;
}

interface Notice {
  tone: "success" | "error";
  text: string;
}

function contactHref(contact: string) {
  return contact.includes("@") ? `mailto:${contact}` : `tel:${contact.replace(/[^0-9+]/g, "")}`;
}

function rememberedDesk(): number | null {
  try {
    const stored = Number(sessionStorage.getItem(DESK_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null; // Storage can be unavailable in a restricted browser.
  }
}

export function StaffDashboard() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "out") router.replace("/auth/login?next=/staff/dashboard");
  }, [session.status, router]);

  if (session.status === "loading") return <LoadingDesk />;
  if (session.status === "out") return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <Loader2 size={20} className="animate-spin text-medium-green" aria-hidden="true" />
      <p className="text-sm text-medium-green">Taking you to the sign-in page…</p>
    </div>
  );
  return <DeskPicker />;
}

function LoadingDesk() {
  return (
    <div className="staff-workspace">
      <h1 className="staff-page-title">Service desk</h1>
      <StaffDashboardSkeleton />
    </div>
  );
}

function DeskPicker() {
  const load = useCallback(() => api.desks(), []);
  const { data, error, refresh } = usePolling(load, 15000);
  useLiveRefresh(refresh, 10000);
  const [picked, setPicked] = useState<number | null>(rememberedDesk);
  const desks = data?.desks ?? [];
  const chosen = desks.find((desk) => desk.desk_id === picked) ?? desks[0];

  if (!chosen) {
    if (!data && !error) return <LoadingDesk />;
    return (
      <div className="staff-workspace">
        <h1 className="staff-page-title">Service desk</h1>
        {error ? <LoadError error={error} retry={refresh} /> : (
          <section className="staff-empty-desk">
            <ListOrdered size={28} aria-hidden="true" />
            <h2>No desks available</h2>
            <p>Ask an administrator to configure a service desk, then refresh this page.</p>
            <Button variant="quiet" onClick={() => void refresh()}>Refresh desks</Button>
          </section>
        )}
      </div>
    );
  }

  return <DeskBoard key={chosen.desk_id} deskId={chosen.desk_id} desks={desks} onPick={setPicked} />;
}

function LoadError({ error, retry }: { error: PollError; retry: () => Promise<void> }) {
  const denied = error.status === 401 || error.status === 403;
  return (
    <div className="staff-connection-notice" role="alert">
      <WifiOff size={20} aria-hidden="true" />
      <div>
        <strong>{denied ? "Sign-in or access needs attention" : "Unable to load the desk"}</strong>
        <p>{denied ? "Your session may have expired or your access has changed." : error.message}</p>
      </div>
      {denied ? <ButtonLink href="/auth/login?next=/staff/dashboard" variant="quiet">Sign in</ButtonLink>
        : <Button variant="quiet" onClick={() => void retry()}>Try again</Button>}
    </div>
  );
}

function DeskHeader({ deskId, desks, onPick, refresh, pending, disabled = false, stale = false }: {
  deskId: number;
  desks: DeskSummary[];
  onPick: (id: number) => void;
  refresh: () => Promise<void>;
  pending: string | null;
  disabled?: boolean;
  stale?: boolean;
}) {
  const desk = desks.find((item) => item.desk_id === deskId);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  return (
    <header className="staff-page-header">
      <div>
        <h1 className="staff-page-title">Service desk</h1>
        <p className="staff-page-description">
          <span className="staff-service-letter">{desk?.service_letter}</span>
          {desk?.service_name}
        </p>
      </div>

      <div className="staff-header-actions">
        {/* What is on screen is the last confirmed queue while this is shown. */}
        {stale && (
          <span className="staff-connection-state" data-testid="staff-connection-state" role="status">
            <WifiOff size={13} aria-hidden="true" />
            Offline
          </span>
        )}

        <Button variant="ghost" aria-label="Refresh queue" className="staff-refresh" onClick={() => void refresh()}>
          <RotateCw size={18} aria-hidden="true" className={pending ? "animate-spin" : "transition-transform group-hover:rotate-180"} />
        </Button>

        {/* The keys that work the desk, kept in a dialog of their own so the
            page is not carrying a list nobody looks at. */}
        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="md">
              <Keyboard size={17} aria-hidden="true" />
              Keyboard shortcuts
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Keyboard shortcuts</DialogTitle>
              <DialogDescription>
                The keys that work the desk, so the mouse is not needed at the counter.
              </DialogDescription>
            </DialogHeader>
            <dl className="staff-shortcuts">
              {[["N", "Call next"], ["S", "Mark served"], ["M", "No-show"], ["R", "Call again"], ["U", "Take that back"], ["C", "Cancel ticket (confirm)"]].map(([key, text]) => (
                <div key={key} className="staff-shortcuts-row">
                  <dt><kbd>{key}</kbd></dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-medium-green">
              Shortcuts are inactive while you use a form, menu or dialog.
            </p>
          </DialogContent>
        </Dialog>

        <div className="staff-desk-picker">
          <label htmlFor="desk-picker">Working at</label>
          <Select id="desk-picker" value={String(deskId)} disabled={disabled}
            onValueChange={(value) => onPick(Number(value))} className="staff-desk-select">
            {desks.map((item) => (
              <SelectItem key={item.desk_id} value={String(item.desk_id)}>
                {item.name} — {item.service_name}{item.is_active ? "" : " (retired)"}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>
    </header>
  );
}

function DeskBoard({ deskId, desks, onPick }: {
  deskId: number;
  desks: DeskSummary[];
  onPick: (id: number) => void;
}) {
  const [range, setRange] = useState<ChartRange>({ days: 7 });
  const load = useCallback(async (): Promise<QueueSnapshot> => {
    const queue = await api.queue(deskId, range);
    return { queue, receivedAt: Date.now() };
  }, [deskId, range]);
  const { data: snapshot, error, refresh } = usePolling(load, 2000);
  useLiveRefresh(refresh, 5000);
  const data = snapshot?.queue;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [last, setLast] = useState<Undoable | null>(null);
  const [walkIn, setWalkIn] = useState<{ label: string; token: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [cancelTicket, setCancelTicket] = useState<QueueTicket | null>(null);
  const [accessError, setAccessError] = useState<PollError | null>(null);
  const mutationLock = useRef(false);
  const keepTicketRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const onFocus = () => { setNow(Date.now()); void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  useEffect(() => {
    document.title = data?.waiting ? `(${data.waiting} waiting) Service desk | MyTurn` : "Service desk | MyTurn";
    return () => { document.title = "MyTurn"; };
  }, [data?.waiting]);

  const ageMs = snapshot ? Math.max(0, now - snapshot.receivedAt) : 0;
  const stale = Boolean(error) || ageMs > STALE_AFTER_MS;
  const blocked = stale || Boolean(accessError) || !data?.desk.is_active;
  const disabled = pending !== null || blocked;
  const called = data?.called ?? null;
  const undoLeft = last ? Math.max(0, Math.ceil((last.until - now) / 1000)) : 0;
  // Timers are based on the server clock, advanced only by elapsed local time.
  // Never interpret the workstation's clock difference as extra waiting time.
  const serverNow = data ? Date.parse(data.server_time) + ageMs : now;
  const elapsed = data?.seconds_called == null ? null : data.seconds_called + Math.floor(ageMs / 1000);
  const remaining = data?.hold_remaining == null ? null : Math.max(0, data.hold_remaining - Math.floor(ageMs / 1000));

  function pickDesk(id: number) {
    if (mutationLock.current) return;
    try { sessionStorage.setItem(DESK_KEY, String(id)); } catch { /* Selection still works without storage. */ }
    onPick(id);
  }

  async function run(action: () => Promise<unknown>, label: string, options: {
    undoable?: Omit<Undoable, "until">;
    success?: string;
    clearUndo?: boolean;
  } = {}) {
    if (mutationLock.current || blocked) return false;
    mutationLock.current = true;
    const startedAt = Date.now();
    setPending(label);
    setNotice(null);
    try {
      await action();
      if (options.undoable) {
        // Start conservatively at request time, not after a slow response.
        setLast({ ...options.undoable, until: startedAt + (data?.undo_seconds ?? 10) * 1000 });
      } else if (options.clearUndo) setLast(null);
      setNotice({ tone: "success", text: options.success ?? "Desk updated." });
      await refresh();
      return true;
    } catch (failure) {
      const message = failure instanceof ApiError ? failure.message
        : "The action could not be confirmed. Check the refreshed queue before trying again.";
      setNotice({ tone: "error", text: message });
      if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) {
        setAccessError({ status: failure.status, message });
      }
      // A second desk may have changed the queue. Refresh, but never repeat a write.
      await refresh();
      return false;
    } finally {
      mutationLock.current = false;
      setPending(null);
    }
  }

  function callNext() {
    if (!data || data.service_state !== "active" || called || data.waiting === 0) return;
    void run(() => api.callNext(deskId), "Calling the next visitor…", { clearUndo: true, success: "Next visitor called." });
  }

  function decide(action: StaffAction, ticket: QueueTicket | null = called) {
    if (!ticket || called?.ticket_id !== ticket.ticket_id) return Promise.resolve(false);
    const what = action === "complete" ? "served" : action === "skip" ? "marked as a no-show" : "cancelled";
    return run(() => api.ticketAction(ticket.ticket_id, action), "Saving the ticket…", {
      undoable: { ticketId: ticket.ticket_id, label: ticket.label, what },
      success: `${ticket.label} ${what}.`,
    });
  }

  function takeBack() {
    if (!last || undoLeft === 0 || called) return;
    void run(() => api.undo(last.ticketId), "Restoring the ticket…", {
      clearUndo: true, success: `${last.label} restored to the desk.`,
    });
  }

  function giveWalkIn() {
    if (!data || data.service_state === "closed") return;
    void run(async () => {
      const created = await api.walkIn(deskId);
      setWalkIn({ label: created.label, token: created.token });
    }, "Issuing a walk-in ticket…", { success: "Walk-in ticket issued." });
  }

  // Keep one listener and current callbacks. Native controls, Radix portals,
  // dialogs and editable content must never trigger queue shortcuts.
  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onKeyRef.current = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || disabled || cancelTicket) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable='false']), [role='combobox'], [role='listbox'], [role='option'], [role='dialog'], [data-sonner-toast]")) return;
      const key = event.key.toLowerCase();
      if (key === "u" && last && undoLeft > 0 && !called) { event.preventDefault(); takeBack(); }
      else if (key === "n" && !called) { event.preventDefault(); callNext(); }
      else if (called && ["s", "m", "c", "r"].includes(key)) {
        event.preventDefault();
        if (key === "s") void decide("complete");
        else if (key === "m") void decide("skip");
        else if (key === "c") setCancelTicket(called);
        else void run(() => api.recall(called.ticket_id), "Calling the visitor again…", { success: `${called.label} called again.` });
      }
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  if (!data) return (
    <div className="staff-workspace">
      <DeskHeader deskId={deskId} desks={desks} onPick={pickDesk} refresh={refresh} pending={pending} />
      {error ? <LoadError error={error} retry={refresh} /> : <StaffDashboardSkeleton />}
    </div>
  );

  const connectionError = accessError ?? error;
  const expiredAccess = connectionError?.status === 401 || connectionError?.status === 403;
  const idleTitle = !data.desk.is_active ? "This desk is retired" : data.service_state === "paused" ? "Desk paused"
    : data.service_state === "closed" ? "Desk closed" : data.waiting > 0 ? "Ready for the next visitor" : "You're all caught up";

  return (
    <div className="staff-workspace">
      <DeskHeader deskId={deskId} desks={desks} onPick={pickDesk} refresh={refresh} pending={pending} disabled={pending !== null} stale={stale} />

      <div className="staff-desk-toolbar">
        <div className="staff-availability">
          <DeskStateBadge state={data.service_state} />
          <div role="group" aria-label="Desk availability" className="staff-state-controls">
            {SERVICE_BUTTONS.map((button) => {
              const Icon = button.icon;
              return (
                <button key={button.state} type="button" aria-pressed={data.service_state === button.state}
                  disabled={disabled || data.service_state === button.state}
                  onClick={() => void run(() => api.setService(deskId, button.state), "Updating desk availability…", { success: `Desk ${button.state === "active" ? "opened" : button.state}.` })}>
                  <Icon size={14} aria-hidden="true" />
                  {button.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <QueueConnectionToast interrupted={stale || Boolean(accessError)} accessDenied={expiredAccess}
        lastConfirmedAt={snapshot!.receivedAt} reconnect={refresh} />

      <dl className="staff-summary" aria-label="Queue and personal activity">
        <Metric label="Waiting now" value={String(data.waiting)} hint={data.service.name} />
        <Metric label="Your served today" value={String(data.tally.served)} hint="All desks, since 00:00 Kigali" />
        <Metric label="Your no-shows today" value={String(data.tally.no_shows)} hint="All desks, since 00:00 Kigali" />
        <Metric label="Service average" value={data.average_service_seconds === null ? "Not available" : formatDuration(data.average_service_seconds)}
          hint={data.average_service_seconds === null ? "Not enough completed tickets" : `Latest ${plural(data.service_samples, "completed ticket")}`} />
      </dl>

      <div className="staff-main-grid">
        <section className="staff-call-panel" aria-labelledby="current-visitor-title" aria-busy={pending !== null}>
          <div className="staff-panel-heading">
            <h2 id="current-visitor-title">Current visitor</h2>
            <span>{data.desk.name}</span>
          </div>
          {called ? (
            <div className="staff-active-call">
              <div className="staff-call-identity">
                <span className="staff-call-label"><span aria-hidden="true" />Now calling</span>
                {/* Keep the first p.tabular-nums as the called ticket for the browser suite. */}
                <p className="staff-ticket-number tabular-nums" aria-live="polite" aria-atomic="true">{called.label}</p>
                <span className="staff-call-service">{data.service.name}</span>
                {called.contact && <a className="staff-contact" href={contactHref(called.contact)}>{called.contact}</a>}
              </div>
              <div className="staff-call-timers">
                <div><span><Clock3 size={15} aria-hidden="true" />Since called</span>
                  <strong className="tabular-nums">{elapsed === null ? "—" : formatDuration(elapsed)}</strong></div>
                <div><span>Returns to queue in</span>
                  <strong className={`tabular-nums ${remaining !== null && remaining <= 10 ? "staff-time-warning" : ""}`}>
                    {stale ? "Unconfirmed" : remaining === null ? "—" : remaining === 0 ? "Checking…" : `${Math.ceil(remaining)} s`}
                  </strong></div>
              </div>
              <p className="staff-call-explanation">Unanswered calls return to the back of this service&apos;s queue.
                {data.hold_shortened && ` The hold is shorter because ${data.hold_reason ?? "the counter was empty"}.`}</p>
              <div className="staff-ticket-actions">
                <Button className="staff-serve" size="lg" disabled={disabled} onClick={() => void decide("complete")}>
                  <Check size={20} aria-hidden="true" />Served<Shortcut>S</Shortcut>
                </Button>
                <div className="staff-secondary-actions">
                  <Button variant="quiet" disabled={disabled} onClick={() => void run(() => api.recall(called.ticket_id), "Calling the visitor again…", { success: `${called.label} called again.` })}>
                    <Megaphone size={16} aria-hidden="true" />Call again<Shortcut>R</Shortcut>
                  </Button>
                  <Button variant="quiet" disabled={disabled} onClick={() => void decide("skip")}>
                    No-show<Shortcut>M</Shortcut>
                  </Button>
                </div>
                <button className="staff-cancel" type="button" disabled={disabled} onClick={() => setCancelTicket(called)}>
                  Cancel ticket<Shortcut>C</Shortcut>
                </button>
              </div>
            </div>
          ) : (
            <div className="staff-idle-call">
              <span className="staff-idle-icon" aria-hidden="true">
                {data.service_state === "paused" ? <Pause size={28} /> : data.service_state === "closed" ? <X size={28} /> : data.waiting > 0 ? <Megaphone size={28} /> : <Check size={28} />}
              </span>
              <h3>{idleTitle}</h3>
              <p>{!data.desk.is_active ? "Choose another desk to continue serving visitors."
                : data.service_state !== "active" ? "Open this desk to call the next visitor."
                  : data.waiting > 0 ? `${plural(data.waiting, "visitor")} waiting for ${data.service.name}.`
                    : "No visitors are waiting for this service. New tickets will appear here automatically."}</p>
              <Button size="lg" className="staff-call-next" onClick={callNext}
                disabled={disabled || data.waiting === 0 || data.service_state !== "active"}>
                Call next<ArrowRight size={18} aria-hidden="true" /><Shortcut>N</Shortcut>
              </Button>
              <span className="staff-idle-note">{data.waiting > 0 ? `${plural(data.waiting, "ticket")} in this service's queue` : "No ticket is being called"}</span>
            </div>
          )}

          {last && undoLeft > 0 && !called && (
            <div className="staff-undo" role="status">
              <Undo2 size={18} aria-hidden="true" />
              <div><strong>{last.label} {last.what}</strong><span>{undoLeft} s left to undo</span></div>
              <Button variant="quiet" disabled={disabled} onClick={takeBack}>Take that back<Shortcut>U</Shortcut></Button>
            </div>
          )}
          {pending && <p className="staff-action-progress" role="status">{pending}</p>}
          {notice && !cancelTicket && <ActionNotice notice={notice} />}
        </section>

        <section className="staff-waiting-panel" aria-labelledby="waiting-queue-title">
          <div className="staff-panel-heading">
            <h2 id="waiting-queue-title">Waiting queue</h2>
            <span className="staff-waiting-count" aria-live="polite" aria-atomic="true">{data.waiting} waiting</span>
          </div>
          {data.queue.length > 0 ? (
            <>
              <div className="staff-queue-scroll" tabIndex={0} role="region" aria-label="Waiting tickets, in queue order">
                <table className="staff-queue-table">
                  <caption className="sr-only">{data.service.name} tickets in server queue order</caption>
                  <thead><tr><th scope="col">Ticket</th><th scope="col">Joined</th><th scope="col">Waiting</th></tr></thead>
                  <tbody>{data.queue.map((ticket, index) => {
                    const waitSeconds = Math.max(0, Math.floor((serverNow - Date.parse(ticket.created_at)) / 1000));
                    return (
                      <tr key={ticket.ticket_id} className={index === 0 ? "staff-next-row" : undefined}>
                        <td><span className="staff-queue-ticket tabular-nums">{ticket.label}</span>
                          {index === 0 && <small className="staff-next-label">Next in line</small>}
                          {ticket.contact && <a className="staff-queue-contact" href={contactHref(ticket.contact)}>{ticket.contact}</a>}</td>
                        <td><time dateTime={ticket.created_at} title={fullTimestamp(ticket.created_at)}>{clockTime(ticket.created_at)}</time></td>
                        <td className="tabular-nums">{Number.isFinite(waitSeconds) ? formatDuration(waitSeconds) : "—"}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <p className="staff-queue-footnote">
                {data.waiting > data.queue.length && `Showing the first ${data.queue.length} of ${data.waiting} tickets. `}
                Other desks serving {data.service.name} share this queue.
              </p>
            </>
          ) : (
            <div className="staff-queue-empty">
              <div className="staff-queue-empty-icon" aria-hidden="true">
                <ListOrdered size={22} />
              </div>
              <strong>The queue is empty</strong>
              <p>Tickets for {data.service.name} will appear here in order as visitors join.</p>
              <p className="staff-queue-empty-hint">Call the next visitor when one arrives, or give a walk-in a ticket below.</p>
            </div>
          )}
          <div className="staff-walk-in">
            <div><Ticket size={18} aria-hidden="true" /><h3>Visitor without a phone?</h3></div>
            <Button variant="quiet" className="staff-walk-in-button" onClick={giveWalkIn}
              disabled={disabled || data.service_state === "closed"}>Give a walk-in a ticket</Button>
            {data.service_state === "closed" && <p>Open or pause this desk to issue a ticket.</p>}
            {walkIn && <p className="staff-walk-in-result" role="status">Ticket <strong>{walkIn.label}</strong> issued. <Link href={`/ticket/${walkIn.token}`}>Open visitor ticket</Link></p>}
          </div>
        </section>
      </div>

      <DeviceStatus device={data.device} serverNow={serverNow} stale={stale} />

      <section className="staff-trends">
        <div className="staff-panel-title">
          <span className="staff-trends-icon"><BarChart3 size={20} aria-hidden="true" /></span>
          <span><strong>Service trends</strong><small>Ticket outcomes and daily activity for {data.service.name}</small></span>
        </div>
        <div className="staff-trend-content">
          <p className="staff-trend-scope">Outcomes cover all recorded tickets for this service. The date filter applies to daily activity only.</p>
          <div className="staff-charts"><OutcomesDonut outcomes={data.charts.outcomes} />
            <DailyAreaChart perDay={data.charts.per_day} range={range} onRangeChange={setRange} /></div>
        </div>
      </section>

      <Dialog open={cancelTicket !== null} onOpenChange={(open) => { if (!open) setCancelTicket(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md motion-reduce:animate-none"
          onOpenAutoFocus={(event) => { event.preventDefault(); keepTicketRef.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>Cancel {cancelTicket?.label}?</DialogTitle>
            <DialogDescription>This ends the ticket without marking it as served. Use No-show instead if the visitor has not arrived.</DialogDescription>
          </DialogHeader>
          {cancelTicket && called?.ticket_id !== cancelTicket.ticket_id && <p role="alert" className="text-sm text-rose-700">This ticket is no longer the current call. Close this dialog to review the queue.</p>}
          {notice?.tone === "error" && <p role="alert" className="text-sm text-rose-700">{notice.text}</p>}
          <DialogFooter>
            <Button ref={keepTicketRef} variant="quiet" onClick={() => setCancelTicket(null)}>Keep ticket</Button>
            <Button className="bg-rose-700 text-white hover:bg-rose-800" disabled={disabled || called?.ticket_id !== cancelTicket?.ticket_id}
              onClick={async () => { if (cancelTicket && await decide("cancel", cancelTicket)) setCancelTicket(null); }}>Confirm cancellation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Shortcut({ children }: { children: string }) {
  return <kbd className="staff-key-hint" aria-hidden="true">{children}</kbd>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="staff-metric"><dt>{label}</dt><dd className="staff-metric-value tabular-nums">{value}</dd><dd className="staff-metric-hint">{hint}</dd></div>;
}

function ActionNotice({ notice }: { notice: Notice }) {
  return <p className={`staff-action-notice staff-action-notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
    {notice.tone === "success" ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}{notice.text}
  </p>;
}
