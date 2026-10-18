export type ServiceState = "active" | "paused" | "closed";

export type TicketStatus = "waiting" | "called" | "completed" | "skipped" | "cancelled";

export type StaffAction = "complete" | "skip" | "cancel";

/** What POST /api/tickets returns. */
export interface TicketCreated {
  ticket_no: number;
  ahead: number;
  token: string;
  service_state: ServiceState;
}

/** What GET /api/tickets/<token> returns. */
export interface TicketState {
  ticket_no: number;
  status: TicketStatus;
  ahead: number;
  created_at: string;
  called_at: string | null;
  service_state: ServiceState;
}

/** What GET /api/public/state returns. */
export interface PublicState {
  called_no: number | null;
  called_at: string | null;
  waiting: number;
  service_state: ServiceState;
  server_time: string;
}

export interface QueueTicket {
  ticket_id: number;
  ticket_no: number;
  created_at: string;
}

export interface DeviceInfo {
  label: string;
  last_seen: string | null;
  online: boolean;
  distance_cm: number | null;
  occupied: boolean;
  led_state: string | null;
  reported_at: string | null;
  approach: boolean;
}

/** What GET /api/staff/queue returns. */
export interface StaffQueue {
  service_state: ServiceState;
  service_updated_by: string | null;
  service_updated_at: string | null;
  waiting: number;
  queue: QueueTicket[];
  called: (QueueTicket & { called_at: string | null }) | null;
  hold_seconds: number;
  seconds_called: number | null;
  hold_remaining: number | null;
  device: DeviceInfo | null;
  server_time: string;
}
