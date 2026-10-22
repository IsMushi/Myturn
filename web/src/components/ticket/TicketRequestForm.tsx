"use client";

import { ArrowRight, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { QueueClosedState } from "@/components/ticket/QueueClosedState";
import { QueueStatusCard } from "@/components/ticket/QueueStatusCard";
import { ServiceSelector } from "@/components/ticket/ServiceSelector";
import { Alert, Field, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { Service } from "@/lib/types";

/**
 * The whole request, on one page: what is on offer, what the queue looks like,
 * and the button that joins it.
 *
 * Nothing is hidden behind a second screen, so a visitor can see what they are
 * joining before they join it, and the button is the only loud thing on the
 * page.
 *
 * The queue shown is the queue of the chosen service, so a visitor waiting for
 * one service is not shown the numbers of another.
 */
export function TicketRequestForm({
  services,
  serviceId,
  onServiceChange,
  service,
  stateLoading,
  onRequest,
  onCheck,
  busy,
  error,
}: {
  services: Service[];
  serviceId: string | null;
  onServiceChange: (id: string) => void;
  /** The chosen service, as the server describes it right now. */
  service: Service | null;
  stateLoading: boolean;
  /** Receives the optional phone or email the visitor left for the desk. */
  onRequest: (contact: string) => void;
  /** Asks the server again, for a desk that has just been opened. */
  onCheck: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [contact, setContact] = useState("");
  const closed = service?.service_state === "closed";
  const paused = service?.service_state === "paused";
  const blocked = closed || !service || !service.available;

  return (
    <div className="myturn-ticket-request-grid">
      <div className="myturn-ticket-selection">
      <Step number={1} title="Select your service">
        <p className="mb-5 text-sm leading-relaxed text-deep-green">Choose what you came for. Each service has its own queue.</p>
        {services.length === 0 ? (
          <Alert tone="info">
            This office has not published a service yet. Please ask at the counter.
          </Alert>
        ) : (
          <ServiceSelector
            services={services}
            value={serviceId}
            onChange={onServiceChange}
            disabled={busy}
          />
        )}
      </Step>

      <p className="myturn-ticket-privacy"><ShieldCheck size={19} aria-hidden="true" /><span>Your ticket is private. No name or account is needed — a phone number or email is required, and only the desk sees it.</span></p>
      </div>

      <div className="myturn-ticket-summary">
      <Step number={2} title="Queue information">
        <QueueStatusCard service={service} loading={stateLoading} />
        {paused && (
          <p className="mt-3 text-sm text-medium-green">
            The desk is on a break. You can still take a ticket and keep your place.
          </p>
        )}
      </Step>

      <Step number={3} title="Get my ticket">
        {closed ? (
          <QueueClosedState
            waiting={service?.waiting ?? 0}
            serviceName={service?.name}
            onCheck={onCheck}
          />
        ) : (
          <>
            <div className="mb-4">
              <Field
                label="Phone or email (required)"
                id="ticket-contact"
                hint="Enter either your phone number or email address, but not both. So the desk can reach you when your number is called."
                error={!contact && "This is required"}
              >
                <TextInput
                  id="ticket-contact"
                  name="contact"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  maxLength={120}
                  autoComplete="email"
                  placeholder="e.g. 082 123 4567 or you@example.com"
                  required
                />
              </Field>
            </div>

            <Button
              type="button"
              size="lg"
              className="myturn-ticket-request-button w-full"
              onClick={() => onRequest(contact)}
              disabled={busy || blocked}
              aria-busy={busy}
            >
              {busy && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}
              {busy ? "Getting your ticket…" : "Get My Ticket"}
              {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
            </Button>

            {error && (
              <div className="mt-4">
                <Alert tone="error">
                  <span className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      {error} Nothing has been issued. You can try again, or ask at the counter.
                    </span>
                  </span>
                </Alert>
              </div>
            )}

            <p className="mt-4 text-sm leading-relaxed text-deep-green">
              Your ticket stays on this phone. Keep the page open to follow your place and see when you are called.
            </p>
          </>
        )}
      </Step>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="myturn-ticket-step" aria-labelledby={`step-${number}`}>
      <h2 id={`step-${number}`} className="flex items-center gap-3 text-lg font-semibold text-deep-green">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-ink">
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
