import { TICKET_STATUS, TONE_STYLES } from "@/lib/ticket-status";
import type { TicketStatus } from "@/lib/types";

/**
 * The state of a ticket, as a badge.
 *
 * The icon and the word carry the meaning; the colour only reinforces it, so
 * the badge still works for a visitor who cannot tell one shade from another.
 */
export function TicketStatusBadge({
  status,
  size = "md",
}: {
  status: TicketStatus;
  size?: "md" | "lg";
}) {
  const style = TICKET_STATUS[status];
  const Icon = style.icon;

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full font-semibold ring-1",
        TONE_STYLES[style.tone],
        size === "lg" ? "px-5 py-2 text-lg" : "px-3 py-1 text-sm",
      ].join(" ")}
    >
      <Icon className={size === "lg" ? "size-5" : "size-4"} aria-hidden="true" />
      {style.label}
    </span>
  );
}
