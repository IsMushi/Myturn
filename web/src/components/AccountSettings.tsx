"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, KeyRound, ListChecks, Pencil, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, Field, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { calendarDate, clockTime, fullTimestamp, plural } from "@/lib/format";
import { focusFirstError } from "@/lib/forms";
import type { AccountWork } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";
import { announceSessionChange, useSession } from "@/lib/useSession";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/validation";
import { z } from "zod";

/**
 * Your own account.
 *
 * Four things, and nothing else: who you are, what you may do, what you have
 * worked and what has happened to the account. The password is here too, but
 * it is one part of the page rather than the whole of it.
 *
 * Only the account behind the session can be changed from here, and the
 * current password is asked for again before the password changes: a browser
 * left open at the desk should not be enough on its own to lock the owner out
 * of their own account.
 *
 * The server keeps the same rules, so a failure shown here is the server's own
 * answer rather than a guess about what it would have said.
 */

/** The name is the one field the owner of an account may correct. */
const nameSchema = z.object({
  full_name: z.string().trim().min(2, "Add your full name").max(80, "That name is too long"),
});
type NameValues = z.infer<typeof nameSchema>;

/** What each role may do, in plain words. */
const POWERS: Record<"admin" | "staff", string[]> = {
  admin: [
    "Work any desk: call the next visitor and record what happened.",
    "Invite staff members, change what they may do, and switch an account off.",
    "Edit the services the office offers and the desks that serve them.",
    "Read the activity log and the statistics for every queue.",
  ],
  staff: [
    "Work any desk: call the next visitor and record what happened.",
    "Take a decision back for ten seconds, while the desk has not moved on.",
    "Give a visitor without a phone a ticket.",
  ],
};

/** What an account event was, in words rather than in the log's spelling. */
const ACCOUNT_EVENTS: Record<string, string> = {
  invited: "Invitation created",
  "invitation replaced": "Invitation replaced",
  "invitation revoked": "Invitation withdrawn",
  registered: "Account created from an invitation",
  "switched on": "Account switched on",
  "switched off": "Account switched off",
  "role changed": "Administrator rights changed",
  "password changed": "Password changed while signed in",
  "password reset": "Password reset from a link",
  profile: "Name changed",
  "service added": "Service added",
  "service settings changed": "Service wording changed",
  "service switched on": "Service switched on",
  "service switched off": "Service switched off",
  "desk added": "Desk added",
  "desk settings changed": "Desk settings changed",
};

/** What a decision at the counter was. */
const WORK_EVENTS: Record<string, string> = {
  created: "Ticket issued",
  called: "Called to the service point",
  recalled: "Called again",
  completed: "Served",
  skipped: "No-show",
  cancelled: "Cancelled",
  requeued: "Went back to the queue",
};

/** A word the log does not know, said as a sentence rather than as a key. */
function spoken(event: string, known: Record<string, string>): string {
  const known_word = known[event];
  if (known_word) return known_word;
  return event.charAt(0).toUpperCase() + event.slice(1);
}

/** The colour a decision carries, so a scan finds the outcome before the words. */
const WORK_DOTS: Record<string, string> = {
  completed: "bg-medium-green",
  skipped: "bg-amber-500",
  cancelled: "bg-danger",
  requeued: "bg-amber-500",
  called: "bg-deep-green",
  recalled: "bg-medium-green",
  created: "bg-medium-green",
};

type WorkGroup = {
  key: string;
  label: string;
  date: string;
  entries: AccountWork[];
};

type WorkSegment = {
  event: string;
  entries: AccountWork[];
};

/** The same ticket can be called several times; keep those decisions together. */
function groupWork(entries: AccountWork[]): WorkGroup[] {
  const groups: WorkGroup[] = [];
  const byKey = new Map<string, WorkGroup>();
  for (const entry of entries) {
    const date = calendarDate(entry.at);
    const key = `${date}|${entry.label}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: entry.label, date, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Collapse a run of the same action, such as eight "Called again" rows. */
function segmentWork(entries: AccountWork[]): WorkSegment[] {
  const segments: WorkSegment[] = [];
  for (const entry of entries) {
    const last = segments[segments.length - 1];
    if (last && last.event === entry.event) {
      last.entries.push(entry);
    } else {
      segments.push({ event: entry.event, entries: [entry] });
    }
  }
  return segments;
}

function segmentTime(segment: WorkSegment): string {
  const newest = clockTime(segment.entries[0].at);
  const oldest = clockTime(segment.entries[segment.entries.length - 1].at);
  return newest === oldest ? newest : `${oldest}–${newest}`;
}

/**
 * The person's own work at the counter.
 *
 * A busy desk calls the same ticket many times. Showing every press as its own
 * line made the record hard to scan, so the page groups the decisions by
 * ticket, keeps the latest action on the card, and folds the full run into a
 * timeline the person can open when they need it.
 */
function WorkHistory({
  entries,
  error,
}: {
  entries: AccountWork[] | null;
  error: { message: string } | null;
}) {
  const groups = entries ? groupWork(entries) : [];

  return (
    <section className="rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
            <ListChecks size={20} aria-hidden="true" />
            Your work at the service point
          </h2>
          <p className="mt-1 text-sm text-medium-green">
            The tickets you worked, newest first. Open a ticket to see every action.
          </p>
        </div>
        {entries && entries.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-medium-green">
            <span className="rounded-full bg-soft-mint px-2.5 py-1 font-semibold text-deep-green">
              {plural(groups.length, "ticket")}
            </span>
            <span>{plural(entries.length, "action")}</span>
          </p>
        )}
      </div>

      {error ? (
        <div className="mt-4">
          <Alert tone="error">Your record could not be read: {error.message}</Alert>
        </div>
      ) : !entries ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Reading your record">
          <div className="h-20 animate-pulse rounded-2xl bg-soft-mint" />
          <div className="h-20 animate-pulse rounded-2xl bg-soft-mint" />
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-soft-mint/40 px-5 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-white text-medium-green">
            <ListChecks size={20} aria-hidden="true" />
          </span>
          <p className="font-semibold text-deep-green">No service point work yet</p>
          <p className="max-w-sm text-sm text-medium-green">
            When you call or serve a ticket, the decision will appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {groups.map((group) => {
            const latest = group.entries[0];
            const segments = segmentWork(group.entries);
            const latestSegment = segments[0];
            return (
              <li key={group.key} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="inline-flex min-w-16 justify-center rounded-xl bg-deep-green px-3 py-2 font-semibold tabular-nums text-white">
                    {group.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="flex items-center gap-2 font-semibold text-deep-green">
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-full ${
                            WORK_DOTS[latest.event] ?? "bg-medium-green"
                          }`}
                        />
                        {spoken(latest.event, WORK_EVENTS)}
                      </p>
                      {latestSegment.entries.length > 1 && (
                        <span className="rounded-full bg-soft-mint px-2 py-0.5 text-[11px] font-semibold text-deep-green">
                          ×{latestSegment.entries.length}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-medium-green">
                      {group.date} · latest at {clockTime(latest.at)} ·{" "}
                      {plural(group.entries.length, "action")}
                    </p>
                  </div>
                </div>

                {(segments.length > 1 || group.entries.length > 1) && (
                  <details className="group mt-3 border-t border-line pt-3">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-deep-green hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green [&::-webkit-details-marker]:hidden">
                      <ChevronDown
                        size={15}
                        aria-hidden="true"
                        className="transition group-open:rotate-180"
                      />
                      Show the full history
                    </summary>
                    <ol className="mt-3 space-y-3 border-l border-line pl-4">
                      {segments.map((segment) => (
                        <li
                          key={`${segment.event}-${segment.entries[0].at}`}
                          className="relative"
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute top-1.5 -left-5 size-2 rounded-full ${
                              WORK_DOTS[segment.event] ?? "bg-medium-green"
                            }`}
                          />
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-medium text-deep-green">
                              {spoken(segment.event, WORK_EVENTS)}
                              {segment.entries.length > 1 && (
                                <span className="ml-1.5 text-xs font-normal text-medium-green">
                                  ×{segment.entries.length}
                                </span>
                              )}
                            </p>
                            <p className="text-xs tabular-nums text-medium-green">
                              {segmentTime(segment)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AccountSettings() {
  const session = useSession();
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [nameDone, setNameDone] = useState<string | null>(null);
  const [nameFailure, setNameFailure] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const account = session.status === "in" ? session.session.user : undefined;
  const administrator = session.status === "in" ? session.session.administrator : undefined;

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", password: "", confirm_password: "" },
  });

  const nameForm = useForm<NameValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: { full_name: account?.full_name ?? "" },
  });

  // The name the server has may be newer than the one the form was given, so
  // the field is filled from the account whenever it changes.
  useEffect(() => {
    if (account?.full_name) {
      nameForm.reset({ full_name: account.full_name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.full_name]);

  const loadHistory = useCallback(() => api.accountHistory(), []);
  const loadWork = useCallback(() => api.accountWork(), []);
  const history = usePolling(loadHistory, 30000);
  const work = usePolling(loadWork, 30000);

  async function submit(values: ChangePasswordValues) {
    setDone(null);
    setFailure(null);
    try {
      const result = await api.changePassword(values);
      form.reset();
      setFailure(null);
      setDone(result.message);
      setPasswordOpen(false);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The password could not be changed");
    }
  }

  async function saveName(values: NameValues) {
    setNameDone(null);
    setNameFailure(null);
    try {
      const result = await api.updateProfile(values);
      nameForm.reset({ full_name: result.user.full_name });
      setNameDone(result.message);
      // The sidebar carries a copy of the account, so it is told to read it
      // again rather than keeping the old name.
      announceSessionChange();
    } catch (e) {
      setNameFailure(e instanceof Error ? e.message : "The name could not be changed");
    }
  }

  const initials = (account?.full_name ?? "")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Your account</h1>

      {account && (
        <section className="rounded-2xl bg-white p-5">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-deep-green text-lg font-semibold text-white"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-deep-green">
                {account.full_name}
              </h2>
              <p className="truncate text-sm text-medium-green">{account.email}</p>
              <p className="mt-0.5 text-sm text-medium-green capitalize">
                {account.role === "admin" ? "administrator" : "service desk"}
                {account.is_active ? "" : " · switched off"}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-medium-green">Joined</dt>
              <dd className="mt-1 text-sm font-medium text-deep-green">
                {calendarDate(account.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-medium-green">Last signed in</dt>
              <dd className="mt-1 text-sm font-medium text-deep-green">
                {account.last_login_at ? fullTimestamp(account.last_login_at) : "This is your first sign-in"}
              </dd>
            </div>
          </dl>

          <form
            noValidate
            onSubmit={nameForm.handleSubmit((values) => void saveName(values), focusFirstError)}
            className="mt-5 border-t border-line pt-4"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-deep-green">
              <Pencil size={16} aria-hidden="true" />
              Your name
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Full name" id="full_name" error={nameForm.formState.errors.full_name?.message}>
                <TextInput
                  id="full_name"
                  autoComplete="name"
                  className="max-w-xs"
                  placeholder="e.g. Leah NIYODUHORANA"
                  error={Boolean(nameForm.formState.errors.full_name)}
                  {...nameForm.register("full_name")}
                />
              </Field>
              <Button type="submit" disabled={nameForm.formState.isSubmitting}>
                {nameForm.formState.isSubmitting ? "Saving…" : "Save my name"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-medium-green">
              The address is the one your invitation was sent to, so an administrator changes it
              and not you.
            </p>
            {administrator?.email && (
              <p className="mt-1 text-xs text-medium-green">
                Administrator contact:{" "}
                <a
                  href={`mailto:${administrator.email}`}
                  className="font-medium text-deep-green underline decoration-line underline-offset-2 hover:text-medium-green"
                >
                  {administrator.email}
                </a>
              </p>
            )}
            {nameDone && (
              <div className="mt-3 max-w-md">
                <Alert tone="success">{nameDone}</Alert>
              </div>
            )}
            {nameFailure && (
              <div className="mt-3 max-w-md">
                <Alert tone="error" focus>{nameFailure}</Alert>
              </div>
            )}
          </form>
        </section>
      )}

      {account && (
        <section className="rounded-2xl bg-white p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
            <ShieldCheck size={20} aria-hidden="true" />
            What you can do
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-medium-green">
            {POWERS[account.role].map((power) => (
              <li key={power} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-medium-green" />
                <span>{power}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WorkHistory entries={work.data?.entries ?? null} error={work.error} />

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Your account history</h2>
        <p className="mt-1 text-sm text-medium-green">
          Everything that has happened to this account, newest first.
        </p>

        {history.error ? (
          <p className="mt-3 text-sm text-danger">
            The history could not be read: {history.error.message}
          </p>
        ) : !history.data ? (
          <p className="mt-3 text-sm text-medium-green">Reading the history…</p>
        ) : history.data.entries.length === 0 ? (
          <p className="mt-3 text-sm text-medium-green">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {history.data.entries.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-medium-green">
                  {spoken(entry.event, ACCOUNT_EVENTS)}
                  {entry.detail && (
                    <span className="text-medium-green/70"> · {entry.detail}</span>
                  )}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-medium-green">
                  {calendarDate(entry.at)} {clockTime(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
              <KeyRound size={20} aria-hidden="true" />
              Password
            </h2>
            <p className="mt-1 text-sm text-medium-green">
              Use at least 8 characters. The sign-in page can send a reset link if you forget it.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setDone(null);
              setFailure(null);
              setPasswordOpen(true);
            }}
          >
            <KeyRound size={16} aria-hidden="true" />
            Change password
          </Button>
        </div>

        {done && (
          <div className="mt-4 max-w-md">
            <Alert tone="success">{done}</Alert>
          </div>
        )}

        <Dialog
          open={passwordOpen}
          onOpenChange={(open) => {
            setPasswordOpen(open);
            if (!open) {
              form.reset();
              setFailure(null);
            }
          }}
        >
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change your password</DialogTitle>
              <DialogDescription>
                Enter your current password, then choose a new one. Other open sessions are not
                signed out.
              </DialogDescription>
            </DialogHeader>

            <form
              noValidate
              onSubmit={form.handleSubmit((values) => void submit(values), focusFirstError)}
              className="space-y-4"
            >
              <Field
                label="Current password"
                id="current_password"
                error={form.formState.errors.current_password?.message}
              >
                <TextInput
                  id="current_password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your current password"
                  error={Boolean(form.formState.errors.current_password)}
                  {...form.register("current_password")}
                />
              </Field>

              <Field
                label="New password"
                id="password"
                error={form.formState.errors.password?.message}
              >
                <TextInput
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  error={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
              </Field>

              <Field
                label="New password again"
                id="confirm_password"
                error={form.formState.errors.confirm_password?.message}
              >
                <TextInput
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat the new password"
                  error={Boolean(form.formState.errors.confirm_password)}
                  {...form.register("confirm_password")}
                />
              </Field>

              {failure && <Alert tone="error" focus>{failure}</Alert>}

              <DialogFooter>
                <Button type="button" variant="quiet" onClick={() => setPasswordOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving…" : "Change my password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <p className="mt-4 text-xs text-medium-green">
          A session that is already open elsewhere is not closed by this. Signing out of this
          browser ends it here, from the foot of the menu.
        </p>
      </section>
    </div>
  );
}
