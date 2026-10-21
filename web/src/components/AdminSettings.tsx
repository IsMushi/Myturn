"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Store } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/Button";
import { Alert, Field, Select, SelectItem, TextInput, inputClass } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { focusFirstError } from "@/lib/forms";
import { formatDuration, relative } from "@/lib/format";
import { usePolling } from "@/lib/usePolling";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { AdminDesk, ServiceProfile } from "@/lib/types";
import { deskSettingsSchema, type DeskSettingsValues } from "@/lib/validation";

/**
 * The office describing itself: the services it offers and the desks that
 * serve them.
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

  const [selected, setSelected] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [newService, setNewService] = useState({ letter: "", name: "", description: "" });
  const [newDesk, setNewDesk] = useState({ name: "", service: "" });
  const [adding, setAdding] = useState(false);

  const list = services.data ?? [];
  const current = list.find((service) => service.service_id === selected) ?? list[0] ?? null;

  async function addService() {
    setFailure(null);
    setSaved(null);
    try {
      const result = await api.createService({
        letter: newService.letter.trim() || undefined,
        name: newService.name.trim(),
        description: newService.description.trim(),
      });
      setNewService({ letter: "", name: "", description: "" });
      await services.reload();
      setSelected(result.service.service_id);
      setSaved(`Saved. ${result.service.name} is now on offer.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The service could not be added");
    }
  }

  async function addDesk() {
    setFailure(null);
    setSaved(null);
    try {
      await api.createDesk({
        name: newDesk.name.trim(),
        service: newDesk.service || list[0]?.id || "",
      });
      setNewDesk({ name: "", service: "" });
      await desks.reload();
      setSaved("Saved. The new desk is paused until somebody opens it.");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The desk could not be added");
    }
  }

  async function saveDesk(desk: AdminDesk, name: string, service: string, isActive: boolean) {
    setFailure(null);
    setSaved(null);
    try {
      await api.updateDesk(desk.desk_id, { name, service, is_active: isActive });
      await desks.reload();
      setSaved("Saved. The desk is changed.");
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The desk could not be saved");
    }
  }

  if (!current) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight text-deep-green">Desk settings</h1>
        {failure ? (
          <Alert tone="error" focus>{failure}</Alert>
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

      <section className="rounded-2xl bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-green">
          <Store className="size-5" aria-hidden="true" />
          The services on offer
        </h2>

        <ul className="mt-3 flex flex-wrap gap-2">
          {list.map((service) => (
            <li key={service.service_id}>
              <button
                onClick={() => setSelected(service.service_id)}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm font-semibold",
                  service.service_id === current.service_id
                    ? "border-deep-green bg-soft-mint text-deep-green"
                    : "border-line bg-white text-medium-green",
                ].join(" ")}
              >
                {service.letter} · {service.name}
                {service.is_active ? "" : " (off)"}
              </button>
            </li>
          ))}
        </ul>

        {/* The form is keyed on the service, so choosing another one replaces
            the wording in the boxes with that service's own. */}
        <ServiceForm
          key={current.service_id}
          service={current}
          onSaved={(message) => {
            setFailure(null);
            setSaved(message);
            void services.reload();
          }}
          onError={(message) => {
            setSaved(null);
            setFailure(message);
          }}
        />

        {saved && (
          <div className="mt-4 max-w-xl">
            <Alert tone="success">{saved}</Alert>
          </div>
        )}
        {failure && (
          <div className="mt-4 max-w-xl">
            <Alert tone="error" focus>{failure}</Alert>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">The desks</h2>
        <p className="mt-1 text-sm text-medium-green">
          A desk serves one service. Two desks may serve the same service, and each of them can
          call a number of its own.
        </p>

        <ul className="mt-4 space-y-3">
          {(desks.data ?? []).map((desk) => (
            <DeskRow key={desk.desk_id} desk={desk} services={list} onSave={saveDesk} />
          ))}
        </ul>

        <div className="mt-5 max-w-xl space-y-3 rounded-xl bg-soft-mint p-4">
          <h3 className="text-sm font-semibold text-deep-green">Add a desk</h3>
          <div className="flex flex-wrap gap-3">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold text-medium-green uppercase">
                Desk name
              </span>
              <TextInput
                id="new-desk-name"
                value={newDesk.name}
                maxLength={60}
                placeholder="Desk 4"
                onChange={(event) => setNewDesk({ ...newDesk, name: event.target.value })}
              />
            </label>
            <div className="flex-1 text-sm">
              <label
                htmlFor="new-desk-service"
                className="mb-1 block text-xs font-semibold text-medium-green uppercase"
              >
                Serves
              </label>
              <Select
                id="new-desk-service"
                value={newDesk.service || list[0]?.id || ""}
                onValueChange={(service) => setNewDesk({ ...newDesk, service })}
                className={inputClass}
              >
                {list.map((service) => (
                  <SelectItem key={service.service_id} value={service.id}>
                    {service.letter} · {service.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>
          <Button
            type="button"
            variant="quiet"
            disabled={adding || newDesk.name.trim().length < 2}
            onClick={() => {
              setAdding(true);
              void addDesk().finally(() => setAdding(false));
            }}
          >
            Add desk
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">Add a service</h2>
        <div className="mt-3 grid max-w-xl gap-3">
          <Field label="Ticket letter" id="new-service-letter" hint="Optional. A to Z.">
            <TextInput
              id="new-service-letter"
              maxLength={1}
              value={newService.letter}
              placeholder="Next free letter"
              onChange={(event) =>
                setNewService({ ...newService, letter: event.target.value.toUpperCase() })
              }
            />
          </Field>
          <Field label="Service name" id="new-service-name">
            <TextInput
              id="new-service-name"
              maxLength={60}
              value={newService.name}
              onChange={(event) => setNewService({ ...newService, name: event.target.value })}
            />
          </Field>
          <Field label="What it handles" id="new-service-description">
            <textarea
              id="new-service-description"
              rows={2}
              maxLength={160}
              className={inputClass}
              value={newService.description}
              onChange={(event) =>
                setNewService({ ...newService, description: event.target.value })
              }
            />
          </Field>
          <Button
            type="button"
            variant="quiet"
            disabled={adding || newService.name.trim().length < 2}
            onClick={() => {
              setAdding(true);
              void addService().finally(() => setAdding(false));
            }}
          >
            Add service
          </Button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5">
        <h2 className="text-lg font-semibold text-deep-green">What is in force now</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-medium-green">Service</dt>
            <dd className="font-medium text-deep-green">
              {current.letter} · {current.name}
            </dd>
          </div>
          <div>
            <dt className="text-medium-green">Target service time</dt>
            <dd className="font-medium text-deep-green">
              {current.target_seconds === null
                ? "No target set"
                : formatDuration(current.target_seconds)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-medium-green">Description</dt>
            <dd className="text-deep-green">{current.description}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-medium-green">Last changed</dt>
            <dd className="text-deep-green">
              by {current.updated_by}, {relative(current.updated_at)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

/**
 * The wording of one service.
 *
 * The form is mounted afresh for each service, so what is in the boxes is
 * always the service that is being edited.
 */
function ServiceForm({
  service,
  onSaved,
  onError,
}: {
  service: ServiceProfile;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
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
    const minutes = values.target_minutes === "" ? null : Number(values.target_minutes);
    try {
      await api.updateService(service.service_id, {
        name: values.name.trim(),
        description: values.description.trim(),
        target_seconds: minutes === null ? null : Math.round(minutes * 60),
        is_active: service.is_active,
      });
      form.reset(values);
      onSaved("Saved. Visitors see the new wording the next time their page updates.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "The settings could not be saved");
    }
  }

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => void submit(values), focusFirstError)}
      className="mt-5 max-w-xl space-y-4"
    >
      <p className="text-sm text-medium-green">
        Editing <span className="font-semibold text-deep-green">{service.name}</span> (
        {service.letter}). Its tickets are numbered {service.letter}001, {service.letter}002 and
        so on.
      </p>

      <Field label="Service name" id="name" error={form.formState.errors.name?.message}>
        <TextInput
          id="name"
          maxLength={60}
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
          aria-invalid={Boolean(form.formState.errors.description) || undefined}
          aria-describedby={
            form.formState.errors.description ? "description-error" : undefined
          }
          className={inputClass}
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

      <Button type="submit" disabled={form.formState.isSubmitting}>
        <Save className="size-4" aria-hidden="true" />
        {form.formState.isSubmitting ? "Saving…" : "Save desk settings"}
      </Button>
    </form>
  );
}

/** One counter, with the fields that may be changed. */
function DeskRow({
  desk,
  services,
  onSave,
}: {
  desk: AdminDesk;
  services: ServiceProfile[];
  onSave: (desk: AdminDesk, name: string, service: string, isActive: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(desk.name);
  const [service, setService] = useState(desk.service_letter);
  const [isActive, setIsActive] = useState(desk.is_active);
  const [busy, setBusy] = useState(false);

  return (
    <li className="rounded-xl bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-medium-green uppercase">
            Name
          </span>
          <TextInput
            id={`desk-name-${desk.desk_id}`}
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="flex-1 text-sm">
          <label
            htmlFor={`desk-service-${desk.desk_id}`}
            className="mb-1 block text-xs font-semibold text-medium-green uppercase"
          >
            Serves
          </label>
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
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-medium-green">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          In use
        </label>
        <Button
          type="button"
          variant="quiet"
          disabled={busy || name.trim().length < 2}
          onClick={() => {
            setBusy(true);
            void onSave(desk, name.trim(), service, isActive).finally(() => setBusy(false));
          }}
        >
          Save desk
        </Button>
      </div>
      <p className="mt-2 text-xs text-medium-green">
        {desk.service_state === "active"
          ? "Open"
          : desk.service_state === "paused"
            ? "Paused"
            : "Closed"}
        {desk.waiting > 0 ? ` · ${desk.waiting} waiting` : ""}
        {desk.device_online ? " · board online" : " · no board"}
      </p>
    </li>
  );
}
