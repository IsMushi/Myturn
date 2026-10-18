"use client";

import { useCallback, useState, type FormEvent } from "react";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import type { ServiceState, StaffQueue } from "@/lib/types";

const SERVICE_BUTTONS: { state: ServiceState; label: string }[] = [
  { state: "active", label: "Open" },
  { state: "paused", label: "Pause" },
  { state: "closed", label: "Close" },
];

export default function StaffPage() {
  const load = useCallback(() => api.queue(), []);
  const { data, error, refresh } = usePolling<StaffQueue>(load, 2000);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "The action failed");
    } finally {
      setBusy(false);
    }
  }

  if (error?.status === 401) {
    return <SignIn onSignedIn={refresh} />;
  }

  if (!data) {
    return (
      <p className="text-slate-500">{error ? error.message : "Loading the queue…"}</p>
    );
  }

  const device = data.device;
  const called = data.called;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Service desk</h1>
        <DeskStateBadge state={data.service_state} />
        <span className="text-sm text-slate-500">
          {data.waiting} waiting
          {data.service_updated_by ? ` · set by ${data.service_updated_by}` : ""}
        </span>
        <button
          onClick={() => void run(() => api.logout())}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>

      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <span className="mr-2 text-sm font-medium text-slate-600">Desk state</span>
        {SERVICE_BUTTONS.map((button) => (
          <button
            key={button.state}
            onClick={() => void run(() => api.setService(button.state))}
            disabled={busy || data.service_state === button.state}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            {button.label}
          </button>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-semibold text-slate-700">Board</h2>
        {device ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-600">
            <span className={device.online ? "text-emerald-700" : "text-rose-600"}>
              {device.online ? "● online" : "● offline"}
            </span>
            <span>last report {relative(device.last_seen)}</span>
            <span>distance {device.distance_cm ?? "—"} cm</span>
            <span>{device.occupied ? "someone at the counter" : "counter free"}</span>
            <span className={device.approach ? "font-medium text-amber-700" : ""}>
              {device.approach ? "visitor approaching" : "no approach"}
            </span>
            <span>light {device.led_state ?? "—"}</span>
          </p>
        ) : (
          <p className="mt-2 text-slate-600">No board has reported yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        {called ? (
          <div className="text-center">
            <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">
              Now calling
            </p>
            <p className="text-6xl font-bold tabular-nums">{called.ticket_no}</p>
            <p className="mt-2 text-sm text-slate-600">
              Called {relative(called.called_at)}. If nobody comes, the turn goes back to the
              queue in <span className="font-medium">{data.hold_remaining ?? 0} s</span>.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => void run(() => api.ticketAction(called.ticket_id, "complete"))}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Served
              </button>
              <button
                onClick={() => void run(() => api.ticketAction(called.ticket_id, "skip"))}
                disabled={busy}
                className="rounded-lg bg-amber-500 px-5 py-2.5 font-semibold text-white hover:bg-amber-400 disabled:opacity-50"
              >
                No-show
              </button>
              <button
                onClick={() => void run(() => api.ticketAction(called.ticket_id, "cancel"))}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-5 py-2.5 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                Cancelled
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-slate-600">
              No ticket is being called.
            </p>
            <button
              onClick={() => void run(() => api.callNext())}
              disabled={busy || data.waiting === 0}
              className="mt-4 rounded-xl bg-slate-900 px-8 py-4 text-lg font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Call next
            </button>
          </div>
        )}
        {notice && <p className="mt-4 text-center text-sm text-rose-600">{notice}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-700">Waiting list</h2>
        {data.queue.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">The queue is empty.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.queue.map((ticket) => (
              <li
                key={ticket.ticket_id}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold tabular-nums"
              >
                {ticket.ticket_no}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [name, setName] = useState("staff");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(name, password);
      await onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold tracking-tight">Staff sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        The dashboard is for the person at the desk.
      </p>

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          autoComplete="username"
        />
      </label>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          autoComplete="current-password"
        />
      </label>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
