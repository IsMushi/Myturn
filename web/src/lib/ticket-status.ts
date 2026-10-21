import {
  BellRing,
  CheckCircle2,
  Clock,
  PhoneMissed,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { TicketStatus } from "./types";

/**
 * How each state of a ticket is described to the visitor.
 *
 * The stored states are the ones the database uses. The words here are the
 * ones a visitor reads: "skipped" is what the desk calls a no-show, and the
 * visitor is told plainly that the turn was missed.
 *
 * Every state carries an icon and a word as well as a colour, so the state is
 * still clear to somebody who cannot tell amber from lime.
 */
export type StatusTone = "waiting" | "called" | "done" | "missed" | "cancelled";

export interface StatusStyle {
  /** Short word for a badge: Waiting, Your turn, Served, Missed, Cancelled. */
  label: string;
  headline: string;
  detail: string;
  tone: StatusTone;
  icon: LucideIcon;
}

export const TICKET_STATUS: Record<TicketStatus, StatusStyle> = {
  waiting: {
    label: "Waiting",
    headline: "You are in the queue",
    detail: "Stay nearby, or keep this page open. It updates on its own.",
    tone: "waiting",
    icon: Clock,
  },
  called: {
    label: "Your turn",
    headline: "It's Your Turn!",
    detail: "Please proceed to the service desk.",
    tone: "called",
    icon: BellRing,
  },
  completed: {
    label: "Served",
    headline: "You have been served",
    detail: "Thank you. You can close this page.",
    tone: "done",
    icon: CheckCircle2,
  },
  skipped: {
    label: "Missed",
    headline: "Your number was called",
    detail:
      "Nobody came to the desk, so the turn has passed. Please take a fresh ticket.",
    tone: "missed",
    icon: PhoneMissed,
  },
  cancelled: {
    label: "Cancelled",
    headline: "This ticket was cancelled",
    detail: "The desk closed the ticket. Please take a fresh ticket if you still need help.",
    tone: "cancelled",
    icon: XCircle,
  },
};

export const TONE_STYLES: Record<StatusTone, string> = {
  waiting: "bg-soft-mint text-deep-green ring-line",
  called: "bg-primary text-ink ring-medium-green",
  done: "bg-soft-mint text-deep-green ring-line",
  missed: "bg-amber-100 text-amber-900 ring-amber-300",
  cancelled: "bg-rose-100 text-rose-800 ring-rose-300",
};

/** True once the desk has finished with a ticket and will not change it again. */
export function isFinished(status: TicketStatus): boolean {
  return status === "completed" || status === "skipped" || status === "cancelled";
}
