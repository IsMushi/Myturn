"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Link2, MoreVertical, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, Field, Select, SelectItem, TextInput } from "@/components/ui/Field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { calendarDate, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useSession, type SessionState } from "@/lib/useSession";
import type { Account, AccountsListing, Role } from "@/lib/types";
import { inviteSchema, type InviteValues } from "@/lib/validation";

/**
 * The administrator's confirmations, as toasts.
 *
 * The account table is long, so a strip of text at the top of the page is a
 * long way from the row that was just changed. A toast lands beside the work.
 *
 * Every confirmation shares one id: a second action replaces the message
 * rather than stacking another card under it. The toast is dismissed by the
 * site-wide host, which carries a close button, so the administrator can take
 * it away as well as let it go.
 */
const ADMIN_NOTICE = "admin-notice";

/**
 * The value behind "Any desk" in the invitation dialog.
 *
 * A `Select` cannot use `""` for this: Radix treats the empty string as "no
 * value chosen", so the trigger renders an empty box instead of the label and
 * collapses to the height of its chevron. The sentinel lives only in the
 * dropdown; the invitation itself still sends an empty `desk_id` for any desk.
 */
const ANY_DESK = "any";

function confirm(title: string, description?: string) {
  toast.success(title, { id: ADMIN_NOTICE, testId: ADMIN_NOTICE, description });
}

/**
 * The team: who can sign in, what they may do, and who has been invited.
 *
 * Handing out invitations, keeping the roster of accounts in order, and moving
 * somebody between the service desk and the administration are the whole job of
 * this page. An invitation can still only ever create a staff account;
 * administrator rights are granted afterwards, from the accounts table, which is
 * also the only place they are taken back.
 *
 * The office summary that used to sit above the table now lives on the
 * Dashboard, which leads here when something on the team needs attention.
 */
export function AdminTeam() {
  const session = useSession();
  // AccountGate has already turned away a signed-out visitor and the shared
  // classroom password, which has no account behind it to show in this table.
  if (session.status !== "in" || !session.session.user) return null;
  return <TeamPanel session={session} />;
}

function TeamPanel({ session }: { session: Extract<SessionState, { status: "in" }> }) {
  const load = useCallback(() => api.accounts(), []);
  const { data, error, refresh } = usePolling<AccountsListing>(load, 15000);
  const loadDesks = useCallback(() => api.deskList(), []);
  const desks = usePolling(loadDesks, 30000);
  const [failure, setFailure] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const accountsHeading = useRef<HTMLHeadingElement>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [noticeBusy, setNoticeBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
  });

  async function postNotice() {
    if (!noticeText.trim()) return;
    setNoticeBusy(true);
    try {
      await api.postNotice(noticeText.trim());
      toast.success("Notice posted to the display.", { id: ADMIN_NOTICE });
      setNoticeText("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The notice could not be posted");
    } finally {
      setNoticeBusy(false);
    }
  }

  async function invite(values: InviteValues) {
    setFailure(null);
    setInvited(null);
    try {
      const created = await api.invite(values.email, values.desk_id ? Number(values.desk_id) : null);
      setInvited(created.register_path ?? null);
      confirm(
        created.replaced
          ? `A fresh link replaces the one already waiting for ${created.email}.`
          : `Invitation ready for ${created.email}.`,
        `It stays usable for ${created.expires_in_hours} hours.`,
      );
      form.reset();
      await refresh();
      setInviteOpen(false);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The invitation could not be created");
    }
  }

  async function switchAccount(user: Account, isActive: boolean) {
    setBusyId(user.user_id);
    setFailure(null);
    try {
      await api.setAccountActive(user.user_id, isActive);
      confirm(
        isActive ? "The account is switched on." : "The account is switched off.",
        user.email,
      );
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The account could not be changed");
    } finally {
      setBusyId(null);
    }
  }

  async function moveRole(userId: number, role: Role) {
    setBusyId(userId);
    setFailure(null);
    try {
      await api.setAccountRole(userId, role);
      confirm(
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
    setFailure(null);
    try {
      const gone = await api.revokeInvitation(invitationId);
      confirm(`The invitation for ${gone.email} has been withdrawn.`);
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The invitation could not be withdrawn");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount() {
    if (!deleting || deletingBusy || confirmEmail.trim().toLowerCase() !== deleting.email.toLowerCase()) return;
    setDeletingBusy(true);
    setDeleteError(null);
    try {
      const gone = await api.deleteAccount(deleting.user_id, confirmEmail.trim());
      await refresh();
      setDeleting(null);
      setConfirmEmail("");
      confirm(`The account for ${gone.email} was permanently deleted.`, "Its activity history remains.");
      setFailure(null);
      window.requestAnimationFrame(() => accountsHeading.current?.focus());
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "The account could not be deleted");
    } finally {
      setDeletingBusy(false);
    }
  }

  const account = session.session.user;
  const eligible = (data?.users ?? []).filter((user) => user.user_id !== account?.user_id);
  const selected = eligible.filter((user) => selectedIds.includes(user.user_id));
  const allSelected = eligible.length > 0 && selected.length === eligible.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.length > 0 && !allSelected;
  }, [selected.length, allSelected]);

  function toggleSelection(userId: number, checked: boolean) {
    setOpenMenu(null);
    setSelectedIds((ids) => {
      const current = ids.filter((id) => eligible.some((user) => user.user_id === id));
      return checked ? [...current, userId] : current.filter((id) => id !== userId);
    });
  }

  async function applyBulk(action: "activate" | "deactivate" | "delete") {
    if (bulkBusy || selected.length === 0) return;
    if (action === "delete" && bulkConfirm !== `DELETE ${selected.length}`) return;
    setBulkBusy(true);
    setBulkError(null);
    setFailure(null);
    try {
      const result = await api.batchAccounts(action, selected, action === "delete" ? bulkConfirm : undefined);
      await refresh();
      setSelectedIds([]);
      setBulkOpen(false);
      setBulkConfirm("");
      confirm(
        action === "delete"
          ? `${result.changed} ${result.changed === 1 ? "account was" : "accounts were"} permanently deleted.`
          : `${result.changed} ${result.changed === 1 ? "account was" : "accounts were"} switched ${action === "activate" ? "on" : "off"}.`,
        action === "delete" ? "Activity history remains." : undefined,
      );
      window.requestAnimationFrame(() => accountsHeading.current?.focus());
    } catch (e) {
      const message = e instanceof Error ? e.message : "The selected accounts could not be changed";
      if (action === "delete") setBulkError(message);
      else setFailure(message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Team</h1>
        <p className="mt-1 max-w-2xl text-sm text-medium-green">
          Everyone who can work this service point, and every invitation still waiting to be
          accepted. An invitation creates a staff account only; administrator rights are granted
          from the table below.
        </p>
      </div>

      {data && (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="The team at a glance">
          <Summary label="Accounts" value={String(data.users.length)} />
          <Summary
            label="Administrators"
            value={String(data.users.filter((user) => user.role === "admin").length)}
          />
          <Summary label="Invitations waiting" value={String(data.invitations.length)} />
        </section>
      )}

      <section className="rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
              <UserPlus className="size-5" aria-hidden="true" />
              Invite a staff member
            </h2>
            <p className="mt-1 text-sm text-medium-green">Invite someone to join the team as staff.</p>
          </div>
          <Button type="button" onClick={() => { setFailure(null); setInviteOpen(true); }}>
            Invite a member
          </Button>
        </div>

        {failure && !inviteOpen && <div className="mt-4"><Alert tone="error" focus>{failure}</Alert></div>}
        {invited && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-soft-mint px-3.5 py-3 text-sm text-deep-green">
            <Link2 className="size-4" aria-hidden="true" />
            <span className="break-all">Register link: {invited}</span>
          </p>
        )}
        {invited && <p className="mt-3 text-xs text-medium-green">There is no mail server in this prototype. Share the registration link above with the invited person.</p>}
      </section>

      <Dialog open={inviteOpen} onOpenChange={(open) => {
        if (form.formState.isSubmitting) return;
        setInviteOpen(open);
        if (!open) { form.reset(); setFailure(null); }
      }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a staff member</DialogTitle>
            <DialogDescription>
              The invitation creates a staff account. Administrator rights can be granted later from the accounts table.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={form.handleSubmit((values) => void invite(values), focusFirstError)} className="space-y-4">
            <Field label="Email address" id="invite-email" error={form.formState.errors.email?.message}>
              <TextInput id="invite-email" type="email" autoComplete="off" placeholder="colleague@example.com"
                error={Boolean(form.formState.errors.email)} {...form.register("email")} />
            </Field>
            <Field label="Works at" id="invite-desk" hint="Leave empty for any desk.">
              <Select
                id="invite-desk"
                value={form.watch("desk_id") || ANY_DESK}
                onValueChange={(v) => form.setValue("desk_id", v === ANY_DESK ? "" : v)}
              >
                <SelectItem value={ANY_DESK}>Any desk</SelectItem>
                {(desks.data?.desks ?? []).map((desk) => (
                  <SelectItem key={desk.desk_id} value={String(desk.desk_id)}>
                    {desk.name} · {desk.service_letter}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            {failure && <Alert tone="error" focus>{failure}</Alert>}
            <p className="text-xs text-medium-green">This prototype has no mail server. You can copy the registration link after creating the invitation.</p>
            <DialogFooter>
              <Button type="button" variant="quiet" disabled={form.formState.isSubmitting}
                onClick={() => { form.reset(); setFailure(null); setInviteOpen(false); }}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <section className="rounded-2xl bg-white p-5">
        <h2 ref={accountsHeading} tabIndex={-1} className="text-lg font-semibold text-deep-green">Accounts</h2>
        <p className="mt-1 text-xs text-medium-green">
          Switch an account off to block access without deleting it. Deleting an account is permanent;
          its activity history remains. You cannot delete yourself or remove the last administrator.
        </p>
        {error && <p className="mt-2 text-sm text-danger">{error.message}</p>}
        {!data && !error && <p className="mt-2 text-sm text-medium-green">Loading accounts…</p>}

        {data && (
          <>
          {selected.length > 0 && (
            <div role="group" aria-label="Selected account actions" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-soft-mint p-3">
              <strong className="mr-auto text-sm text-deep-green" aria-live="polite">{selected.length} selected</strong>
              <Button type="button" variant="quiet" disabled={bulkBusy} onClick={() => void applyBulk("activate")}>Switch on</Button>
              <Button type="button" variant="quiet" disabled={bulkBusy} onClick={() => void applyBulk("deactivate")}>Switch off</Button>
              <Button type="button" variant="danger-quiet" disabled={bulkBusy}
                onClick={() => { setBulkConfirm(""); setBulkError(null); setBulkOpen(true); }}>
                Delete selected
              </Button>
              <Button type="button" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds([])}>Clear</Button>
            </div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label="Team accounts">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-medium-green uppercase">
                  <th scope="col" className="w-10 py-2 pr-3">
                    <input ref={selectAllRef} type="checkbox" aria-label="Select all accounts except yours"
                      checked={allSelected} disabled={eligible.length === 0 || bulkBusy}
                      onChange={(event) => { setOpenMenu(null); setSelectedIds(event.target.checked ? eligible.map((user) => user.user_id) : []); }}
                      className="size-4 cursor-pointer accent-deep-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green" />
                  </th>
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Email</th>
                  <th className="py-2 pr-4 font-semibold">Role</th>
                  <th className="py-2 pr-4 font-semibold">Desk</th>
                  <th className="py-2 pr-4 font-semibold">Last sign in</th>
                  <th className="py-2 pr-4 font-semibold">State</th>
                  <th className="py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.user_id} className={`border-b border-line/60 last:border-0 ${selectedIds.includes(user.user_id) ? "bg-soft-mint/60" : ""}`}>
                    <td className="py-3 pr-3">
                      <input type="checkbox" aria-label={`Select ${user.full_name} (${user.email})`}
                        checked={selectedIds.includes(user.user_id)}
                        disabled={user.user_id === account?.user_id || bulkBusy}
                        onChange={(event) => toggleSelection(user.user_id, event.target.checked)}
                        className="size-4 cursor-pointer accent-deep-green disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green" />
                    </td>
                    <td className="py-3 pr-4 font-medium text-deep-green">{user.full_name}</td>
                    <td className="py-3 pr-4 text-medium-green">{user.email}</td>
                    <td className="py-3 pr-4">
                      <span className={user.role === "admin" ? "font-semibold text-deep-green" : "text-medium-green"}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-medium-green">
                      {user.desk_id
                        ? (desks.data?.desks ?? []).find((d) => d.desk_id === user.desk_id)?.name ?? `Desk ${user.desk_id}`
                        : "Any desk"}
                    </td>
                    <td className="py-3 pr-4 text-medium-green">{relative(user.last_login_at)}</td>
                    <td className="py-3 pr-4">
                      <span className={user.is_active ? "text-medium-green" : "text-danger"}>
                        {user.is_active ? "in use" : "switched off"}
                      </span>
                    </td>
                    <td className="py-3">
                      {user.user_id === account?.user_id ? (
                        <span className="text-xs text-medium-green">this is you</span>
                      ) : (
                        <Popover open={openMenu === user.user_id} onOpenChange={(open) => setOpenMenu(open ? user.user_id : null)}>
                          <PopoverTrigger asChild>
                            <button type="button" aria-label={`More actions for ${user.full_name}`} disabled={busyId === user.user_id || bulkBusy || selected.length > 0}
                              className="inline-flex size-9 items-center justify-center rounded-lg text-deep-green hover:bg-soft-mint focus-visible:outline-2 focus-visible:outline-deep-green disabled:opacity-50">
                              <MoreVertical size={18} aria-hidden="true" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-52 p-1" aria-label={`Actions for ${user.full_name}`}>
                            <button type="button" onClick={() => { setOpenMenu(null); void switchAccount(user, !user.is_active); }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-deep-green hover:bg-soft-mint">
                              {user.is_active ? "Switch off" : "Switch on"}
                            </button>
                            <button type="button" onClick={() => { setOpenMenu(null); void moveRole(user.user_id, user.role === "admin" ? "staff" : "admin"); }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-deep-green hover:bg-soft-mint">
                              {user.role === "admin" ? "Make staff" : "Make administrator"}
                            </button>
                            <div className="my-1 border-t border-line" />
                            <button type="button" onClick={() => { setOpenMenu(null); setDeleting(user); setConfirmEmail(""); setDeleteError(null); }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft">
                              Delete account
                            </button>
                          </PopoverContent>
                        </Popover>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
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

      <Dialog open={deleting !== null} onOpenChange={(open) => {
        if (deletingBusy) return;
        if (!open) { setDeleting(null); setConfirmEmail(""); setDeleteError(null); }
      }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md" onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This permanently removes {deleting?.full_name}&apos;s account and sign-in access.
              Password reset links stop working. Ticket and activity history remain. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }} className="space-y-4">
            <Field label={`Type ${deleting?.email ?? "the account email"} to confirm`} id="delete-account-email">
              <TextInput id="delete-account-email" type="email" autoComplete="off"
                value={confirmEmail} placeholder={deleting?.email ?? "account@example.com"}
                onChange={(event) => setConfirmEmail(event.target.value)} />
            </Field>
            {deleteError && <Alert tone="error" focus>{deleteError}</Alert>}
            <DialogFooter>
              <Button type="button" variant="quiet" disabled={deletingBusy}
                onClick={() => { setDeleting(null); setConfirmEmail(""); setDeleteError(null); }}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={deletingBusy || confirmEmail.trim().toLowerCase() !== deleting?.email.toLowerCase()}>
                {deletingBusy ? "Deleting…" : "Delete account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={(open) => {
        if (bulkBusy) return;
        setBulkOpen(open);
        if (!open) { setBulkConfirm(""); setBulkError(null); }
      }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md"
          onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Delete {selected.length} {selected.length === 1 ? "account" : "accounts"}?</DialogTitle>
            <DialogDescription>
              These accounts and their reset links will be permanently removed. Ticket and activity history remain. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line p-3 text-sm text-deep-green" aria-label="Accounts to delete">
            {selected.map((user) => <li key={user.user_id} className="break-all">{user.full_name} · {user.email}</li>)}
          </ul>
          <form onSubmit={(event) => { event.preventDefault(); void applyBulk("delete"); }} className="space-y-4">
            <Field label={`Type DELETE ${selected.length} to confirm`} id="bulk-delete-confirm">
              <TextInput id="bulk-delete-confirm" value={bulkConfirm} autoComplete="off"
                placeholder={`DELETE ${selected.length}`}
                onChange={(event) => setBulkConfirm(event.target.value)} />
            </Field>
            {bulkError && <Alert tone="error" focus>{bulkError}</Alert>}
            <DialogFooter>
              <Button type="button" variant="quiet" disabled={bulkBusy} onClick={() => { setBulkOpen(false); setBulkConfirm(""); setBulkError(null); }}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={bulkBusy || selected.length === 0 || bulkConfirm !== `DELETE ${selected.length}`}>
                {bulkBusy ? "Deleting…" : `Delete ${selected.length} ${selected.length === 1 ? "account" : "accounts"}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
