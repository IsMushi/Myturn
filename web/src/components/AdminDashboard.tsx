"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Link2, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Alert, Field, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { calendarDate, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useSession, type SessionState } from "@/lib/useSession";
import type { AccountsListing, DeskList, PublicState, Role } from "@/lib/types";
import { inviteSchema, type InviteValues } from "@/lib/validation";

/**
 * The administrator's page.
 *
 * Handing out invitations, keeping the roster of accounts in order, and moving
 * somebody between the service desk and the administration are the whole job.
 * An invitation can still only ever create a staff account; administrator
 * rights are granted afterwards, from the accounts table, which is also the
 * only place they are taken back.
 */
export function AdminDashboard() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "out") router.replace("/auth/login?next=/admin/dashboard");
  }, [session.status, router]);

  if (session.status === "loading") {
    return <p className="text-medium-green">Checking your session…</p>;
  }
  if (session.status === "out") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Loader2 size={20} className="animate-spin text-medium-green" aria-hidden="true" />
        <p className="text-sm text-medium-green">Taking you to the sign-in page…</p>
      </div>
    );
  }
  if (session.session.user?.role !== "admin") {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center">
        <h1 className="text-xl font-semibold text-deep-green">Administrators only</h1>
        <p className="mt-2 text-sm text-medium-green">
          This page manages the team&rsquo;s accounts. Your account works the queue from the
          staff dashboard instead.
        </p>
        <Link
          href="/staff/dashboard"
          className="mt-5 inline-block rounded-full bg-deep-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-medium-green"
        >
          Go to the staff dashboard
        </Link>
      </div>
    );
  }

  return <Administration session={session} />;
}

function Administration({ session }: { session: Extract<SessionState, { status: "in" }> }) {
  const load = useCallback(() => api.accounts(), []);
  const { data, error, refresh } = usePolling<AccountsListing>(load, 15000);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data: office, refresh: refreshOffice } = usePolling<PublicState>(
    useCallback(() => api.publicState(), []),
    5000,
  );
  const { data: desks, refresh: refreshDesks } = usePolling<DeskList>(
    useCallback(() => api.desks(), []),
    10000,
  );

  // A queue, desk or service change moves the summary and the open-desk count
  // at once; the polls above stay as the fallback when the stream is away.
  useLiveRefresh(() => {
    void refreshOffice();
    void refreshDesks();
  }, 10000);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
  });

  async function invite(values: InviteValues) {
    setNotice(null);
    setFailure(null);
    setInvited(null);
    try {
      const created = await api.invite(values.email);
      setInvited(created.register_path ?? null);
      setNotice(
        created.replaced
          ? `A fresh link replaces the one already waiting for ${created.email}. It stays usable for ${created.expires_in_hours} hours.`
          : `Invitation ready for ${created.email}. It stays usable for ${created.expires_in_hours} hours.`,
      );
      form.reset();
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The invitation could not be created");
    }
  }

  async function switchAccount(userId: number, isActive: boolean) {
    setBusyId(userId);
    setNotice(null);
    setFailure(null);
    try {
      await api.setAccountActive(userId, isActive);
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The account could not be changed");
    } finally {
      setBusyId(null);
    }
  }

  async function moveRole(userId: number, role: Role) {
    setBusyId(userId);
    setNotice(null);
    setFailure(null);
    try {
      await api.setAccountRole(userId, role);
      setNotice(
        role === "admin"
          ? "That account is now an administrator."
          : "That account is back on the service desk.",
      );
      await refresh();
    } catch (e) {
      // The server refuses to leave the installation without an administrator,
      // so this message is usually that rule answering.
      setFailure(e instanceof Error ? e.message : "The rights could not be changed");
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(invitationId: number) {
    setBusyId(invitationId);
    setNotice(null);
    setFailure(null);
    try {
      const gone = await api.revokeInvitation(invitationId);
      setNotice(`The invitation for ${gone.email} has been withdrawn.`);
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The invitation could not be withdrawn");
    } finally {
      setBusyId(null);
    }
  }

  const account = session.session.user;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Administration</h1>
      </div>

      {office && (
        <section className="grid gap-3 sm:grid-cols-3">
          <Summary label="Waiting now" value={String(office.waiting)} />
          <Summary label="Services on offer" value={String(office.services.length)} />
          <Summary
            label="Desks open"
            value={String(
              (desks?.desks ?? []).filter((desk) => desk.service_state === "active").length,
            )}
          />
        </section>
      )}

      <section className="rounded-2xl bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
          <UserPlus className="size-5" aria-hidden="true" />
          Invite a staff member
        </h2>
        <p className="mt-1 text-sm text-medium-green">
          An invitation is the only way to create an account. It is tied to one address and can
          be used once. It always creates a staff account; administrator rights are granted
          afterwards, from the table below.
        </p>

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => void invite(values), focusFirstError)}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field
              label="Email address"
              id="invite-email"
              error={form.formState.errors.email?.message}
            >
              <TextInput
                id="invite-email"
                type="email"
                autoComplete="off"
                placeholder="colleague@example.com"
                error={Boolean(form.formState.errors.email)}
                {...form.register("email")}
              />
            </Field>
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating…" : "Create invitation"}
          </Button>
        </form>

        {notice && <div className="mt-4"><Alert tone="success">{notice}</Alert></div>}
        {failure && <div className="mt-4"><Alert tone="error" focus>{failure}</Alert></div>}
        {invited && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-soft-mint px-3.5 py-3 text-sm text-deep-green">
            <Link2 className="size-4" aria-hidden="true" />
            <span className="break-all">Register link: {invited}</span>
          </p>
        )}
        <p className="mt-3 text-xs text-medium-green">
          There is no mail server in the prototype, so the link is shown here. On the deployed
          system this is the address the invitation is emailed to.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Accounts</h2>
        <p className="mt-1 text-xs text-medium-green">
          Switching an account off ends its access without deleting its history. The last
          administrator cannot be made a staff member: the installation would be left with
          nobody able to open this page.
        </p>
        {error && <p className="mt-2 text-sm text-rose-700">{error.message}</p>}
        {!data && !error && <p className="mt-2 text-sm text-medium-green">Loading accounts…</p>}

        {data && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-medium-green uppercase">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Role</th>
                  <th className="py-2 pr-4 font-semibold">Last sign in</th>
                  <th className="py-2 pr-4 font-semibold">State</th>
                  <th className="py-2 font-semibold">Account</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.user_id} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-4 font-medium text-deep-green">{user.full_name}</td>
                    <td className="py-3 pr-4 text-medium-green">{user.email}</td>
                    <td className="py-3 pr-4">
                      <span className={user.role === "admin" ? "font-semibold text-deep-green" : "text-medium-green"}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-medium-green">{relative(user.last_login_at)}</td>
                    <td className="py-3 pr-4">
                      <span className={user.is_active ? "text-medium-green" : "text-rose-700"}>
                        {user.is_active ? "in use" : "switched off"}
                      </span>
                    </td>
                    <td className="py-3">
                      {user.user_id === account?.user_id ? (
                        <span className="text-xs text-medium-green">this is you</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void switchAccount(user.user_id, !user.is_active)}
                            disabled={busyId === user.user_id}
                            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-deep-green hover:bg-soft-mint disabled:opacity-50"
                          >
                            {busyId === user.user_id
                              ? "Working…"
                              : user.is_active
                                ? "Switch off"
                                : "Switch on"}
                          </button>
                          <button
                            onClick={() =>
                              void moveRole(user.user_id, user.role === "admin" ? "staff" : "admin")
                            }
                            disabled={busyId === user.user_id}
                            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-deep-green hover:bg-soft-mint disabled:opacity-50"
                          >
                            {user.role === "admin" ? "Make staff" : "Make administrator"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.invitations.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-deep-green">Waiting to be accepted</h3>
            <p className="mt-1 text-xs text-medium-green">
              Inviting the same address again replaces its link; the older one stops working.
            </p>
            <ul className="mt-2 space-y-2 text-sm text-medium-green">
              {data.invitations.map((invitation) => (
                <li
                  key={invitation.invitation_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <CheckCircle2 className="size-4 text-medium-green" aria-hidden="true" />
                  <span className="font-medium text-deep-green">{invitation.email}</span>
                  <span>expires {calendarDate(invitation.expires_at)}</span>
                  <button
                    onClick={() => void withdraw(invitation.invitation_id)}
                    disabled={busyId === invitation.invitation_id}
                    className="ml-auto rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-deep-green hover:bg-soft-mint disabled:opacity-50"
                  >
                    {busyId === invitation.invitation_id ? "Working…" : "Withdraw invitation"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <p className="text-xs tracking-wide text-medium-green uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold text-deep-green capitalize">{value}</p>
    </div>
  );
}
