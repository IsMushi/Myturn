"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";

import { clockTime } from "@/lib/format";

/** One outage notification, not another toast for every failed poll or timer tick. */
export function QueueConnectionToast({ interrupted, accessDenied, lastConfirmedAt, reconnect }: {
  interrupted: boolean;
  accessDenied: boolean;
  lastConfirmedAt: number;
  reconnect: () => Promise<void>;
}) {
  const id = useId();
  const router = useRouter();
  const reconnectRef = useRef(reconnect);
  const confirmedAt = accessDenied ? 0 : lastConfirmedAt;

  useEffect(() => { reconnectRef.current = reconnect; }, [reconnect]);

  useEffect(() => {
    if (!interrupted) return;

    toast.error(accessDenied ? "Your access needs attention" : "Live updates are interrupted", {
      id,
      testId: "queue-connection-toast",
      position: "bottom-right",
      duration: Infinity,
      dismissible: false,
      closeButton: false,
      description: accessDenied
        ? "Sign in again. Your session may have expired or your permissions may have changed."
        : `Last confirmed waiting list: ${clockTime(new Date(confirmedAt).toISOString())}. Actions are paused until updates recover.`,
      action: {
        label: accessDenied ? "Sign in" : "Reconnect",
        onClick: (event) => {
          // Sonner otherwise dismisses a toast as soon as its action is clicked.
          // Keep the warning until a successful refresh actually restores trust.
          event.preventDefault();
          if (accessDenied) router.push("/auth/login?next=/staff/dashboard");
          else void reconnectRef.current();
        },
      },
      actionButtonStyle: { minHeight: 44 },
    });

    // Recovery, desk changes and navigation remove only this desk's notification.
    return () => { toast.dismiss(id); };
  }, [interrupted, accessDenied, confirmedAt, router, id]);

  return null;
}
