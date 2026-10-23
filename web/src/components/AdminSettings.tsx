"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Save, Store } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { DeskStateBadge } from "@/components/DeskStateBadge";
import { Button } from "@/components/ui/Button";
import { Alert, Field, Select, SelectItem, TextInput, inputClass } from "@/components/ui/Field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { formatDuration, plural, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { AdminDesk, ServiceProfile } from "@/lib/types";
import { deskSettingsSchema, type DeskSettingsValues } from "@/lib/validation";

/**
 * The office describing itself: the services it offers and the desks that
 * serve them.
 *
 * Both are read back as lists, so every queue and every counter is on the page
 * at once rather than behind a picker. The forms that change them — add and
 * edit, for each — open in dialogs of their own, so the page stays a list
 * instead of carrying four forms nobody is filling in.
 *
 * A service is a queue with a name, a sentence a visitor can read and an
 * optional target time. A desk is a counter that serves one service. The
 * letter of a service is the prefix of its ticket numbers, so it cannot be
 * changed once the service is in use.
 *
 * The target is a promise, not a measurement. The statistics page reports how
 * often it was actually met, so it cannot quietly become a claim.
 */
export function AdminSettings() {
  const loadServices = useCallback(async () => (await api.serviceList()).services, []);
  const loadDesks = useCallback(async () => (await api.deskList()).desks, []);
  const services = usePolling<ServiceProfile[]>(loadServices, 30000);
  const desks = usePolling<AdminDesk[]>(loadDesks, 30000);
  // A service or desk edited on another console should show up here at once.
  useLiveRefresh(() => {
    void services.refresh();
    void desks.refresh();
  }, 30000);

  const [saved, setSaved] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<ServiceProfile | null>(null);
  const [addingService, setAddingService] = useState(false);
  const [editingDesk, setEditingDesk] = useState<AdminDesk | null>(null);
  const [addingDesk, setAddingDesk] = useState(false);

  const list = services.data;

  if (!list) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Desk settings</h1>
        {services.error ? (
          <Alert tone="error" focus>{services.error.message}</Alert>
        ) : (
          <p className="text-sm text-medium-green">Loading the desk settings…</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Desk settings</h1>
        <p className="mt-1 text-sm text-medium-green">
          What the ticket page and the wall display say about this office. Changes apply
          immediately, without restarting the server.
        </p>
      </div>

      {saved && (
        <div className="max-w-xl">
          <Alert tone="success">{saved}</Alert>
        </div>
      )}

      <section className="rounded-2xl bg-white p-5" aria-labelledby="services-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="services-title" className="flex items-center gap-2 text-lg font-semibold text-deep-green">
              <Store className="size-5" aria-hidden="true" />
              The services on offer
            </h2>
            <p className="mt-1 text-sm text-medium-green">
              Every queue the office runs, with the letter its tickets carry.
            </p>
          </div>
          <Button onClick={() => setAddingService(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add service
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {list.map((service) => (
            <ServiceRow key={service.service_id} service={service} onEdit={setEditingService} />
          ))}
        </ul>
        {list.length === 0 && (
          <p className="mt-4 text-sm text-medium-green">
            No services are offered yet. Add the first one to open a queue.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5" aria-labelledby="desks-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="desks-title" className="text-lg font-semibold text-deep-green">The desks</h2>
            <p className="mt-1 text-sm text-medium-green">
              A desk serves one service. Two desks may serve the same service, and each of them can
              call a number of its own.
            </p>
          </div>
          <Button variant="quiet" onClick={() => setAddingDesk(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add desk
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-line">
          {(desks.data ?? []).map((desk) => (
            <DeskRow key={desk.desk_id} desk={desk} onEdit={setEditingDesk} />
          ))}
        </ul>
        {(desks.data ?? []).length === 0 && (
          <p className="mt-4 text-sm text-medium-green">
            No desks are configured yet. Add one and point it at a service.
          </p>
        )}
      </section>

      <Dialog open={editingService !== null} onOpenChange={(open) => { if (!open) setEditingService(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          {editingService && (
            <ServiceForm
              key={editingService.service_id}
              service={editingService}
              onClose={() => setEditingService(null)}
              onSaved={(message) => {
                setEditingService(null);
                setSaved(message);
                void services.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addingService} onOpenChange={setAddingService}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AddServiceForm
            onClose={() => setAddingService(false)}
            onSaved={(message) => {
              setAddingService(false);
              setSaved(message);
              void services.reload();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editingDesk !== null} onOpenChange={(open) => { if (!open) setEditingDesk(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          {editingDesk && (
            <DeskForm
              key={editingDesk.desk_id}
              desk={editingDesk}
              services={list}
              onClose={() => setEditingDesk(null)}
              onSaved={(message) => {
                setEditingDesk(null);
                setSaved(message);
                void desks.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addingDesk} onOpenChange={setAddingDesk}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AddDeskForm
            services={list}
            onClose={() => setAddingDesk(false)}
            onSaved={(message) => {
              setAddingDesk(false);
              setSaved(message);
              void desks.reload();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One service in the list: its words, its state and the way to edit it. */
function ServiceRow({
  service,
  onEdit,
}: {
  service: ServiceProfile;
  onEdit: (service: ServiceProfile) => void;
}) {
  return (
    <li className="flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-soft-mint text-lg font-bold text-deep-green"
        aria-hidden="true"
      >
        {service.letter}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-deep-green">{service.name}</h3>
          {service.is_active ? (
            <DeskStateBadge state={service.service_state} />
          ) : (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800 ring-1 ring-rose-300">
              Switched off
            </span>
          )}
          {service.waiting > 0 && (
            <span className="rounded-full bg-soft-mint px-3 py-1 text-sm font-semibold text-deep-green">
              {service.waiting} waiting
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-medium-green">{service.description}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-medium-green">
          <span>Tickets numbered {service.letter}001…</span>
          <span>
            {service.target_seconds === null
              ? "No target set"
              : `Target ${formatDuration(service.target_seconds)}`}
          </span>
          <span>{plural(service.desk_count, "desk")}</span>
          <span>Changed by {service.updated_by}, {relative(service.updated_at)}</span>
        </p>
      </div>
      <Button variant="quiet" onClick={() => onEdit(service)}>
        <Pencil className="size-4" aria-hidden="true" />
        Edit<span className="sr-only"> {service.name}</span>
      </Button>
    </li>
  );
}

/** One desk in the list: what it serves, how it stands, and the way to edit it. */
function DeskRow({
  desk,
  onEdit,
}: {
  desk: AdminDesk;
  onEdit: (desk: AdminDesk) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-deep-green">{desk.name}</h3>
          {!desk.is_active && (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800 ring-1 ring-rose-300">
              Retired
            </span>
          )}
          <DeskStateBadge state={desk.service_state} />
        </div>
        <p className="mt-1 text-sm text-medium-green">
          Serves <span className="font-semibold text-deep-green">
            {desk.service_letter} · {desk.service_name}
          </span>
          {desk.waiting > 0 ? ` · ${desk.waiting} waiting` : ""}
        </p>
        <p className="mt-1 text-xs text-medium-green">
          {desk.device_online ? "Board online" : "No board"}
          {desk.updated_at
            ? ` · last state change by ${desk.updated_by}, ${relative(desk.updated_at)}`
            : ""}
        </p>
      </div>
      <Button variant="quiet" onClick={() => onEdit(desk)}>
        <Pencil className="size-4" aria-hidden="true" />
        Edit<span className="sr-only"> {desk.name}</span>
      </Button>
    </li>
  );
}

/**
 * The wording of one service, as a dialog.
 *
 * The form is mounted afresh for each service, so what is in the boxes is
 * always the service that is being edited. A failure from the server stays in
 * the dialog, beside the fields it refused.
 */
function ServiceForm({
  service,
  onClose,
  onSaved,
}: {
  service: ServiceProfile;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<DeskSettingsValues>({
    resolver: zodResolver(deskSettingsSchema),
    defaultValues: {
      name: service.name,
      description: service.description,
      target_minutes:
        service.target_seconds === null ? "" : String(service.target_seconds / 60),
    },
  });

  async function submit(values: DeskSettingsValues) {
    setServerError(null);
    const minutes = values.target_minutes === "" ? null : Number(values.target_minutes);
    try {
      await api.updateService(service.service_id, {
        name: values.name.trim(),
        description: values.description.trim(),
        target_seconds: minutes === null ? null : Math.round(minutes * 60),
        is_active: service.is_active,
      });
      onSaved("Saved. Visitors see the new wording the next time their page updates.");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "The settings could not be saved");
    }
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => void submit(values), focusFirstError)}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Edit {service.name}</DialogTitle>
        <DialogDescription>
          Its tickets are numbered {service.letter}001, {service.letter}002 and so on; the letter
          cannot be changed once the service is in use.
        </DialogDescription>
      </DialogHeader>

      <Field label="Service name" id="name" error={form.formState.errors.name?.message}>
        <TextInput
          id="name"
          maxLength={60}
          placeholder="e.g. Registration"
          error={Boolean(form.formState.errors.name)}
          {...form.register("name")}
        />
      </Field>

      <Field
        label="What this service handles"
        id="description"
        error={form.formState.errors.description?.message}
        hint="One sentence, shown under the service name."
      >
        <textarea
          id="description"
          rows={3}
          maxLength={160}
          placeholder="e.g. New student registration and course changes"
          aria-invalid={Boolean(form.formState.errors.description) || undefined}
          aria-describedby={
            form.formState.errors.description ? "description-error" : undefined
          }
          className={`${inputClass} rounded-2xl`}
          {...form.register("description")}
        />
      </Field>

      <Field
        label="Target service time in minutes"
        id="target_minutes"
        error={form.formState.errors.target_minutes?.message}
        hint="Optional. The statistics page reports how often a served ticket met it."
      >
        <TextInput
          id="target_minutes"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0.5"
          max="240"
          placeholder="No target"
          error={Boolean(form.formState.errors.target_minutes)}
          {...form.register("target_minutes")}
        />
      </Field>

      {serverError && <Alert tone="error" focus>{serverError}</Alert>}

      <DialogFooter>
        <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Save className="size-4" aria-hidden="true" />
          {form.formState.isSubmitting ? "Saving…" : "Save desk settings"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adding a service: the letter is optional and the server picks the next free one. */
function AddServiceForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [letter, setLetter] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createService({
        letter: letter.trim() || undefined,
        name: name.trim(),
        description: description.trim(),
      });
      onSaved(`Saved. ${result.service.name} is now on offer.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The service could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length >= 2 && !busy) void submit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Add a service</DialogTitle>
        <DialogDescription>
          A new queue with its own letter. Leave the letter empty and the next free one is used.
        </DialogDescription>
      </DialogHeader>

      <Field label="Ticket letter" id="new-service-letter" hint="Optional. A to Z.">
        <TextInput
          id="new-service-letter"
          maxLength={1}
          value={letter}
          placeholder="Next free letter"
          onChange={(event) => setLetter(event.target.value.toUpperCase())}
        />
      </Field>

      <Field label="Service name" id="new-service-name">
        <TextInput
          id="new-service-name"
          maxLength={60}
          value={name}
          placeholder="e.g. Finance"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="What it handles" id="new-service-description">
        <textarea
          id="new-service-description"
          rows={2}
          maxLength={160}
          className={`${inputClass} rounded-2xl`}
          value={description}
          placeholder="e.g. Fees, receipts and refunds"
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      {error && <Alert tone="error" focus>{error}</Alert>}

      <DialogFooter>
        <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || name.trim().length < 2}>Add service</Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A desk's own fields: its name, the service it serves and whether it is in
 * use. The same form serves adding and editing, driven by the `desk` prop.
 */
function DeskForm({
  desk,
  services,
  onClose,
  onSaved,
}: {
  desk: AdminDesk;
  services: ServiceProfile[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(desk.name);
  const [service, setService] = useState(desk.service_letter);
  const [isActive, setIsActive] = useState(desk.is_active);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.updateDesk(desk.desk_id, { name: name.trim(), service, is_active: isActive });
      onSaved("Saved. The desk is changed.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The desk could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length >= 2 && !busy) void submit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Edit {desk.name}</DialogTitle>
        <DialogDescription>
          A desk serves exactly one service. Retiring it keeps its record and takes it out of the
          office.
        </DialogDescription>
      </DialogHeader>

      <Field label="Name" id={`desk-name-${desk.desk_id}`}>
        <TextInput
          id={`desk-name-${desk.desk_id}`}
          value={name}
          maxLength={60}
          placeholder="e.g. Desk 1"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Serves" id={`desk-service-${desk.desk_id}`}>
        <Select
          id={`desk-service-${desk.desk_id}`}
          value={service}
          onValueChange={setService}
          className={inputClass}
        >
          {services.map((option) => (
            <SelectItem key={option.service_id} value={option.letter}>
              {option.letter} · {option.name}
            </SelectItem>
          ))}
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-sm text-medium-green">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        In use
      </label>

      {error && <Alert tone="error" focus>{error}</Alert>}

      <DialogFooter>
        <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || name.trim().length < 2}>Save desk</Button>
      </DialogFooter>
    </form>
  );
}

/** Adding a desk and pointing it at one service. It starts paused. */
function AddDeskForm({
  services,
  onClose,
  onSaved,
}: {
  services: ServiceProfile[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [service, setService] = useState(services[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.createDesk({ name: name.trim(), service: service || services[0]?.id || "" });
      onSaved("Saved. The new desk is paused until somebody opens it.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The desk could not be added");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length >= 2 && !busy) void submit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>Add a desk</DialogTitle>
        <DialogDescription>
          A new service point. It serves one service and starts paused until somebody opens it.
        </DialogDescription>
      </DialogHeader>

      <Field label="Desk name" id="new-desk-name">
        <TextInput
          id="new-desk-name"
          value={name}
          maxLength={60}
          placeholder="Desk 4"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Serves" id="new-desk-service">
        <Select
          id="new-desk-service"
          value={service}
          onValueChange={setService}
          className={inputClass}
        >
          {services.map((option) => (
            <SelectItem key={option.service_id} value={option.id}>
              {option.letter} · {option.name}
            </SelectItem>
          ))}
        </Select>
      </Field>

      {error && <Alert tone="error" focus>{error}</Alert>}

      <DialogFooter>
        <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || name.trim().length < 2}>Add desk</Button>
      </DialogFooter>
    </form>
  );
}
