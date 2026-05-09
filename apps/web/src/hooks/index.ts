import useSWR, { type SWRConfiguration } from "swr";
import { api } from "@/lib/api";
import type { IncidentDto, ServiceDto, AlertDto, WorkflowDto } from "@autoops/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PagedResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
  timestamp: string;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetcher<T>(path: string): Promise<T> {
  const res = await api.get<T>(path);
  if (res.data === undefined) throw new Error("Empty response from " + path);
  return res.data;
}

async function pagedFetcher<T>(path: string): Promise<PagedResponse<T>> {
  const raw = await api.get<T[]>(path);
  // The API returns { success, data, pagination, timestamp }
  return raw as unknown as PagedResponse<T>;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  incidents: { active: number };
  services: { total: number; operational: number; degraded: number; outage: number };
  alerts: { open: number };
  workflows: { active: number };
  recentIncidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    createdAt: string;
    service: { id: string; name: string };
  }>;
}

export function useStats(config?: SWRConfiguration) {
  return useSWR<DashboardStats>("/stats", fetcher, { refreshInterval: 30_000, ...config });
}

// ── Incidents ─────────────────────────────────────────────────────────────────

export function useIncidents(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  severity?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  qs.set("pageSize", String(params?.pageSize ?? 20));
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  return useSWR(`/incidents?${qs}`, pagedFetcher<IncidentDto>, { refreshInterval: 15_000 });
}

export function useIncident(id: string | null) {
  return useSWR<IncidentDto>(id ? `/incidents/${id}` : null, fetcher);
}

// ── Services ──────────────────────────────────────────────────────────────────

export function useServices(params?: { page?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.status) qs.set("status", params.status);
  return useSWR(`/services?${qs}`, pagedFetcher<ServiceDto>, { refreshInterval: 30_000 });
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function useAlerts(params?: {
  page?: number;
  status?: string;
  severity?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  return useSWR(`/alerts?${qs}`, pagedFetcher<AlertDto>, { refreshInterval: 15_000 });
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export function useWorkflows(params?: { page?: number; isActive?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
  return useSWR(`/workflows?${qs}`, pagedFetcher<WorkflowDto>, { refreshInterval: 60_000 });
}
