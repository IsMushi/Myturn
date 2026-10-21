"use client";

import { WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ServiceStatusPill } from "@/components/ticket/ServiceStatusPill";
import { TicketConfirmation } from "@/components/ticket/TicketConfirmation";
import { TicketRequestForm } from "@/components/ticket/TicketRequestForm";
import { TicketTrackingStatus } from "@/components/ticket/TicketTrackingStatus";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Field";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { isFinished } from "@/lib/ticket-status";
import { useLive } from "@/lib/useLive";
import { usePolling } from "@/lib/usePolling";
import { useMounted, useTicketToken } from "@/lib/useTicketToken";
import type { PublicState, TicketCreated, TicketState } from "@/lib/types";

/** What one frame of the queue stream carries. */
interface QueueFrame {
  state: PublicState;
  ticket: TicketState | null;
}

/** Used only if the stream cannot be opened; normally updates arrive pushed. */
const LIVE_FALLBACK_INTERVAL_MS = 3000;
/** The service list changes when the desk is reconfigured, which is rare. */
const SERVICES_INTERVAL_MS = 30000;

/**
 * A ticket the desk is finished with will not change again, so the page stops
 * asking about it. Defined once, so the polling hook sees the same function on
 * every render and does not restart on its own.
 */
function handled(ticket: TicketState | null): boolean {
  return ticket !== null && isFinished(ticket.status);
}

/**
 * The visitor's whole experience: take a number, keep it, follow it.
 *
 * The ticket lives on the visitor's own phone, so the page works whether they
 * scanned the code at the door and took a number here, or opened a link to a
 * ticket they already hold. Nothing is asked of them but which service they
 * need; no account and no name. A phone number or email is optional, and is
 * only there so the desk can reach them if they step away.
 */
export function TicketView({ initialToken }: { initialToken?: string }) {
  const router = useRouter();
  const [storedToken, setStoredToken] = useTicketToken();
  const mounted = useMounted();

  const [chosen, setChosen] = useState<string | null>(null);
  const [justIssued, setJustIssued] = useState<TicketCreated | null>(null);
  const [trackUrl, setTrackUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // A second click cannot slip through between the state update and the
  // request, which is what stops two tickets being issued for one tap.
  const inFlight = useRef(false);

  const token = initialToken ?? storedToken;

  // A ticket opened from a link is kept on this phone as well, so the visitor
  // can close the page and come back to it.
  useEffect(() => {
    if (initialToken && initialToken !== storedToken) setStoredToken(initialToken);
  }, [initialToken, storedToken, setStoredToken]);

  // The service list changes only when the desk is reconfigured, which is rare,
  // so it stays a plain periodic request.
  const services = usePolling(api.services, SERVICES_INTERVAL_MS);

  // The desk and the visitor's own ticket arrive down one stream, so the two
  // can never disagree with each other the way two separate timers can.
  const loadFrame = useCallback(async (): Promise<QueueFrame> => {
    const state = await api.publicState();
    const ticket = token ? await api.ticketState(token) : null;
    return { state, ticket };
  }, [token]);

  const live = useLive<QueueFrame>({
    url: api.eventsUrl(token),
    event: "queue",
    select: (payload) => {
      const frame = payload as { state: PublicState; ticket: TicketState | null };
      return { state: frame.state, ticket: frame.ticket };
    },
    load: loadFrame,
    intervalMs: LIVE_FALLBACK_INTERVAL_MS,
    // A ticket the desk is finished with will not change again.
    stopWhen: (frame) => handled(frame.ticket),
  });

  const publicState = live.data?.state ?? null;
  const ticketData = live.data?.ticket ?? null;

  /**
   * The ticket to show: the freshest answer from the server, or the one just
   * issued while that answer is still on its way.
   */
  const issuedState: TicketState | null = justIssued
    ? {
        ticket_no: justIssued.ticket_no,
        label: justIssued.label,
        status: "waiting",
        ahead: justIssued.ahead,
        ahead_labels: justIssued.ahead_labels,
        created_at: justIssued.created_at,
        called_at: null,
        closed_at: null,
        desk: null,
        service_state: justIssued.service_state,
        service: justIssued.service,
        contact: justIssued.contact,
        server_time: justIssued.created_at,
      }
    : null;

  const ticket: TicketState | null =
    justIssued && (!ticketData || ticketData.ticket_no !== justIssued.ticket_no)
      ? issuedState
      : ticketData;

  const serviceList = services.data?.services ?? [];

  // The first service is the one a visitor gets by default, so the office's
  // main queue is the one they land on. The live state is preferred over the
  // catalogue, because it is pushed the moment a desk opens or closes.
  const serviceId = chosen ?? serviceList[0]?.id ?? null;
  const chosenService =
    publicState?.services.find((service) => service.id === serviceId) ??
    serviceList.find((service) => service.id === serviceId) ??
    null;
  const deskLoading = !live.data && !live.error;

  async function takeTicket(contact = "") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setCreateError(null);
    try {
      const created = await api.createTicket({
        service: serviceId ?? undefined,
        source: "qr",
        contact: contact.trim() || undefined,
      });
      
      // Handle duplicate ticket detection (VIS-10, QUE-19)
      if ((created as any).duplicate) {
        // User already has an active ticket - redirect to their existing one immediately
        setStoredToken(created.token);
        setTrackUrl(`${window.location.origin}/ticket/${created.token}`);
        router.push(`/ticket/${created.token}`);
        return;
      }
      
      setStoredToken(created.token);
      setJustIssued(created);
      setTrackUrl(`${window.location.origin}/ticket/${created.token}`);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "The ticket could not be issued just now.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function forget() {
    setStoredToken(null);
    setJustIssued(null);
    setTrackUrl("");
    // Opened from a link, the address keeps the ticket alive, so the page has
    // to go back to the plain one for the ticket to be really let go of.
    if (initialToken) router.replace("/ticket");
  }

  // The first render has to match the one the server sent, and the server
  // cannot read this phone's storage, so the ticket is looked for after that.
  if (!mounted) return <TicketSkeleton />;

  // Nothing else on the page can be trusted if the service list cannot be read.
  if (!services.data && services.error) {
    return (
      <Unreachable
        message={services.error.message}
        onRetry={() => {
          services.reload();
          live.reload();
        }}
      />
    );
  }

  if (token) {
    const trackHref = trackUrl || `/ticket/${encodeURIComponent(token)}`;

    // The ticket has just been handed over: it is shown as a ticket, with the
    // code for another device. It stops being a confirmation as soon as the
    // desk calls the number, because then there is something to do.
    if (justIssued && ticket && ticket.status === "waiting") {
      return (
        <TicketConfirmation
          label={ticket.label}
          status={ticket.status}
          ahead={ticket.ahead}
          serviceName={ticket.service?.name ?? "Service desk"}
          deskState={ticket.service_state}
          issuedAt={ticket.created_at}
          trackUrl={trackHref}
          onAnother={() => void takeTicket()}
          onForget={forget}
          busy={busy}
        />
      );
    }

    return (
      <TicketTrackingStatus
        ticket={ticket}
        state={publicState}
        loading={!ticket && !live.error}
        stateLoading={deskLoading}
        error={
          live.error
            ? {
                message: live.error.message,
                missing: live.error.status === 404,
              }
            : null
        }
        onRetry={live.reload}
        onAnother={() => void takeTicket()}
        onForget={forget}
        busy={busy}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="myturn-ticket-intro">
        <div>
          <p className="myturn-ticket-kicker">A little less waiting around</p>
          <h1 className="text-3xl font-semibold tracking-tight text-deep-green sm:text-4xl">
            Get Your Queue Ticket
          </h1>
          <p className="mt-3 text-base leading-relaxed text-deep-green">
            Join the queue in seconds and follow your turn without standing in line.
          </p>
        </div>
        <ServiceStatusPill service={chosenService} error={live.error} loading={deskLoading} />
      </header>

      {live.error && (
        <Alert tone="error">
          The live queue information could not be loaded. You can still take a ticket, but the
          numbers below may be out of date.
        </Alert>
      )}

      <TicketRequestForm
        services={serviceList}
        serviceId={serviceId}
        onServiceChange={setChosen}
        service={chosenService}
        stateLoading={deskLoading}
        onRequest={(contact) => void takeTicket(contact)}
        onCheck={live.reload}
        busy={busy}
        error={createError}
      />
    </div>
  );
}

/** The page before anything is known: the shape of what is coming. */
function TicketSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <span className="sr-only">Loading the ticket service…</span>
      <div className="space-y-4">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-5 w-full max-w-xl" />
        <Skeleton className="h-8 w-56 rounded-full" />
      </div>
      <SkeletonCard lines={2} />
      <SkeletonCard lines={4} />
    </div>
  );
}

/** The API itself is not answering. */
function Unreachable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-amber-300 bg-amber-50 p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-amber-800">
        <WifiOff className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-amber-900">
        The ticket service cannot be reached
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-amber-900">{message}</p>
      <Button variant="quiet" className="mt-5" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
