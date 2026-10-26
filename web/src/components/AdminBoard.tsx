"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Cpu, KeyRound, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, Field, Select, SelectItem, TextInput } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { relative } from "@/lib/format";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { usePolling } from "@/lib/usePolling";
import type { AdminDesk, AdminDevice, DeviceRegistration } from "@/lib/types";
import { boardSchema, type BoardValues } from "@/lib/validation";

/**
 * The sensor boards: registering one, naming the counter it watches, and
 * handing out the key it signs in with.
 *
 * A board is a piece of hardware, not a property of a counter, so it is
 * registered once and then pointed at whichever counter it is standing beside.
 * The key is the one thing that cannot be read back: only its digest is stored,
 * so the page shows it the moment it exists and can replace it afterwards.
 *
 * Nothing here makes a board measure anything. The sensors report, the server
 * decides, and a counter without a board still serves visitors.
 */
export function AdminBoard() {
  const loadBoards = useCallback(async () => (await api.deviceList()).devices, []);
  const loadDesks = useCallback(async () => (await api.deskList()).desks, []);
  const boards = usePolling<AdminDevice[]>(loadBoards, 15000);
  const desks = usePolling<AdminDesk[]>(loadDesks, 30000);
  // A board reporting, moved or retired elsewhere shows up here at once.
  useLiveRefresh(() => {
    void boards.refresh();
    void desks.refresh();
  }, 30000);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [issued, setIssued] = useState<{ label: string; key: string; replaced: boolean } | null>(
    null,
  );
  const [replacing, setReplacing] = useState<AdminDevice | null>(null);
  const [retiring, setRetiring] = useState<AdminDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const list = boards.data ?? [];
  const counters = desks.data ?? [];

  async function replaceKey() {
    if (!replacing) return;
    setBusy(true);
    try {
      const result = await api.replaceDeviceKey(replacing.device_id);
      setIssued({ label: result.device.label, key: result.device_key, replaced: true });
      toast.success(`${result.device.label} has a new key.`, { id: "board-key" });
      setReplacing(null);
      void boards.reload();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "The key could not be replaced", {
        id: "board-key",
      });
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!retiring) return;
    setBusy(true);
    try {
      await api.retireDevice(retiring.device_id);
      toast.success(`${retiring.label} is out of service.`, { id: "board-retired" });
      setRetiring(null);
      void boards.reload();
      void desks.reload();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "The board could not be removed", {
        id: "board-retired",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!boards.data) {
    return (
      <div className="space-y-5">
        {boards.error ? (
          <Alert tone="error" focus>{boards.error.message}</Alert>
        ) : (
          <p className="text-sm text-medium-green">Loading the boards…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-medium-green">
          The office&apos;s sensor boards. Each board watches one counter, reports what it measures
          there, and can be moved to another counter whenever the rig moves. Registering a board
          gives you the one key it signs in with: write it into the firmware before flashing.
        </p>
        <Button onClick={() => setRegisterOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Register a board
        </Button>
      </div>

      {issued && (
        <KeyPanel
          label={issued.label}
          value={issued.key}
          replaced={issued.replaced}
          onDone={() => setIssued(null)}
        />
      )}

      <section className="rounded-2xl bg-white p-5" aria-labelledby="boards-title">
        <h2 id="boards-title" className="text-lg font-semibold text-deep-green">
          Registered boards
        </h2>
        <p className="mt-1 text-sm text-medium-green">
          A board that is silent is either switched off or still holding a key that has been
          replaced. Its counter keeps serving visitors either way; the hold rule simply returns to
          its full length there.
        </p>

        <ul className="mt-4 divide-y divide-line">
          {list.map((board) => (
            <BoardRow
              key={board.device_id}
              board={board}
              desks={counters}
              onMoved={() => {
                void boards.reload();
                void desks.reload();
              }}
              onReplaceKey={() => setReplacing(board)}
              onRetire={() => setRetiring(board)}
            />
          ))}
        </ul>
        {list.length === 0 && (
          <p className="mt-4 text-sm text-medium-green">
            No board is registered yet. Register the first one, flash it with the key it is given,
            and it will appear here as reporting within half a minute.
          </p>
        )}
        {boards.error && <p className="mt-4 text-sm text-danger">{boards.error.message}</p>}

        <p className="mt-4 border-t border-line pt-4 text-xs text-medium-green">
          The services and the counters themselves are on{" "}
          <Link className="underline" href="/admin/settings">Desk settings</Link>.
        </p>
      </section>

      <Dialog open={registerOpen} onOpenChange={(open) => { if (!busy) setRegisterOpen(open); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          {registerOpen && (
            <RegisterForm
              desks={counters}
              boards={list}
              onCancel={() => setRegisterOpen(false)}
              onRegistered={(created) => {
                setRegisterOpen(false);
                setIssued({ label: created.device.label, key: created.device_key, replaced: false });
                void boards.reload();
                void desks.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={replacing !== null} onOpenChange={(open) => { if (!open && !busy) setReplacing(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Give {replacing?.label} a new key?</DialogTitle>
            <DialogDescription>
              The key it is using now stops working immediately, so the board will go silent until
              it is flashed with the new one. The board keeps its name and the counter it watches.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => setReplacing(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void replaceKey()}>
              {busy ? "Replacing." : "Replace the key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={retiring !== null} onOpenChange={(open) => { if (!open && !busy) setRetiring(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Take {retiring?.label} out of service?</DialogTitle>
            <DialogDescription>
              The board and the readings it took are removed. Its key stops working, and the
              counter it watched keeps serving visitors without it. This cannot be undone; the
              account history keeps a line saying it was removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="quiet" disabled={busy} onClick={() => setRetiring(null)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void retire()}
            >
              {busy ? "Removing." : "Remove the board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The key, the one time it can be read.
 *
 * Only its digest is stored, so a panel that can be dismissed without being
 * copied has to say so plainly rather than leaving a key on the page until the
 * next reload.
 */
function KeyPanel({
  label,
  value,
  replaced,
  onDone,
}: {
  label: string;
  value: string;
  replaced: boolean;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("The key is on the clipboard.", { id: "board-key-copied" });
    } catch {
      toast.error("The key could not be copied. Select it and copy it by hand.", {
        id: "board-key-copied",
      });
    }
  }

  return (
    <section
      className="rounded-2xl bg-white p-5 ring-2 ring-primary"
      aria-labelledby="board-key-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2
            id="board-key-title"
            className="flex items-center gap-2 text-lg font-semibold text-deep-green"
          >
            <KeyRound className="size-5" aria-hidden="true" />
            {replaced ? "The new key for" : "The key for"} {label}
          </h2>
          <p className="mt-1 text-sm text-medium-green">
            Put it in <code className="font-mono">firmware/myturn_desk/secrets.h</code> as{" "}
            <code className="font-mono">DEVICE_KEY</code>, then flash the board. It is shown once:
            only a digest is stored, so it can be replaced here but never read back.
          </p>
        </div>
        <Button variant="quiet" onClick={onDone}>
          <Check className="size-4" aria-hidden="true" />
          I have written it down
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-soft-mint px-4 py-3 font-mono text-sm text-deep-green">
          {value}
        </code>
        <Button variant="quiet" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy key"}
        </Button>
      </div>
    </section>
  );
}

/** Registering: a name, and the counter it will watch if that is already known. */
function RegisterForm({
  desks,
  boards,
  onCancel,
  onRegistered,
}: {
  desks: AdminDesk[];
  boards: AdminDevice[];
  onCancel: () => void;
  onRegistered: (created: DeviceRegistration) => void;
}) {
  const form = useForm<BoardValues>({
    resolver: zodResolver(boardSchema),
    defaultValues: { label: "" },
  });
  const [desk, setDesk] = useState("none");
  const [failure, setFailure] = useState<string | null>(null);

  // A counter that already has a board is not offered: two boards on one
  // counter would both report, and only one of them could be the reading the
  // queue uses.
  const taken = new Set(boards.map((board) => board.desk_id));
  const free = desks.filter((counter) => counter.is_active && !taken.has(counter.desk_id));

  async function submit(values: BoardValues) {
    setFailure(null);
    try {
      const created = await api.registerDevice({
        label: values.label,
        desk_id: desk === "none" ? null : Number(desk),
      });
      onRegistered(created);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The board could not be registered");
    }
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => void submit(values), focusFirstError)}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>Register a board</DialogTitle>
        <DialogDescription>
          Name the hardware, and choose the counter it is standing beside if you already know it.
          The key is issued once, in the reply.
        </DialogDescription>
      </DialogHeader>

      <Field label="Name" id="board-label" error={form.formState.errors.label?.message}>
        <TextInput
          id="board-label"
          autoFocus
          placeholder="Service desk 1"
          error={Boolean(form.formState.errors.label)}
          {...form.register("label")}
        />
      </Field>

      <Field
        label="Watches"
        id="board-register-desk"
        hint="A board can be pointed at another counter at any time."
      >
        <Select
          id="board-register-desk"
          value={desk}
          onValueChange={setDesk}
        >
          <SelectItem value="none">No counter yet</SelectItem>
          {free.map((counter) => (
            <SelectItem key={counter.desk_id} value={String(counter.desk_id)}>
              {counter.name} · {counter.service_letter}
            </SelectItem>
          ))}
        </Select>
      </Field>

      {free.length === 0 && (
        <p className="text-xs text-medium-green">
          Every counter already has a board. Register this one without a counter, or move a board
          off a counter first.
        </p>
      )}

      {failure && <Alert tone="error">{failure}</Alert>}

      <DialogFooter>
        <Button type="button" variant="quiet" disabled={form.formState.isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Registering." : "Register board"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * One board: what it is, what it has reported, and where it is watching.
 *
 * The select is the whole assignment. Only counters in use are offered, plus
 * the one the board is on now if it has since been retired, so the select can
 * never show a value that is not in its list.
 */
function BoardRow({
  board,
  desks,
  onMoved,
  onReplaceKey,
  onRetire,
}: {
  board: AdminDevice;
  desks: AdminDesk[];
  onMoved: () => void;
  onReplaceKey: () => void;
  onRetire: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const choices = desks.filter((desk) => desk.is_active || desk.desk_id === board.desk_id);

  async function assign(value: string) {
    const deskId = value === "none" ? null : Number(value);
    if (deskId === board.desk_id) return;

    setBusy(true);
    try {
      const result = await api.assignDevice(board.device_id, deskId);
      toast.success(
        result.device.desk_name
          ? `${result.device.label} now watches ${result.device.desk_name}.`
          : `${result.device.label} is not watching a counter.`,
        { id: "board-moved" },
      );
      onMoved();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "The board could not be moved",
        { id: "board-moved" },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-soft-mint text-deep-green"
        aria-hidden="true"
      >
        <Cpu className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-deep-green">{board.label}</h3>
          <span
            className={
              board.online
                ? "rounded-full bg-soft-mint px-3 py-1 text-sm font-semibold text-deep-green"
                : "rounded-full bg-danger-soft px-3 py-1 text-sm font-semibold text-danger ring-1 ring-danger-line"
            }
          >
            {board.online ? "Reporting" : "Silent"}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-medium-green">
          <span>{board.last_seen ? `Last report ${relative(board.last_seen)}` : "No report yet"}</span>
          {board.chip_id && <span>Chip {board.chip_id}</span>}
          {board.mac_address && <span>{board.mac_address}</span>}
          <span>
            {board.desk_name
              ? `Watching ${board.desk_name}${board.service_letter ? ` · ${board.service_letter}` : ""}`
              : "Not watching a counter"}
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="quiet" className="px-3 py-1.5 text-xs" onClick={onReplaceKey}>
            <KeyRound className="size-3.5" aria-hidden="true" />
            New key
          </Button>
          <Button type="button" variant="quiet" className="px-3 py-1.5 text-xs" onClick={onRetire}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </div>

      <div className="w-full sm:w-64">
        <Field label="Watches" id={`board-desk-${board.device_id}`}>
          <Select
            id={`board-desk-${board.device_id}`}
            value={board.desk_id === null ? "none" : String(board.desk_id)}
            onValueChange={(value) => void assign(value)}
            disabled={busy}
          >
            <SelectItem value="none">No counter</SelectItem>
            {choices.map((desk) => (
              <SelectItem key={desk.desk_id} value={String(desk.desk_id)}>
                {desk.name} · {desk.service_letter}
              </SelectItem>
            ))}
          </Select>
        </Field>
      </div>
    </li>
  );
}
