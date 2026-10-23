import { ShieldCheck } from "lucide-react";

import { QueueStatusSkeleton } from "./QueueStatusCard";
import { TicketStep } from "./TicketRequestForm";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same intro, columns, service choices, status rows and form as /ticket. */
export function TicketRequestSkeleton() {
  return (
    <div className="space-y-8 myturn-ticket-request-skeleton" aria-busy="true" data-testid="ticket-request-skeleton">
      <p className="sr-only" role="status">Loading ticket services and live queue information…</p>
      <header className="myturn-ticket-intro" aria-hidden="true">
        <div>
          <p className="myturn-ticket-kicker"><span>A little less waiting around</span></p>
          <h1 className="text-3xl font-semibold tracking-tight text-deep-green sm:text-4xl"><span>Get Your Queue Ticket</span></h1>
          <p className="mt-3 text-base leading-relaxed text-deep-green"><span>Join the queue in seconds and follow your turn without standing in line.</span></p>
        </div>
        <Skeleton className="h-10 w-32 shrink-0 rounded-full" />
      </header>
      <div className="myturn-ticket-request-grid">
        <div className="myturn-ticket-selection">
          <TicketStep number={1} title="Select your service">
            <p className="mb-5 text-sm leading-relaxed text-deep-green">Choose what you came for. Each service has its own queue.</p>
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <div key={index} className="myturn-ticket-service-card flex items-start gap-4 rounded-2xl border border-line bg-white p-5">
                  <Skeleton className="size-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <Skeleton className="h-6 w-40 max-w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-28 max-w-full" />
                  </div>
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                </div>
              ))}
            </div>
          </TicketStep>
          <p className="myturn-ticket-privacy"><ShieldCheck size={19} aria-hidden="true" /><span>Your ticket is private. No name or account is needed — a phone number or email is required, and only the desk sees it.</span></p>
        </div>
        <div className="myturn-ticket-summary">
          <TicketStep number={2} title="Queue information"><QueueStatusSkeleton /></TicketStep>
          <TicketStep number={3} title="Get my ticket">
            <div className="space-y-4" aria-hidden="true">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="h-10 w-full rounded-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-14 w-full rounded-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </TicketStep>
        </div>
      </div>
    </div>
  );
}
