import type {
  Account,
  AccountEvent,
  AccountsListing,
  AccountWork,
  ActivityFeed,
  AdminDesk,
  AdminDeskList,
  AdminDevice,
  AdminDeviceList,
  DeskList,
  DeviceRegistration,
  PublicState,
  Role,
  ServiceList,
  ServiceProfile,
  ServiceState,
  ServicesListing,
  SessionInfo,
  SignedIn,
  StaffAction,
  StaffQueue,
  Stats,
  TicketCreated,
  TicketSearch,
  TicketsList,
  TicketState,
} from "./types";

/**
 * Where the browser keeps its own random visitor id. It is not an account and
 * carries nothing about the person: it only lets the server recognise that the
 * same browser has already taken a ticket.
 */
const VISITOR_ID_KEY = "myturn.visitor.id";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The token that rides on the session cookie.
 *
 * Every request that changes something has to carry it, and only the page that
 * owns the session can read it, which is what stops another site from using the
 * cookie on the visitor's behalf. It is held in memory rather than in
 * localStorage, and comes back with each sign in and with /api/auth/me.
 */
let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

type Method = "GET" | "POST" | "DELETE";

async function request<T>(
  path: string,
  { method = "GET", body }: { method?: Method; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrfToken && method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      typeof data.error === "string" ? data.error : `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return data as T;
}

/** Requests a layer that answers with more than the JSON body. */
export const api = {
  // ---- visitors ---------------------------------------------------------
  /** The services this office offers, each with its own queue. */
  services: () => request<ServicesListing>("/api/services"),

  /**
   * A per-browser visitor id, used only to recognise a repeat tap (VIS-10,
   * QUE-19).
   *
   * It is random and kept on the device rather than derived from the hardware.
   * A user-agent hash is shared by two people holding the same phone model,
   * which would hand one visitor the other's ticket; a random id cannot. A
   * browser that refuses storage falls back to the hash, which only groups a
   * repeat tap and is never worse than not asking at all.
   */
  _getBrowserFingerprint(): string {
    if (typeof window === "undefined") return "";
    try {
      const saved = window.localStorage.getItem(VISITOR_ID_KEY);
      if (saved) return saved;
      const id =
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID().replace(/-/g, "").slice(0, 24)
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(VISITOR_ID_KEY, id);
      return id;
    } catch {
      // Storage refused: fall through to the hash below.
    }
    const parts = [
      navigator.userAgent || "",
      navigator.language || "",
      screen.width + "x" + screen.height,
      new Date().getTimezoneOffset(),
    ];
    // Simple hash: not cryptographic, just enough to identify the same browser
    const str = parts.join("|");
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  createTicket: (options: { service?: string; source?: string; contact?: string } = {}) =>
    request<TicketCreated>("/api/tickets", {
      method: "POST",
      body: {
        source: options.source ?? "qr",
        service: options.service,
        // The contact is optional and is what lets the desk reach the visitor.
        contact: options.contact,
        browser_fingerprint: api._getBrowserFingerprint(),
      },
    }),

  ticketState: (token: string) =>
    request<TicketState>(`/api/tickets/${encodeURIComponent(token)}`),

  giveUpTicket: (token: string) =>
    request<TicketState>(`/api/tickets/${encodeURIComponent(token)}/give-up`, { method: "POST" }),

  postNotice: (message: string) =>
    request<{ ok: boolean }>("/api/auth/notices", { method: "POST", body: { message } }),

  publicState: () => request<PublicState>("/api/public/state"),

  /**
   * The stream the browser listens to instead of asking on a timer.
   *
   * With a token the same connection also carries that ticket, so a visitor's
   * page needs one socket to follow both their number and the desk around it.
   */
  eventsUrl: (token?: string | null) =>
    token ? `/api/events?ticket=${encodeURIComponent(token)}` : "/api/events",

  // ---- accounts ---------------------------------------------------------
  /** Who this browser is signed in as. Answers 401 when nobody is. */
  async me(): Promise<SessionInfo | null> {
    try {
      const info = await request<SessionInfo>("/api/auth/me");
      setCsrfToken(info.csrf_token);
      return info;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async login(email: string, password: string): Promise<SignedIn> {
    const result = await request<SignedIn>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setCsrfToken(result.csrf_token);
    return result;
  },

  async logout(): Promise<void> {
    await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    setCsrfToken(null);
  },

  /**
   * The shared classroom password.
   *
   * The second way in: one password opens the desk for whoever is on the
   * shared demonstration device, without an account and without a name. The
   * session it starts is a staff session, so it reaches the queue and nothing
   * else.
   */
  staffLogin: (name: string, password: string) =>
    request<{ staff: string; csrf_token: string }>("/api/staff/login", {
      method: "POST",
      body: { name, password },
    }).then((result) => {
      setCsrfToken(result.csrf_token);
      return result;
    }),

  invitation: (token: string) =>
    request<{ email: string; role: Role; accepted: boolean; expires_at?: string }>(
      `/api/auth/invitation?token=${encodeURIComponent(token)}`,
    ),

  register: (values: {
    token: string;
    full_name: string;
    password: string;
    confirm_password: string;
  }) =>
    request<SignedIn>("/api/auth/register", { method: "POST", body: values }).then((result) => {
      setCsrfToken(result.csrf_token);
      return result;
    }),

  /**
   * Asks for a reset link.
   *
   * The answer is the same whether or not the address has an account, so the
   * page cannot be used to find out who works here. While the prototype has no
   * mail server, the API returns the link itself and this is what the page shows.
   */
  forgotPassword: (email: string) =>
    request<{ message: string; reset_path?: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
    }),

  resetPassword: (values: { token: string; password: string; confirm_password: string }) =>
    request<{ message: string }>("/api/auth/reset-password", { method: "POST", body: values }),

  // ---- administrator ----------------------------------------------------
  accounts: () => request<AccountsListing>("/api/auth/users"),

  invite: (email: string, deskId?: number | null) =>
    request<{
      email: string;
      role: Role;
      replaced: boolean;
      expires_in_hours: number;
      email_queued: boolean;
      register_path: string;
      register_url: string;
    }>("/api/auth/invitations", { method: "POST", body: { email, role: "staff", desk_id: deskId ?? null } }),

  revokeInvitation: (invitationId: number) =>
    request<{ revoked: number; email: string }>(
      `/api/auth/invitations/${invitationId}/revoke`,
      { method: "POST" },
    ),

  setAccountActive: (userId: number, isActive: boolean) =>
    request<{ user_id: number; is_active: boolean }>(`/api/auth/users/${userId}/active`, {
      method: "POST",
      body: { is_active: isActive },
    }),

  deleteAccount: (userId: number, confirmEmail: string) =>
    request<{ deleted: number; email: string }>(`/api/auth/users/${userId}`, {
      method: "DELETE",
      body: { confirm_email: confirmEmail },
    }),

  batchAccounts: (
    action: "activate" | "deactivate" | "delete",
    accounts: Pick<Account, "user_id" | "email">[],
    confirmation?: string,
  ) => request<{ action: string; selected: number; changed: number }>("/api/auth/users/batch", {
    method: "POST",
    body: { action, accounts, ...(confirmation ? { confirmation } : {}) },
  }),

  /**
   * Hands administrator rights out, or takes them back.
   *
   * The server refuses to leave the installation without an administrator, so a
   * failure here is a real answer rather than a lost click.
   */
  setAccountRole: (userId: number, role: Role) =>
    request<{ user: { user_id: number; role: Role } }>(`/api/auth/users/${userId}/role`, {
      method: "POST",
      body: { role },
    }),

  activity: (limit = 60) => request<ActivityFeed>(`/api/auth/activity?limit=${limit}`),

  /** Every service, including one that has been switched off. */
  serviceList: () => request<ServiceList>("/api/auth/services"),

  /** Adds a service to the office. The letter is the ticket prefix. */
  createService: (values: {
    letter?: string;
    name: string;
    description: string;
    target_seconds?: number | null;
  }) => request<{ service: ServiceProfile }>("/api/auth/services", { method: "POST", body: values }),

  /** Changes one service's words, target or availability. */
  updateService: (
    serviceId: number,
    values: {
      name: string;
      description: string;
      target_seconds?: number | null;
      is_active?: boolean;
    },
  ) =>
    request<{ service: ServiceProfile }>(`/api/auth/services/${serviceId}`, {
      method: "POST",
      body: values,
    }),

  /** Permanently removes a service that has never been used. */
  deleteService: (serviceId: number, confirm: string) =>
    request<{ deleted: number; letter: string; name: string }>(
      `/api/auth/services/${serviceId}`,
      { method: "DELETE", body: { confirm } },
    ),

  /** Every counter, including a retired one. */
  deskList: () => request<AdminDeskList>("/api/auth/desks"),

  /** Adds a counter and points it at one service. */
  createDesk: (values: { name: string; service: string }) =>
    request<{ desk: AdminDesk }>("/api/auth/desks", { method: "POST", body: values }),

  /** Renames a counter, points it at another service, or retires it. */
  updateDesk: (
    deskId: number,
    values: { name: string; service: string; is_active?: boolean },
  ) =>
    request<{ desk: AdminDesk }>(`/api/auth/desks/${deskId}`, { method: "POST", body: values }),

  /** Permanently removes a desk that has never been used. */
  deleteDesk: (deskId: number, confirm: string) =>
    request<{ deleted: number; name: string }>(`/api/auth/desks/${deskId}`, {
      method: "DELETE",
      body: { confirm },
    }),

  /** Clears every queue, counter and reading; keeps accounts and settings. */
  resetOffice: (confirm: string) =>
    request<{ reset: boolean }>("/api/auth/office/reset", {
      method: "POST",
      body: { confirm },
    }),

  /** Every sensor board, with the counter each one watches. */
  deviceList: () => request<AdminDeviceList>("/api/auth/devices"),

  /** Registers a board. The key in the reply is the only copy of it. */
  registerDevice: (values: { label: string; desk_id: number | null }) =>
    request<DeviceRegistration>("/api/auth/devices", { method: "POST", body: values }),

  /** Points one board at a counter, or takes it off every counter. */
  assignDevice: (deviceId: number, deskId: number | null) =>
    request<{ device: AdminDevice }>(`/api/auth/devices/${deviceId}`, {
      method: "POST",
      body: { desk_id: deskId },
    }),

  /** Gives a board a new key; the one it was using stops working. */
  replaceDeviceKey: (deviceId: number) =>
    request<DeviceRegistration>(`/api/auth/devices/${deviceId}/key`, { method: "POST" }),

  /** Takes a board out of service, with the readings it took. */
  retireDevice: (deviceId: number) =>
    request<{ ok: boolean }>(`/api/auth/devices/${deviceId}`, { method: "DELETE" }),

  /**
   * The office's figures. `service` narrows them to one waiting list, and the
   * period narrows them to a stretch of Kigali days — empty means all of it.
   */
  stats: (options: {
    service?: string;
    days?: number | null;
    from?: string;
    to?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (options.service) qs.set("service", options.service);
    // One period or the other: a custom range is more specific than a length, so
    // it wins rather than being mixed into a range nobody asked for.
    if (options.from && options.to) {
      qs.set("from", options.from);
      qs.set("to", options.to);
    } else if (options.days) {
      qs.set("days", String(options.days));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<Stats>(`/api/auth/stats${suffix}`);
  },

  /** The address the browser downloads the day's tickets from. */
  ticketsCsvUrl: "/api/auth/tickets.csv",

  /** All tickets, paginated, with optional filters. */
  ticketsList: (params?: { service?: string; status?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.service) qs.set("service", params.service);
    if (params?.status) qs.set("status", params.status);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<TicketsList>(`/api/auth/tickets${suffix}`);
  },

  changePassword: (values: {
    current_password: string;
    password: string;
    confirm_password: string;
  }) => request<{ message: string }>("/api/auth/password", { method: "POST", body: values }),

  /** The name on the account, corrected by the person it belongs to. */
  updateProfile: (values: { full_name: string; email?: string; current_password?: string }) =>
    request<{ user: Account; message: string }>("/api/auth/profile", {
      method: "POST",
      body: values,
    }),

  /** What has happened to this account, newest first. */
  accountHistory: () => request<{ entries: AccountEvent[] }>("/api/auth/account/history"),

  /** The decisions this person made at the counter, newest first. */
  accountWork: () => request<{ entries: AccountWork[] }>("/api/auth/account/work"),

  // ---- the desk ---------------------------------------------------------
  /** Every counter, so the dashboard can ask which one this is. */
  desks: () => request<DeskList>("/api/staff/desks"),

  /** One counter's queue: its waiting line, its call, its board. */
  queue: (
    deskId?: number,
    range?: { days: number | null } | { from: string; to: string },
  ) => {
    const params = new URLSearchParams();
    if (deskId !== undefined) params.set("desk", String(deskId));
    if (range) {
      // A custom range is the one carrying explicit dates; everything else is
      // a day count. Checking for the dates rather than a `days` key keeps a
      // custom range from being mistaken for a count.
      if ("from" in range && "to" in range) {
        params.set("from", range.from);
        params.set("to", range.to);
      } else if (range.days !== null) {
        params.set("days", String(range.days));
      }
    }
    const query = params.toString();
    return request<StaffQueue>(query ? `/api/staff/queue?${query}` : "/api/staff/queue");
  },

  callNext: (deskId: number) =>
    request<{ ticket_no: number; label: string; ticket_id: number }>("/api/staff/call-next", {
      method: "POST",
      body: { desk: deskId },
    }),

  /**
   * Find one of this service's tickets by number. A bare number matches as a
   * prefix; the letter is accepted and must be the desk's own.
   */
  searchTickets: (deskId: number, query: string) => {
    const params = new URLSearchParams({ desk: String(deskId), q: query });
    // The route wraps its answer in `data`; the caller wants the answer itself.
    return request<{ data: TicketSearch }>(`/api/staff/tickets/search?${params.toString()}`)
      .then((result) => result.data);
  },

  /** Call a chosen waiting ticket, under the same rules as call-next. */
  callTicket: (deskId: number, ticketId: number) =>
    request<{ ticket_no: number; label: string; ticket_id: number }>("/api/staff/call", {
      method: "POST",
      body: { desk: deskId, ticket_id: ticketId },
    }),

  ticketAction: (ticketId: number, action: StaffAction) =>
    request<{ ticket_no: number; status: string }>(`/api/staff/tickets/${ticketId}/action`, {
      method: "POST",
      body: { action },
    }),

  /** Announces the current number again and restarts its hold time. */
  recall: (ticketId: number) =>
    request<{ ticket_no: number; status: string }>(`/api/staff/tickets/${ticketId}/recall`, {
      method: "POST",
    }),

  /** Takes back the last decision, while the desk has not moved on. */
  undo: (ticketId: number) =>
    request<{ ticket_no: number; status: string }>(`/api/staff/tickets/${ticketId}/undo`, {
      method: "POST",
    }),

  /** A ticket for somebody standing at the desk without a phone. */
  walkIn: (deskId: number) =>
    request<{ ticket_no: number; label: string; token: string; source: string; created_at: string }>(
      "/api/staff/tickets",
      { method: "POST", body: { desk: deskId } },
    ),

  /**
   * Opens, pauses or closes one counter.
   *
   * A pause may carry the desk's own note and how long it expects to be away.
   * Nothing is filled in on the desk's behalf: an empty note and no return
   * time are both valid, and neither is replaced by a guess.
   */
  setService: (
    deskId: number,
    serviceState: ServiceState,
    options: { pauseReason?: string; pauseMinutes?: number } = {},
  ) =>
    request<{
      service_state: ServiceState;
      pause_reason: string | null;
      paused_until: string | null;
    }>("/api/staff/service", {
      method: "POST",
      body: {
        service_state: serviceState,
        desk: deskId,
        pause_reason: serviceState === "paused" ? (options.pauseReason ?? "") : "",
        pause_minutes: serviceState === "paused" ? (options.pauseMinutes ?? null) : null,
      },
    }),
};
