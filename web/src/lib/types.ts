export type ServiceState = "active" | "paused" | "closed";

export type TicketStatus = "waiting" | "called" | "completed" | "skipped" | "cancelled";

export type StaffAction = "complete" | "skip" | "cancel";

/** Who an account belongs to. A visitor never has one. */
export type Role = "admin" | "staff";

/** A staff or administrator account, as the API describes it. */
export interface Account {
  user_id: number;
  full_name: string;
  email: string;
  role: Role;
  desk_id: number | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

/** What GET /api/auth/me returns. */
export interface SessionInfo {
  user?: Account;
  staff?: string;
  shared: boolean;
  csrf_token: string;
  /** The active administrator a staff member can ask about an address change. */
  administrator?: {
    full_name: string;
    email: string;
  } | null;
}

/** What a successful sign in returns. */
export interface SignedIn {
  user: Account;
  csrf_token: string;
  redirect: string;
}

export interface InvitationSummary {
  invitation_id: number;
  email: string;
  role: Role;
  created_at: string;
  expires_at: string;
}

/** What GET /api/auth/users returns, for the administrator. */
export interface AccountsListing {
  users: Account[];
  invitations: InvitationSummary[];
}

/** One line of the account's own history: what has happened to it. */
export interface AccountEvent {
  event: string;
  at: string;
  actor: string;
  detail: string | null;
}

/** One decision the person made at the counter. */
export interface AccountWork {
  event: string;
  at: string;
  ticket_no: string;
  label: string;
  detail: string | null;
}

/** The editable description of a desk, from the older /api/auth/desk route. */
export interface DeskProfile {
  name: string;
  description: string;
  /** A service-time promise in seconds, or null when the desk sets none. */
  target_seconds: number | null;
  updated_at: string | null;
  updated_by: string;
}

export interface DeskProfileResponse {
  profile: DeskProfile;
}

/** One number being called at a counter. */
export interface ServiceCall {
  ticket_no: number;
  /** The number as it is shown and spoken: A003. */
  label: string;
  /** The counter serving it, or null when it is not known. */
  desk: string | null;
  called_at: string | null;
}

/** One service the office offers, as GET /api/services reports it. */
export interface Service {
  /** The ticket letter, A, B or C. */
  id: string;
  letter: string;
  name: string;
  description: string;
  /** False only when every desk of the service is closed. */
  available: boolean;
  service_state: ServiceState;
  /** How many visitors are waiting for this service. */
  waiting: number;
  /**
   * The next numbers this queue will call, in order.
   *
   * Bounded by the server: a long queue is a count, not a list that grows
   * without end on a screen meant to be read from across a room.
   */
  waiting_labels: string[];
  /** The numbers being called at this service's desks right now. */
  now_serving: ServiceCall[];
  target_seconds: number | null;
  /** Seconds this service usually takes, or null when there is not enough history. */
  average_service_seconds: number | null;
  service_samples: number;
}

export interface ServicesListing {
  services: Service[];
  single_desk: boolean;
  server_time: string;
}

/** What POST /api/tickets returns. */
export interface TicketCreated {
  ticket_no: number;
  /** The number as it is shown: A003. */
  label: string;
  ahead: number;
  /** The next few numbers ahead of this one, so the visitor sees the line. */
  ahead_labels: string[];
  token: string;
  service_state: ServiceState;
  service: Service;
  /** The contact the visitor left (required: email OR phone, not both). */
  contact: string;
  created_at: string;
  /**
   * True when this browser already had a ticket waiting and the server
   * returned that one instead of issuing a new number (VIS-10, QUE-19).
   */
  duplicate?: boolean;
}

/** What GET /api/tickets/<token> returns. */
export interface TicketState {
  ticket_no: number;
  /** The number as it is shown: A003. */
  label: string;
  status: TicketStatus;
  ahead: number;
  /** The next few numbers ahead of this one, so the visitor sees the line. */
  ahead_labels: string[];
  created_at: string;
  called_at: string | null;
  closed_at: string | null;
  /** The counter serving this ticket, when it has been called. */
  desk: string | null;
  /** The contact the visitor left (required: email OR phone, not both). */
  contact: string;
  /**
   * The last time the hold rule moved this ticket to the back of the queue.
   * The number above is the new one; this says it changed.
   */
  last_requeue: TicketRequeue | null;
  service_state: ServiceState;
  service: Service;
  server_time: string;
}

/** A ticket that missed its call and was given a fresh number. */
export interface TicketRequeue {
  /** When the requeue happened. */
  at: string;
  /** The number that was given up, when the event recorded it. */
  previous_label: string | null;
}

/** What GET /api/public/state returns. */
export interface PublicState {
  /** Every service the office offers, each with its own queue. */
  services: Service[];
  called_no: number | null;
  called_at: string | null;
  /** Visitors waiting across the whole office. */
  waiting: number;
  service_state: ServiceState;
  /** Seconds the desk usually takes, or null when there is not enough history. */
  average_service_seconds: number | null;
  service_samples: number;
  server_time: string;
  /** Latest administrator notice shown on the wall display. */
  notice: { message: string } | null;
  /** Numbers called but not answered, shown in red for a few seconds. */
  missed?: string[];
}

export interface QueueTicket {
  ticket_id: number;
  ticket_no: number;
  /** The number as it is shown: A003. */
  label: string;
  created_at: string;
  /**
   * A phone number or email the visitor left, so the desk can reach them.
   * Only the desk sees it; the wall display never carries it.
   */
  contact: string;
}

/** One ticket as the desk's search finds it, today or still waiting. */
export interface TicketSearchResult {
  ticket_id: number;
  ticket_no: number;
  label: string;
  status: TicketStatus;
  created_at: string;
  called_at: string | null;
  closed_at: string | null;
  /** The counter holding or serving it; null while it waits. */
  desk_name: string | null;
}

export interface TicketsList {
  tickets: Array<{
    ticket_id: number;
    ticket_no: number;
    label: string;
    service: string;
    service_name: string;
    status: string;
    source: string;
    contact: string | null;
    desk_id: number | null;
    desk_name: string | null;
    created_at: string;
    called_at: string | null;
    closed_at: string | null;
    service_seconds: number | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface TicketSearch {
  query: string;
  service: { id: string; name: string };
  today: string;
  tickets: TicketSearchResult[];
}

export interface DeviceInfo {
  label: string;
  chip_id: string | null;
  mac_address: string | null;
  last_seen: string | null;
  online: boolean;
  distance_cm: number | null;
  occupied: boolean;
  led_state: string | null;
  reported_at: string | null;
  approach: boolean;
  /**
   * True when the board reads the counter as occupied but the server is treating
   * what is there as a still object rather than a visitor, so calling is allowed.
   */
  obstruction: boolean;
  /** How long an object must sit still before the server writes it off. */
  obstruction_seconds: number | null;
}

/** One counter, as GET /api/staff/desks reports it. */
export interface DeskSummary {
  desk_id: number;
  name: string;
  is_active: boolean;
  service_id: number;
  service_letter: string;
  service_name: string;
  service_state: ServiceState;
  /**
   * The desk's own words while it is paused: why, and when it expects to be
   * back. Both are written by the person at the desk, never inferred, and
   * either may be null.
   */
  pause_reason: string | null;
  paused_until: string | null;
  waiting: number;
  device_online: boolean;
}

export interface DeskList {
  desks: DeskSummary[];
  server_time: string;
}

/** What GET /api/staff/queue returns. */
export interface StaffQueue {
  /** The counter this queue belongs to. */
  desk: DeskSummary;
  /** The service that counter serves. */
  service: Service;
  service_state: ServiceState;
  service_updated_by: string | null;
  service_updated_at: string | null;
  waiting: number;
  queue: QueueTicket[];
  called: (QueueTicket & { called_at: string | null }) | null;
  hold_seconds: number;
  /** What the hold really is now: the board may shorten it while the counter is empty. */
  effective_hold_seconds: number;
  hold_shortened: boolean;
  /** Why the hold is what it is, in the desk's words. Null when nobody is called. */
  hold_reason: string | null;
  /** How long a mistake may be taken back, in seconds. */
  undo_seconds: number;
  seconds_called: number | null;
  hold_remaining: number | null;
  /** What this session has worked through since midnight. */
  tally: { actor: string | null; served: number; no_shows: number };
  /**
   * The two dashboard charts. Counted over this desk's service only, so a
   * staff session can read them without administrator rights.
   */
  charts: {
    outcomes: { served: number; no_shows: number; cancelled: number; waiting: number };
    /** Oldest first, one row per date in the range, quiet days included. */
    per_day: { day: string; issued: number; served: number }[];
    /** What `per_day` actually covers, so the chart can label itself. */
    range: { days: number; from: string; to: string };
  };
  /** What the desk usually takes, measured over served tickets. */
  average_service_seconds: number | null;
  service_samples: number;
  device: DeviceInfo | null;
  server_time: string;
}

/** A service as the administrator edits it. */
export interface ServiceProfile {
  service_id: number;
  id: string;
  letter: string;
  name: string;
  description: string;
  target_seconds: number | null;
  is_active: boolean;
  updated_at: string | null;
  updated_by: string;
  desk_count: number;
  service_state: ServiceState;
  waiting: number;
}

export interface ServiceList {
  services: ServiceProfile[];
  server_time: string;
}

/** A counter as the administrator edits it. */
export interface AdminDesk {
  desk_id: number;
  name: string;
  is_active: boolean;
  service_id: number;
  service_letter: string;
  service_name: string;
  service_state: ServiceState;
  waiting: number;
  device_online: boolean;
  /** The board watching this counter, or null when none is assigned to it. */
  device_label: string | null;
  /** The counter's own words while it is paused: why, and until when. */
  pause_reason: string | null;
  paused_until: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface AdminDeskList {
  desks: AdminDesk[];
  server_time: string;
}

/**
 * A sensor board and the one counter it watches.
 *
 * The office owns one board and several counters, so this is the movable
 * binding: pointing the board somewhere else takes it off the counter it was
 * on, and that counter keeps working without it.
 */
export interface AdminDevice {
  device_id: number;
  label: string;
  chip_id: string | null;
  mac_address: string | null;
  last_seen: string | null;
  online: boolean;
  desk_id: number | null;
  desk_name: string | null;
  service_letter: string | null;
  service_name: string | null;
}

export interface AdminDeviceList {
  devices: AdminDevice[];
  server_time: string;
}

/**
 * A board that has just been registered, with its key.
 *
 * The API stores only the digest, so this reply is the one chance to write the
 * key down: the page shows it before it lets the administrator do anything else.
 */
export interface DeviceRegistration {
  device: AdminDevice;
  device_key: string;
}

/**
 * One line of the account history.
 *
 * The queue, the desk and the accounts each keep their own record; the activity
 * page reads all three back in one order, so it shows what happened rather than
 * only what is true now.
 */
export interface ActivityEntry {
  kind: "ticket" | "desk" | "account";
  event: string;
  at: string;
  actor: string;
  ticket_no: number | null;
  /** The number as it was shown: A003. */
  label: string | null;
  /** The service the entry belongs to. */
  service: string | null;
  /** The counter the entry belongs to. */
  desk: string | null;
  email: string | null;
  detail: string | null;
}

export interface ActivityFeed {
  entries: ActivityEntry[];
  server_time: string;
}

/** What GET /api/auth/stats returns. */
export interface Stats {
  /** The period counted, as Kigali days. Null ends mean "all of history". */
  window: { from: string | null; to: string | null; days: number | null };
  /** The filter that was applied, so the page can tell stale figures from fresh. */
  filter: { service: string | null };
  totals: {
    issued: number;
    served: number;
    no_shows: number;
    cancelled: number;
    waiting: number;
    /** Served + no-shows + cancelled: the tickets that are no longer waiting. */
    decided: number;
    /** Turns given back to the queue after a call nobody answered. */
    requeued: number;
    /** Served and no-show shares, both taken over `decided`, never over `issued`. */
    served_percent: number;
    no_show_percent: number;
  };
  /** How long visitors stood in line, measured from taking a number to being called. */
  wait: {
    average_seconds: number | null;
    median_seconds: number | null;
    samples: number;
    histogram: { label: string; count: number }[];
    /** Wait plus service: what a visitor actually spent in the office. */
    average_total_seconds: number | null;
  };
  per_day: { day: string; issued: number; served: number }[];
  hours: { hour: number; issued: number }[];
  histogram: { label: string; count: number }[];
  median_service_seconds: number | null;
  average_service_seconds: number | null;
  service_samples: number;
  /** Each service's own figures, so the queues can be compared. */
  per_service: {
    id: string;
    letter: string;
    name: string;
    is_active: boolean;
    issued: number;
    served: number;
    no_shows: number;
    waiting: number;
    decided: number;
    served_percent: number;
    no_show_percent: number;
    average_wait_seconds: number | null;
    wait_samples: number;
    average_service_seconds: number | null;
    service_samples: number;
    target_seconds: number | null;
    within_target_percent: number | null;
  }[];
  /** Each counter, because a counter is where a service actually happens. */
  per_desk: {
    id: number;
    name: string;
    letter: string;
    service_name: string;
    issued: number;
    served: number;
    waiting: number;
    decided: number;
    average_wait_seconds: number | null;
    wait_samples: number;
    average_service_seconds: number | null;
    service_samples: number;
  }[];
  /** The service the figures describe, or null when they cover the office. */
  service: { id: string; letter: string; name: string } | null;
  /** The name the desk uses for itself, and the target it has set. */
  desk_name: string;
  target_seconds: number | null;
  /** Share of measured tickets closed within the target, or null without one. */
  within_target_percent: number | null;
  server_time: string;
}
