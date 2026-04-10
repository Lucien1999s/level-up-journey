import { getSessionEmail } from "./auth";
import type {
  AccountSessionResponse,
  ActionLogResponse,
  Badge,
  Domain,
  JourneyDataResponse,
  PathRecord,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionEmail = getSessionEmail();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(sessionEmail ? { "X-User-Email": sessionEmail } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = (await response.json()) as { detail?: string };
      message = payload.detail ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchPaths() {
  return request<JourneyDataResponse>("/paths");
}

export function registerAccount(payload: { email: string; password: string }) {
  return request<AccountSessionResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginAccount(payload: { email: string; password: string }) {
  return request<AccountSessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAccount(payload: {
  current_email: string;
  current_password: string;
  new_email: string;
}) {
  return request<AccountSessionResponse>("/auth/account", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updatePassword(payload: {
  email: string;
  current_password: string;
  new_password: string;
}) {
  return request<AccountSessionResponse>("/auth/password", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createPath(payload: {
  route_name: string;
  current_status: string;
  past_achievements: string;
  lang: string;
}) {
  return request<PathRecord>("/paths/initialize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function processActionLog(payload: { action_log: string; lang: string }) {
  return request<ActionLogResponse>("/action-logs/process", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePath(pathId: number) {
  return request<void>(`/paths/${pathId}`, { method: "DELETE" });
}

export function openPath(pathId: number) {
  return request<void>(`/paths/${pathId}/open`, { method: "POST" });
}

export function addDomain(
  pathId: number,
  payload: {
    name: string;
    summary: string;
    proficiency_rating: string;
    proficiency_reason: string;
  },
) {
  return request<Domain>(`/paths/${pathId}/domains`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDomain(
  domainId: number,
  payload: {
    name?: string;
    summary?: string;
    proficiency_rating?: string;
    proficiency_reason?: string;
  },
) {
  return request<Domain>(`/domains/${domainId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteDomain(domainId: number) {
  return request<void>(`/domains/${domainId}`, { method: "DELETE" });
}

export function addBadge(
  pathId: number,
  payload: {
    name: string;
    type: string;
    tier?: string;
    progress: number;
    reason: string;
  },
) {
  return request<Badge>(`/paths/${pathId}/badges`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBadge(
  badgeId: number,
  payload: {
    name?: string;
    type?: string;
    tier?: string;
    progress?: number;
    reason?: string;
  },
) {
  return request<Badge>(`/badges/${badgeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteBadge(badgeId: number) {
  return request<void>(`/badges/${badgeId}`, { method: "DELETE" });
}
