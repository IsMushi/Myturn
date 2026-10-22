"use client";

import { CheckCircle2, Circle, Users } from "lucide-react";

import { plural } from "@/lib/format";
import type { Service } from "@/lib/types";

/**
 * The services this office offers.
 *
 * The list comes from the API, never from a list written into the page. One
 * office may run several services, so each is shown as a card the visitor can
 * check, with the number of people already waiting for it.
 *
 * The cards are real radio buttons, so they can be reached with the keyboard
 * and read out by a screen reader; only their appearance is drawn by hand.
 */
export function ServiceSelector({
  services,
  value,
  onChange,
  disabled = false,
}: {
  services: Service[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Choose the service you need</legend>

      <div className="space-y-3">
        {services.map((service) => {
          const checked = value === service.id;
          const blocked = disabled || !service.available;

          return (
            <label key={service.id} className="block">
              <input
                type="radio"
                name="service"
                value={service.id}
                checked={checked}
                disabled={blocked}
                onChange={() => onChange(service.id)}
                className="peer sr-only"
              />

              <span
                className={[
                  "myturn-ticket-service-card flex cursor-pointer items-start gap-4 rounded-2xl border border-line bg-white p-5 transition",
                  "peer-checked:border-deep-green peer-checked:bg-soft-mint",
                  "peer-hover:border-medium-green",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-deep-green",
                  "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                ].join(" ")}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-deep-green text-xl font-semibold text-light-lime" aria-hidden="true">{service.letter}</span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="myturn-ticket-service-name font-semibold text-deep-green">{service.name}</span>
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-deep-green">
                    {service.description}
                  </span>
                  <span className="mt-3 flex items-center gap-1.5 text-xs text-deep-green">
                    <Users className="size-3.5" aria-hidden="true" />
                    {service.waiting === 0
                      ? "Nobody is waiting for this service"
                      : `${plural(service.waiting, "person", "people")} waiting`}
                  </span>
                  {!service.available && (
                    <span className="mt-1 block text-sm font-medium text-danger">
                      Not taking tickets at the moment
                    </span>
                  )}
                </span>
                <span className="mt-0.5 shrink-0 text-deep-green" aria-hidden="true">{checked ? <CheckCircle2 size={21} /> : <Circle size={21} />}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
