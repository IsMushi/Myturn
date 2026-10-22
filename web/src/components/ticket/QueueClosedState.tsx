"use client";

import { DoorClosed } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { plural } from "@/lib/format";

/**
 * The desk is closed.
 *
 * The queue is closed with it, so the visitor is told plainly rather than left
 * with a button that will not work. One office may run several services, so the
 * name of the closed one is given: another service may still be open.
 */
export function QueueClosedState({
  waiting,
  serviceName,
  onCheck,
  checking = false,
}: {
  waiting: number;
  /** The service that is closed, when the page knows it. */
  serviceName?: string;
  onCheck: () => void;
  checking?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-danger-line bg-danger-soft p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white text-danger">
        <DoorClosed className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-xl font-semibold text-danger">The desk is closed</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-danger">
        {serviceName ? (
          <>
            {serviceName} is not taking tickets at the moment. Please come back when the desk
            is open again
            {waiting > 0 ? `, or wait for the ${plural(waiting, "visitor")} still in the queue` : ""}
            . Another service may still be open above.
          </>
        ) : (
          <>
            Tickets are not being issued at the moment. Please come back when the desk is open
            again
            {waiting > 0 ? `, or wait for the ${plural(waiting, "visitor")} still in the queue` : ""}
            .
          </>
        )}
      </p>
      <Button
        variant="quiet"
        className="mt-5"
        onClick={onCheck}
        disabled={checking}
      >
        {checking ? "Checking…" : "Check again"}
      </Button>
    </div>
  );
}
