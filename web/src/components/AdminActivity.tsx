"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { clockTime, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { ActivityEntry, ActivityFeed } from "@/lib/types";

/**
 * What has happened lately, from all three records at once.
 *
 * The queue, the desk and the accounts each write their own history as they
 * change; this page only reads it back. Nothing here is a summary the server
 * keeps separately, so the list cannot drift from what actually happened.
 */

const LABELS: Record<string, string> = {
  created: "Ticket issued",
  called: "Called to the desk",
  requeued: "Missed its turn, re-issued at the back",
  completed: "Served",
  skipped: "Logged as a no-show",
  cancelled: "Cancelled",
  recalled: "Number announced again",
  undone: "Last decision taken back",
  "desk active": "Desk opened",
  "desk paused": "Desk paused",
  "desk closed": "Desk closed",
  "desk settings changed": "Desk settings changed",
  invited: "Invitation created",
  "invitation replaced": "Invitation replaced",
  "invitation revoked": "Invitation withdrawn",
  registered: "Account created from an invitation",
  "switched on": "Account switched on",
  "switched off": "Account switched off",
  "role changed": "Administrator rights changed",
  "password changed": "Password changed while signed in",
  "password reset": "Password reset from a link",
};

const KINDS = [
  { key: "all", label: "Everything" },
  { key: "ticket", label: "Queue" },
  { key: "desk", label: "Desk" },
  { key: "account", label: "Accounts" },
] as const;

type KindFilter = (typeof KINDS)[number]["key"];

export function AdminActivity() {
  const load = useCallback(() => api.activity(120), []);
  const { data, error, refresh } = usePolling<ActivityFeed>(load, 10000);
  // A ticket, desk or account change should appear at the top at once.
  useLiveRefresh(refresh, 10000);
  const [kind, setKind] = useState<KindFilter>("all");

  const entries = useMemo(() => {
    const all = data?.entries ?? [];
    return kind === "all" ? all : all.filter((entry) => entry.kind === kind);
  }, [data, kind]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Activity</h1>
        {data && (
          <span className="text-sm text-medium-green">
            newest first, checked {relative(data.server_time)}
          </span>
        )}
        <button
          type="button"
          onClick={() => void refresh()}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-sm font-semibold text-deep-green hover:bg-soft-mint"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <p className="text-sm text-medium-green">
        Everything the prototype recorded: tickets as they moved, the desk as it opened and
        closed, and the accounts as they changed. Each line names whoever caused it.
      </p>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setKind(option.key)}
            aria-pressed={kind === option.key}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
              kind === option.key
                ? "border-deep-green bg-deep-green text-white"
                : "border-line bg-white text-deep-green hover:bg-soft-mint"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl bg-white p-5">
        {error && (
          <p className="text-sm text-rose-700">
            The history could not be read: {error.message}
          </p>
        )}
        {!data && !error && <p className="text-sm text-medium-green">Loading the history…</p>}

        {data && entries.length === 0 && (
          <p className="text-sm text-medium-green">Nothing has been recorded here yet.</p>
        )}

        {entries.length > 0 && (
          <ol className="divide-y divide-line/60">
            {entries.map((entry, index) => (
              <Row key={`${entry.at}-${entry.kind}-${index}`} entry={entry} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({ entry }: { entry: ActivityEntry }) {
  const label = LABELS[entry.event] ?? entry.event;

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm">
      <time className="w-16 shrink-0 tabular-nums text-medium-green" dateTime={entry.at}>
        {clockTime(entry.at)}
      </time>
      <span className="rounded-md bg-soft-mint px-2 py-0.5 text-xs font-semibold tracking-wide text-deep-green uppercase">
        {entry.kind}
      </span>
      <span className="font-medium text-deep-green">{label}</span>
      {entry.ticket_no !== null && (
        <span className="tabular-nums text-medium-green">ticket #{entry.ticket_no}</span>
      )}
      {entry.email && <span className="break-all text-medium-green">{entry.email}</span>}
      {entry.detail && <span className="text-medium-green">({entry.detail})</span>}
      <span className="ml-auto text-xs text-medium-green">by {entry.actor}</span>
    </li>
  );
}
