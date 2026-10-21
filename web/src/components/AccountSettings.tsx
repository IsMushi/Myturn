"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Pencil, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Alert, Field, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { calendarDate, clockTime, fullTimestamp } from "@/lib/format";
import { focusFirstError } from "@/lib/forms";
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
  called: "Called to the counter",
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

export function AccountSettings() {
  const session = useSession();
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [nameDone, setNameDone] = useState<string | null>(null);
  const [nameFailure, setNameFailure] = useState<string | null>(null);

  const account = session.status === "in" ? session.session.user : undefined;

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
      setDone(result.message);
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

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Your work at the counter</h2>
        <p className="mt-1 text-sm text-medium-green">
          The tickets you worked, newest first.
        </p>

        {work.error ? (
          <p className="mt-3 text-sm text-rose-700">Your record could not be read: {work.error.message}</p>
        ) : !work.data ? (
          <p className="mt-3 text-sm text-medium-green">Reading your record…</p>
        ) : work.data.entries.length === 0 ? (
          <p className="mt-3 text-sm text-medium-green">
            Nothing yet. Your decisions at the counter are recorded here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {work.data.entries.map((entry, index) => (
              <li key={`${entry.at}-${entry.ticket_no}-${index}`} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-16 shrink-0 font-semibold tabular-nums text-deep-green">
                  {entry.label}
                </span>
                <span className="text-medium-green">{spoken(entry.event, WORK_EVENTS)}</span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-medium-green">
                  {calendarDate(entry.at)} {clockTime(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Your account history</h2>
        <p className="mt-1 text-sm text-medium-green">
          Everything that has happened to this account, newest first.
        </p>

        {history.error ? (
          <p className="mt-3 text-sm text-rose-700">
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
        <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
          <KeyRound size={20} aria-hidden="true" />
          Change your password
        </h2>
        <p className="mt-1 text-sm text-medium-green">
          At least 8 characters. Forgetting it is not a problem: the sign-in page can send you
          a reset link.
        </p>

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => void submit(values), focusFirstError)}
          className="mt-4 max-w-md space-y-4"
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
              error={Boolean(form.formState.errors.confirm_password)}
              {...form.register("confirm_password")}
            />
          </Field>

          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : "Change my password"}
          </Button>
        </form>

        {done && (
          <div className="mt-4 max-w-md">
            <Alert tone="success">{done}</Alert>
          </div>
        )}
        {failure && (
          <div className="mt-4 max-w-md">
            <Alert tone="error" focus>{failure}</Alert>
          </div>
        )}

        <p className="mt-4 text-xs text-medium-green">
          A session that is already open elsewhere is not closed by this. Signing out of this
          browser ends it here, from the foot of the menu.
        </p>
      </section>
    </div>
  );
}
