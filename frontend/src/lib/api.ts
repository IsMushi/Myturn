import type {
  PublicState,
  ServiceState,
  StaffAction,
  StaffQueue,
  TicketCreated,
  TicketState,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
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

export const api = {
  createTicket: (source = "qr") =>
    request<TicketCreated>("/api/tickets", {
      method: "POST",
      body: JSON.stringify({ source }),
    }),

  ticketState: (token: string) =>
    request<TicketState>(`/api/tickets/${encodeURIComponent(token)}`),

  publicState: () => request<PublicState>("/api/public/state"),

  login: (name: string, password: string) =>
    request<{ staff: string }>("/api/staff/login", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    }),

  logout: () => request<{ ok: boolean }>("/api/staff/logout", { method: "POST" }),

  queue: () => request<StaffQueue>("/api/staff/queue"),

  callNext: () => request<{ ticket_no: number }>("/api/staff/call-next", { method: "POST" }),

  ticketAction: (ticketId: number, action: StaffAction) =>
    request<{ ticket_no: number; status: string }>(`/api/staff/tickets/${ticketId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  setService: (serviceState: ServiceState) =>
    request<{ service_state: ServiceState }>("/api/staff/service", {
      method: "POST",
      body: JSON.stringify({ service_state: serviceState }),
    }),
};
